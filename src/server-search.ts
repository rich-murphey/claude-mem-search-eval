// Retrieval accuracy of claude-mem's own server search on LongMemEval-S,
// from the precomputed vectors: keyword only, vector only, and the shipped
// hybrid (reciprocal rank fusion of both).
//
//   bun src/server-search.ts --claude-mem ~/wt/claude-mem/<tree> \
//     --db postgres://postgres:t@127.0.0.1:55480/postgres [--models a,b] [--mode haystack|store]
//     [--manifest manifests/lme-s-100-v1.txt]
//
// Runs under bun because it imports claude-mem's TypeScript source. The
// database must be a throwaway pgvector Postgres: each model gets its own
// schema, dropped and rebuilt on every run.
//
// Modes:
//   haystack  each question is its own claude-mem project holding its ~47
//             sessions (LongMemEval's definition).
//   store     every session in one project, searched by every question:
//             closer to how one claude-mem user's store is searched, and
//             harder than the benchmark.
//
// A session is one observation; each of its turns is one embedding part,
// carrying the published vector and the model id claude-mem's LocalEmbedder
// gives that model. The vector-only run sends a query of stop words alone,
// which gives an empty text-search query, so the keyword leg returns nothing
// and the ranking is the vector leg's.
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import pg from 'pg';
import { distinctTurns, loadLongMemEvalS, LME_REVISION } from './longmemeval.ts';
import { BOOTSTRAP, loadVectors, metricsFor, readManifest, RELATIVE_ACCURACY_NOTE, renderTables, type Metrics } from './metrics.ts';
import { MODELS, modelByKey, type EvalModel } from './models.ts';

const LIMIT = 10;
const VECTOR_ONLY_QUERY = 'the';

const { values } = parseArgs({
  options: {
    'claude-mem': { type: 'string' },
    db: { type: 'string' },
    models: { type: 'string', default: MODELS.map(m => m.key).join(',') },
    mode: { type: 'string', default: 'haystack' },
    manifest: { type: 'string' },
    'min-relevant': { type: 'string', default: '1' },
    out: { type: 'string', default: 'out' },
    results: { type: 'string', default: 'results' },
  },
});
const claudeMem = resolve(values['claude-mem'] ?? '');
const mode = values.mode as 'haystack' | 'store';
if (mode !== 'haystack' && mode !== 'store') throw new Error(`--mode must be haystack or store, not ${mode}`);

// claude-mem's logger writes under its data directory; keep it out of the
// user's own.
process.env.CLAUDE_MEM_DATA_DIR ??= mkdtempSync(join(tmpdir(), 'claude-mem-search-eval-'));
const { bootstrapServerPostgresSchema } = await import(`${claudeMem}/src/storage/postgres/schema.ts`);
const { createPostgresStorageRepositories, PostgresObservationRepository } = await import(`${claudeMem}/src/storage/postgres/index.ts`);
const { LocalEmbedder } = await import(`${claudeMem}/src/services/vector/LocalEmbedder.ts`);
const { EMBEDDING_MODELS } = await import(`${claudeMem}/src/services/vector/models.ts`);

/** claude-mem's entry for an eval model, which must describe the same embedding. */
function claudeMemModel(model: EvalModel) {
  const entry = Object.values(EMBEDDING_MODELS as Record<string, any>).find(m => m.repo === model.repo);
  if (!entry || entry.maxTokens !== model.maxTokens || entry.queryPrefix !== model.queryPrefix
    || entry.passagePrefix !== model.passagePrefix || entry.dims !== model.dims) {
    throw new Error(`claude-mem at ${claudeMem} has no models.ts entry matching ${model.key}`);
  }
  return entry;
}

const allQuestions = await loadLongMemEvalS();
const manifest = values.manifest ? readManifest(values.manifest) : null;
// --min-relevant 5 keeps questions with at least five relevant sessions,
// where a perfect top 5 scores P@5 = 1 (with one, P@5 cannot exceed 0.2).
const minRelevant = Number(values['min-relevant']);
const questions = allQuestions.filter(q => !q.question_id.endsWith('_abs') && (!manifest || manifest.has(q.question_id))
  && new Set(q.answer_session_ids).size >= minRelevant);
const queryIndex = new Map(allQuestions.map((q, i) => [q.question_id, i]));
const rows = distinctTurns(allQuestions);
const sessionRows = new Map<string, number[]>();
rows.forEach((r, i) => {
  if (!sessionRows.has(r.sessionId)) sessionRows.set(r.sessionId, []);
  sessionRows.get(r.sessionId)!.push(i);
});

const admin = new pg.Client({ connectionString: values.db });
await admin.connect();
await admin.query('CREATE EXTENSION IF NOT EXISTS vector SCHEMA public');

const toLiteral = (v: Float32Array, row: number, dims: number) => {
  const parts = new Array<string>(dims);
  for (let d = 0; d < dims; d++) parts[d] = v[row * dims + d].toString();
  return `[${parts.join(',')}]`;
};

interface Loaded { pool: pg.Pool; teamId: string; projectOf: (questionId: string) => string; observationOf: (questionId: string, sessionId: string) => string }

async function load(model: EvalModel): Promise<Loaded> {
  const schema = `cmeval_${mode}_${model.key.replace(/-/g, '_')}`;
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new pg.Pool({ connectionString: values.db, options: `-c search_path=${schema},public`, max: 4 });
  pool.on('error', () => {});
  await bootstrapServerPostgresSchema(pool, model.dims);
  const storage = createPostgresStorageRepositories(pool);
  const team = await storage.teams.create({ name: 'longmemeval' });
  const modelId = new LocalEmbedder(claudeMemModel(model)).modelId;
  const turns = loadVectors(`${values.out}/${model.key}/turns.f16.bin`, model.dims);

  // Load without the HNSW index and build it once at the end, as a restore
  // would; bootstrapping again recreates exactly the server's index.
  await pool.query('DROP INDEX idx_observation_embeddings_hnsw');

  const projects = new Map<string, string>();
  const insertSessions = async (projectId: string, idPrefix: string, sessionIds: string[]) => {
    const ids = sessionIds.map(s => idPrefix + s);
    const contents = sessionIds.map(s => sessionRows.get(s)!.map(r => rows[r].content).join('\n\n'));
    await pool.query(
      `INSERT INTO observations (id, project_id, team_id, content)
       SELECT id, $2, $3, content FROM unnest($1::text[], $4::text[]) AS t(id, content)`,
      [ids, projectId, team.id, contents],
    );
    const obs: string[] = [], partNames: string[] = [], vectors: string[] = [];
    const flush = async () => {
      if (obs.length === 0) return;
      await pool.query(
        `INSERT INTO observation_embeddings (observation_id, project_id, team_id, part, model, embedding)
         SELECT o, $2, $3, p, $4, e::vector FROM unnest($1::text[], $5::text[], $6::text[]) AS t(o, p, e)`,
        [obs, projectId, team.id, modelId, partNames, vectors],
      );
      obs.length = partNames.length = vectors.length = 0;
    };
    for (const [k, sessionId] of sessionIds.entries()) {
      sessionRows.get(sessionId)!.forEach((row, turn) => {
        obs.push(ids[k]); partNames.push(`turn_${turn}`); vectors.push(toLiteral(turns, row, model.dims));
      });
      if (obs.length >= 2000) await flush();
    }
    await flush();
  };

  if (mode === 'haystack') {
    for (const q of questions) {
      const project = await storage.projects.create({ teamId: team.id, name: q.question_id });
      projects.set(q.question_id, project.id);
      // A haystack can list a session twice (README, Data); it is stored once.
      await insertSessions(project.id, `${q.question_id}:`, [...new Set(q.haystack_session_ids)]);
    }
  } else {
    const project = await storage.projects.create({ teamId: team.id, name: 'all' });
    const sessions = [...new Set(questions.flatMap(q => q.haystack_session_ids))];
    await insertSessions(project.id, '', sessions);
    for (const q of questions) projects.set(q.question_id, project.id);
  }
  await bootstrapServerPostgresSchema(pool, model.dims);
  await pool.query('ANALYZE');
  return {
    pool,
    teamId: team.id,
    projectOf: id => projects.get(id)!,
    observationOf: (questionId, sessionId) => (mode === 'haystack' ? `${questionId}:${sessionId}` : sessionId),
  };
}

const runs = new Map<string, Metrics[]>();
const timings: string[] = [];
const sessionOf = (observationId: string) => observationId.slice(observationId.indexOf(':') + 1);

for (const key of values.models!.split(',')) {
  const model = modelByKey(key);
  const modelId = new LocalEmbedder(claudeMemModel(model)).modelId;
  const queries = loadVectors(`${values.out}/${key}/queries.f16.bin`, model.dims);
  let started = performance.now();
  const loaded = await load(model);
  const loadSeconds = (performance.now() - started) / 1000;
  const repo = new PostgresObservationRepository(loaded.pool);

  const variants: [string, (q: typeof questions[number]) => object][] = [
    ['vector', q => ({ query: VECTOR_ONLY_QUERY, queryEmbedding: { vector: queries.subarray(queryIndex.get(q.question_id)! * model.dims, (queryIndex.get(q.question_id)! + 1) * model.dims), model: modelId } })],
    ['hybrid', q => ({ query: q.question, queryEmbedding: { vector: queries.subarray(queryIndex.get(q.question_id)! * model.dims, (queryIndex.get(q.question_id)! + 1) * model.dims), model: modelId } })],
  ];
  // Keyword search does not depend on the model; run it once, on the first.
  if (runs.size === 0) variants.unshift(['keyword', q => ({ query: q.question })]);

  started = performance.now();
  for (const [variant, input] of variants) {
    const results: Metrics[] = [];
    for (const q of questions) {
      const found = await repo.search({ projectId: loaded.projectOf(q.question_id), teamId: loaded.teamId, limit: LIMIT, ...input(q) });
      const ranked = found.map((o: { id: string }) => mode === 'haystack' ? sessionOf(o.id) : o.id);
      results.push(metricsFor(ranked, new Set(q.answer_session_ids)));
    }
    runs.set(variant === 'keyword' ? 'keyword only' : `${key} ${variant}`, results);
  }
  timings.push(`${key}: load and index ${loadSeconds.toFixed(0)}s, ${variants.length * questions.length} searches ${((performance.now() - started) / 1000).toFixed(0)}s`);
  await loaded.pool.end();
}
await admin.end();

const keys = values.models!.split(',');
const pairs: [string, string][] = [];
for (const key of keys) {
  pairs.push([`${key} hybrid`, `${key} vector`]);
  if (runs.has('keyword only')) pairs.push([`${key} hybrid`, 'keyword only']);
}
for (const key of keys.slice(1)) {
  pairs.push([`${key} vector`, `${keys[0]} vector`], [`${key} hybrid`, `${keys[0]} hybrid`]);
}
const md = `# LongMemEval-S through claude-mem's server search (${mode})\n\n` +
  `Dataset revision ${LME_REVISION}; ${questions.length} answerable questions` +
  (values.manifest ? ` from ${values.manifest}` : '') +
  (minRelevant > 1 ? ` with at least ${minRelevant} relevant sessions` : '') + '; ' +
  (mode === 'haystack'
    ? 'each question is its own claude-mem project holding its own haystack'
    : `all ${new Set(questions.flatMap(q => q.haystack_session_ids)).size} sessions in one project, searched by every question`) +
  `; a session is one observation and each turn one embedding part; top ${LIMIT} from ` +
  `PostgresObservationRepository.search; 95% intervals from ${BOOTSTRAP} bootstrap resamples over questions.\n\n` +
  `${RELATIVE_ACCURACY_NOTE}\n\n` +
  renderTables(runs, questions, pairs) +
  `\n## Timing\n\n${timings.map(t => `- ${t}`).join('\n')}\n`;
mkdirSync(values.results!, { recursive: true });
const name = (values.manifest ? `-${values.manifest.replace(/^.*\//, '').replace(/\.txt$/, '')}` : '') +
  (minRelevant > 1 ? `-min${minRelevant}` : '');
writeFileSync(`${values.results}/longmemeval-s-claude-mem-${mode}${name}.md`, md);
console.log(md);
