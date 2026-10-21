// Server keyword search before and after a change, keyword only, no vectors:
//
//   bun src/keyword-compare.ts --claude-mem ~/wt/claude-mem/<after> \
//     --before ~/wt/claude-mem/<before> [--widened ~/wt/claude-mem/<tree>] --db postgres://... --dataset longmemeval-s \
//     [--mode store|scoped] [--manifest manifests/x.txt]
//
// The schema is bootstrapped by --claude-mem, which may create a pg_textsearch
// bm25 index. Runs, each the top 10 within the query's claude-mem project:
//   before                 search() of --before
//   widened, ts_rank       search() of --widened, if given: every term, widened
//                          to any term when that finds nothing and the query
//                          has 3+ terms, as the worker does
//   after, ts_rank         search() of --claude-mem through a pool its startup
//                          detection never saw, so it ranks as it would
//                          without pg_textsearch
//   after, pg_textsearch   search() of --claude-mem through the bootstrapped
//                          pool, which ranks by bm25 where the index exists
//   bare pg_textsearch     SELECT id ... ORDER BY content <@> to_bm25query(...)
//                          alone, for reference
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import pg from 'pg';
import { loadDataset, type Doc, type Query } from './datasets.ts';
import { metricsFor, readManifest, renderTables, resultsHeader, type Metrics } from './metrics.ts';

const LIMIT = 10;

const { values } = parseArgs({
  options: {
    'claude-mem': { type: 'string' },
    before: { type: 'string' },
    widened: { type: 'string' },
    db: { type: 'string' },
    dataset: { type: 'string', default: 'longmemeval-s' },
    mode: { type: 'string', default: 'store' },
    manifest: { type: 'string' },
    results: { type: 'string', default: 'results' },
  },
});
const claudeMem = resolve(values['claude-mem'] ?? '');
const mode = values.mode as 'scoped' | 'store';
if (mode !== 'scoped' && mode !== 'store') throw new Error(`--mode must be scoped or store, not ${mode}`);

process.env.CLAUDE_MEM_DATA_DIR ??= mkdtempSync(join(tmpdir(), 'claude-mem-search-eval-'));
const { bootstrapServerPostgresSchema } = await import(`${claudeMem}/src/storage/postgres/schema.ts`);
const { createPostgresStorageRepositories, PostgresObservationRepository } = await import(`${claudeMem}/src/storage/postgres/index.ts`);
const BeforeRepository = (await import(`${resolve(values.before ?? '')}/src/storage/postgres/index.ts`)).PostgresObservationRepository;
const WidenedRepository = values.widened
  ? (await import(`${resolve(values.widened)}/src/storage/postgres/index.ts`)).PostgresObservationRepository
  : null;

const dataset = await loadDataset(values.dataset!);
const manifest = values.manifest ? readManifest(values.manifest) : null;
const queries = dataset.queries.filter(q => !manifest || manifest.has(q.id));
const docsById = new Map(dataset.docs.map(d => [d.id, d]));

/** As server-search.ts: the projects to create and the project each query searches. */
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

const admin = new pg.Client({ connectionString: values.db });
await admin.connect();
await admin.query('CREATE EXTENSION IF NOT EXISTS vector SCHEMA public');
const textsearch = (await admin.query(`SELECT 1 FROM pg_available_extensions WHERE name = 'pg_textsearch'`)).rowCount! > 0;
if (textsearch) await admin.query('CREATE EXTENSION IF NOT EXISTS pg_textsearch SCHEMA public');

const schema = `cmkc_${dataset.key}_${mode}`.replace(/-/g, '_');
await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
await admin.query(`CREATE SCHEMA ${schema}`);
const pool = new pg.Pool({ connectionString: values.db, options: `-c search_path=${schema},public`, max: 4 });
pool.on('error', () => {});
await bootstrapServerPostgresSchema(pool);
const storage = createPostgresStorageRepositories(pool);
const team = await storage.teams.create({ name: dataset.key });

let started = performance.now();
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
  }
}
// A claude-mem whose schema bootstrap already made a bm25 index over content
// is measured with that one: pg_textsearch refuses a query naming one index
// when the planner scans another over the same column.
const serverBm25 = textsearch
  ? (await pool.query(`SELECT c.relname FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid JOIN pg_am a ON a.oid = c.relam
                       WHERE a.amname = 'bm25' AND i.indrelid = 'observations'::regclass`)).rows[0]?.relname as string | undefined
  : undefined;
const bm25Index = serverBm25 ?? 'kw_bm25';
if (textsearch && !serverBm25) await pool.query(`CREATE INDEX kw_bm25 ON observations USING bm25 (content) WITH (text_config = 'english')`);
await pool.query('ANALYZE');
const loadSeconds = (performance.now() - started) / 1000;

const repo = new PostgresObservationRepository(pool);
const projectIdOf = (q: Query) => projectIds.get(projectOf(q))!;

const TEXTSEARCH_SQL = `
  SELECT id FROM observations
  WHERE project_id = $1 AND team_id = $2
  ORDER BY content <@> to_bm25query($3, '${bm25Index}'), id
  LIMIT ${LIMIT}`;

// A second pool that bootstrap's detection never saw: the after checkout's
// search() through it takes the path a server without pg_textsearch takes.
const undetected = new pg.Pool({ connectionString: values.db, options: `-c search_path=${schema},public`, max: 4 });
undetected.on('error', () => {});
const search = (r: { search: Function }) => async (q: Query) =>
  (await r.search({ projectId: projectIdOf(q), teamId: team.id, query: q.text, limit: LIMIT })).map((o: { id: string }) => o.id);
const variants: [string, (q: Query) => Promise<string[]>][] = [
  ['before', search(new BeforeRepository(pool))],
  ...(WidenedRepository ? [['widened, ts_rank', search(new WidenedRepository(pool))]] as [string, (q: Query) => Promise<string[]>][] : []),
  ['after, ts_rank', search(new PostgresObservationRepository(undetected))],
  ['after, pg_textsearch', search(repo)],
  ...(textsearch ? [['bare pg_textsearch', async (q: Query) =>
    (await pool.query(TEXTSEARCH_SQL, [projectIdOf(q), team.id, q.text])).rows.map(r => r.id as string)]] as [string, (q: Query) => Promise<string[]>][] : []),
];

const docOf = (observationId: string) => observationId.slice(observationId.indexOf(':') + 1);
const runs = new Map<string, Metrics[]>();
const timings: string[] = [`load and index ${loadSeconds.toFixed(0)}s`];
for (const [label, rank] of variants) {
  started = performance.now();
  const results: Metrics[] = [];
  for (const q of queries) results.push(metricsFor((await rank(q)).map(docOf), q.relevant, q.judged));
  runs.set(label, results);
  const seconds = (performance.now() - started) / 1000;
  timings.push(`${label}: ${queries.length} searches ${seconds.toFixed(1)}s, ${(seconds * 1000 / queries.length).toFixed(1)} ms per query`);
}
await pool.end();
await undetected.end();
await admin.end();

const pairs: [string, string][] = variants.slice(1).map(([label]) => [label, 'before']);
const scope = mode === 'store'
  ? 'every document in one claude-mem project, searched by every query'
  : queries[0].candidates ? 'each query is its own claude-mem project holding its own haystack' : 'each query searches its claude-mem project';
const md = resultsHeader(`${dataset.key}: server keyword search before and after, keyword only, no vectors (${mode})`, dataset,
  `${queries.length} queries` + (values.manifest ? ` from ${values.manifest}` : '') +
  `; ${scope}; a document is one observation; top ${LIMIT}; no vectors. ` +
  `Runs are described at the top of src/keyword-compare.ts.`) +
  renderTables(runs, queries, pairs) +
  `\n## Timing\n\n${timings.map(t => `- ${t}`).join('\n')}\n`;
mkdirSync(values.results!, { recursive: true });
const name = values.manifest ? `-${values.manifest.replace(/^.*\//, '').replace(/\.txt$/, '')}` : '';
writeFileSync(`${values.results}/${dataset.key}-keyword-compare-${mode}${name}.md`, md);
console.log(md);
