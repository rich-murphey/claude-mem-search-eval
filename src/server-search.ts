// Retrieval accuracy of claude-mem's own server search, from the precomputed
// vectors: keyword only, vector only, and the shipped hybrid (reciprocal rank
// fusion of both).
//
//   bun src/server-search.ts --claude-mem ~/wt/claude-mem/<tree> \
//     --db postgres://postgres:t@127.0.0.1:55480/postgres --dataset longmemeval-s \
//     [--models a,b] [--mode scoped|store] [--manifest manifests/x.txt] [--min-relevant 5] \
//     [--rankings-out dir]
//
// --rankings-out writes each run's top 10 per query as <dir>/<dataset>-<mode>-<run>.tsv,
// the form eval.ts --rankings reads, and each search's milliseconds beside it as .ms.
//
// Runs under bun because it imports claude-mem's TypeScript source. The
// database must be a throwaway pgvector Postgres: each dataset, mode and model
// gets its own schema, dropped and rebuilt on every run.
//
// Modes:
//   scoped  each query searches what the dataset gives it: LongMemEval's
//           per-question haystack, stored as that question's own claude-mem
//           project; otherwise the query's project.
//   store   every document in one project, searched by every query: closer to
//           one claude-mem user's store, and harder than the benchmark.
//
// A document is one observation; each of its parts is one embedding part,
// carrying the published vector and the model id claude-mem's LocalEmbedder
// gives that model. The vector-only run sends a query of stop words alone,
// which gives an empty text-search query, so the keyword leg returns nothing
// and the ranking is the vector leg's.
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import pg from 'pg';
import { loadDataset, rowsOf, type Doc, type Query } from './datasets.ts';
import { BOOTSTRAP, loadVectors, metricsFor, readManifest, renderTables, resultsHeader, type Metrics } from './metrics.ts';
import { MODELS, modelByKey, type EvalModel } from './models.ts';

const LIMIT = 10;
const VECTOR_ONLY_QUERY = 'the';

const { values } = parseArgs({
  options: {
    'claude-mem': { type: 'string' },
    db: { type: 'string' },
    dataset: { type: 'string', default: 'longmemeval-s' },
    // Default: every eval model that claude-mem's models.ts carries.
    models: { type: 'string' },
    mode: { type: 'string', default: 'scoped' },
    manifest: { type: 'string' },
    'min-relevant': { type: 'string', default: '1' },
    out: { type: 'string', default: 'out' },
    results: { type: 'string', default: 'results' },
    'rankings-out': { type: 'string' },
  },
});
const claudeMem = resolve(values['claude-mem'] ?? '');
const mode = values.mode as 'scoped' | 'store';
if (mode !== 'scoped' && mode !== 'store') throw new Error(`--mode must be scoped or store, not ${mode}`);

// claude-mem's logger writes under its data directory; keep it out of the
// user's own.
process.env.CLAUDE_MEM_DATA_DIR ??= mkdtempSync(join(tmpdir(), 'claude-mem-search-eval-'));
const { bootstrapServerPostgresSchema } = await import(`${claudeMem}/src/storage/postgres/schema.ts`);
const { createPostgresStorageRepositories, PostgresObservationRepository } = await import(`${claudeMem}/src/storage/postgres/index.ts`);
const { LocalEmbedder } = await import(`${claudeMem}/src/services/vector/LocalEmbedder.ts`);
const { EMBEDDING_MODELS } = await import(`${claudeMem}/src/services/vector/models.ts`);

/** claude-mem's models.ts entry describing the same embedding as an eval model, if any. */
function claudeMemEntry(model: EvalModel): any {
  return Object.values(EMBEDDING_MODELS as Record<string, any>).find(m => m.repo === model.repo
    && m.pooling === model.pooling && m.maxTokens === model.maxTokens && m.queryPrefix === model.queryPrefix
    && m.passagePrefix === model.passagePrefix && m.dims === model.dims);
}

/** claude-mem's model id for an eval model, whose models.ts entry must describe the same embedding. */
function claudeMemModelId(model: EvalModel): string {
  const entry = claudeMemEntry(model);
  if (!entry) throw new Error(`claude-mem at ${claudeMem} has no models.ts entry matching ${model.key}`);
  return new LocalEmbedder(entry).modelId;
}

const keys = values.models?.split(',') ?? MODELS.filter(m => claudeMemEntry(m)).map(m => m.key);

const dataset = await loadDataset(values.dataset!);
const manifest = values.manifest ? readManifest(values.manifest) : null;
// --min-relevant 5 keeps queries with at least five relevant documents, where
// a perfect top 5 scores P@5 = 1 (with one, P@5 cannot exceed 0.2).
const minRelevant = Number(values['min-relevant']);
const queries = dataset.queries.filter(q => (!manifest || manifest.has(q.id)) && q.relevant.size >= minRelevant);
const queryIndex = new Map(dataset.queries.map((q, i) => [q.id, i]));
const docsById = new Map(dataset.docs.map(d => [d.id, d]));
const docRows = new Map<string, number[]>();
rowsOf(dataset).forEach((r, i) => {
  if (!docRows.has(r.doc)) docRows.set(r.doc, []);
  docRows.get(r.doc)!.push(i);
});

const admin = new pg.Client({ connectionString: values.db });
await admin.connect();
await admin.query('CREATE EXTENSION IF NOT EXISTS vector SCHEMA public');

const toLiteral = (v: Float32Array, row: number, dims: number) => {
  const parts = new Array<string>(dims);
  for (let d = 0; d < dims; d++) parts[d] = v[row * dims + d].toString();
  return `[${parts.join(',')}]`;
};

/**
 * Projects to create, each with the documents it holds and the prefix that
 * makes their observation ids unique, and the project each query searches.
 */
function layout(): { projects: Map<string, { docs: Doc[]; prefix: string }>; projectOf: (q: Query) => string } {
  const projects = new Map<string, { docs: Doc[]; prefix: string }>();
  if (mode === 'store') {
    const used = new Set(queries.flatMap(q => q.candidates ?? []));
    const docs = queries[0].candidates ? dataset.docs.filter(d => used.has(d.id)) : dataset.docs;
    projects.set('all', { docs, prefix: '' });
    return { projects, projectOf: () => 'all' };
  }
  if (queries[0].candidates) {
    for (const q of queries) projects.set(q.id, { docs: q.candidates!.map(id => docsById.get(id)!), prefix: `${q.id}:` });
    return { projects, projectOf: q => q.id };
  }
  for (const d of dataset.docs) {
    if (!projects.has(d.project)) projects.set(d.project, { docs: [], prefix: '' });
    projects.get(d.project)!.docs.push(d);
  }
  return { projects, projectOf: q => q.project! };
}

async function load(model: EvalModel, modelId: string) {
  const schema = `cmeval_${dataset.key}_${mode}_${model.key}`.replace(/-/g, '_');
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new pg.Pool({ connectionString: values.db, options: `-c search_path=${schema},public`, max: 4 });
  pool.on('error', () => {});
  await bootstrapServerPostgresSchema(pool, 'on', model.dims);
  const storage = createPostgresStorageRepositories(pool);
  const team = await storage.teams.create({ name: dataset.key });
  const rows = loadVectors(`${values.out}/${dataset.key}/${model.key}/rows.f16.bin`, model.dims);

  // Load without the HNSW index and build it once at the end, as a restore
  // would; bootstrapping again recreates exactly the server's index.
  await pool.query('DROP INDEX idx_observation_embeddings_hnsw');

  const { projects, projectOf } = layout();
  const projectIds = new Map<string, string>();
  for (const [name, { docs, prefix }] of projects) {
    const project = await storage.projects.create({ teamId: team.id, name });
    projectIds.set(name, project.id);
    for (let start = 0; start < docs.length; start += 500) {
      const batch = docs.slice(start, start + 500);
      await pool.query(
        `INSERT INTO observations (id, project_id, team_id, content)
         SELECT id, $2, $3, content FROM unnest($1::text[], $4::text[]) AS t(id, content)`,
        [batch.map(d => prefix + d.id), project.id, team.id, batch.map(d => d.parts.join('\n\n'))],
      );
      const obs: string[] = [], partNames: string[] = [], vectors: string[] = [];
      for (const d of batch) {
        docRows.get(d.id)!.forEach((row, part) => {
          obs.push(prefix + d.id); partNames.push(`part_${part}`); vectors.push(toLiteral(rows, row, model.dims));
        });
      }
      await pool.query(
        `INSERT INTO observation_embeddings (observation_id, project_id, team_id, part, model, embedding)
         SELECT o, $2, $3, p, $4, e::vector FROM unnest($1::text[], $5::text[], $6::text[]) AS t(o, p, e)`,
        [obs, project.id, team.id, modelId, partNames, vectors],
      );
    }
  }
  await bootstrapServerPostgresSchema(pool, 'on', model.dims);
  await pool.query('ANALYZE');
  return { pool, teamId: team.id, projectIdOf: (q: Query) => projectIds.get(projectOf(q))! };
}

const runs = new Map<string, Metrics[]>();
const timings: string[] = [];
const docOf = (observationId: string) => observationId.slice(observationId.indexOf(':') + 1);

for (const key of keys) {
  const model = modelByKey(key);
  const modelId = claudeMemModelId(model);
  const queryVectors = loadVectors(`${values.out}/${dataset.key}/${key}/queries.f16.bin`, model.dims);
  const vectorOf = (q: Query) => {
    const i = queryIndex.get(q.id)!;
    return { vector: queryVectors.subarray(i * model.dims, (i + 1) * model.dims), model: modelId };
  };
  let started = performance.now();
  const loaded = await load(model, modelId);
  const loadSeconds = (performance.now() - started) / 1000;
  const repo = new PostgresObservationRepository(loaded.pool);

  const variants: [string, (q: Query) => object][] = [
    ['vector', q => ({ query: VECTOR_ONLY_QUERY, queryEmbedding: vectorOf(q) })],
    ['hybrid', q => ({ query: q.text, queryEmbedding: vectorOf(q) })],
  ];
  // Keyword search does not depend on the model; run it once, on the first.
  if (runs.size === 0) variants.unshift(['keyword', q => ({ query: q.text })]);

  started = performance.now();
  for (const [variant, input] of variants) {
    const results: Metrics[] = [], ranked: string[] = [], ms: string[] = [];
    for (const q of queries) {
      const t0 = performance.now();
      const found = await repo.search({ projectId: loaded.projectIdOf(q), teamId: loaded.teamId, limit: LIMIT, ...input(q) });
      ms.push(`${q.id}\t${(performance.now() - t0).toFixed(3)}`);
      const docs = found.map((o: { id: string }) => docOf(o.id));
      ranked.push([q.id, ...docs].join('\t'));
      results.push(metricsFor(docs, q.relevant, q.judged));
    }
    const label = variant === 'keyword' ? 'keyword only' : `${key} ${variant}`;
    runs.set(label, results);
    if (values['rankings-out']) {
      mkdirSync(values['rankings-out'], { recursive: true });
      const base = `${values['rankings-out']}/${dataset.key}-${mode}-${label.replace(/ /g, '-')}`;
      writeFileSync(`${base}.tsv`, ranked.join('\n') + '\n');
      writeFileSync(`${base}.ms`, ms.join('\n') + '\n');
    }
  }
  timings.push(`${key}: load and index ${loadSeconds.toFixed(0)}s, ${variants.length * queries.length} searches ${((performance.now() - started) / 1000).toFixed(0)}s`);
  await loaded.pool.end();
}
await admin.end();

const pairs: [string, string][] = [];
for (const key of keys) {
  pairs.push([`${key} hybrid`, `${key} vector`]);
  if (runs.has('keyword only')) pairs.push([`${key} hybrid`, 'keyword only']);
}
for (const key of keys.slice(1)) {
  pairs.push([`${key} vector`, `${keys[0]} vector`], [`${key} hybrid`, `${keys[0]} hybrid`]);
}
const scope = mode === 'store'
  ? 'every document in one claude-mem project, searched by every query'
  : queries[0].candidates ? 'each query is its own claude-mem project holding its own haystack' : 'each query searches its claude-mem project';
const md = resultsHeader(`${dataset.key} through claude-mem's server search (${mode})`, dataset,
  `${queries.length} queries` +
  (values.manifest ? ` from ${values.manifest}` : '') +
  (minRelevant > 1 ? ` with at least ${minRelevant} relevant documents` : '') +
  `; ${scope}; a document is one observation and each part one embedding part; top ${LIMIT} from ` +
  `PostgresObservationRepository.search; 95% intervals from ${BOOTSTRAP} bootstrap resamples over queries.`) +
  renderTables(runs, queries, pairs) +
  `\n## Timing\n\n${timings.map(t => `- ${t}`).join('\n')}\n`;
mkdirSync(values.results!, { recursive: true });
const name = (values.manifest ? `-${values.manifest.replace(/^.*\//, '').replace(/\.txt$/, '')}` : '') +
  (minRelevant > 1 ? `-min${minRelevant}` : '');
writeFileSync(`${values.results}/${dataset.key}-server-${mode}${name}.md`, md);
console.log(md);
