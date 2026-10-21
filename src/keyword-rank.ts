// Keyword ranking in claude-mem's server search: Postgres ts_rank, as shipped,
// against bm25, the ranking SQLite FTS5 gives the worker. No vectors.
//
//   bun src/keyword-rank.ts --claude-mem ~/wt/claude-mem/<tree> \
//     --db postgres://postgres:pw@127.0.0.1:55440/cm --dataset longmemeval-s \
//     [--mode scoped|store] [--manifest manifests/x.txt]
//
// Runs under bun because it imports claude-mem's TypeScript source. The
// database must be throwaway: each dataset and mode gets its own schema,
// dropped and rebuilt on every run. With pg_textsearch installed (it is in
// timescale/timescaledb-ha:pg17-oss) its bm25 index is measured too.
//
// Runs, each the top 10 within the query's claude-mem project:
//   ts_rank            PostgresObservationRepository.search: every term, or
//                      any term when every term matches nothing (3+ terms)
//   bm25               the same matched rows, ranked by bm25 instead
//   ts_rank, any term  every row holding any query term, by ts_rank
//   bm25, any term     the same rows, by bm25
//   pg_textsearch      ORDER BY content <@> to_bm25query(...), one bm25 index
//                      over all projects, so its IDF is the whole table's
//
// With --ts-rank-checkout, a sweep instead, each run the top 10 as above:
//   ts_rank              search() of that checkout, which ranks by ts_rank
//   bm25                 bm25 in SQL over every row holding any query term,
//                        with each project's document frequencies counted once
//                        at load rather than on every query
//   pg_textsearch bm25   search() of --claude-mem, which ranks by pg_textsearch
//   plain pg_textsearch  ORDER BY content <@> to_bm25query(...) alone, which
//                        also returns rows with no query term, scored 0, last
//
// bm25 here is FTS5's: k1 = 1.2, b = 0.75, IDF ln((N − df + 0.5)/(df + 0.5) + 1),
// over the english tsvector claude-mem stores (content_search). N, df and the
// average length are the project's; a row's length is its token count as the
// tsvector records it (stop words excluded, positions capped at 16383).
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import pg from 'pg';
import { loadDataset, type Doc, type Query } from './datasets.ts';
import { metricsFor, readManifest, renderTables, resultsHeader, type Metrics } from './metrics.ts';

const LIMIT = 10;
// Enough to return every row the shipped search matches, so bm25 reranks the same set.
const ALL_MATCHES = 100_000;

const { values } = parseArgs({
  options: {
    'claude-mem': { type: 'string' },
    'ts-rank-checkout': { type: 'string' },
    db: { type: 'string' },
    dataset: { type: 'string', default: 'longmemeval-s' },
    mode: { type: 'string', default: 'scoped' },
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
const tsRankCheckout = values['ts-rank-checkout'] ? resolve(values['ts-rank-checkout']) : null;
const TsRankRepository = tsRankCheckout
  ? (await import(`${tsRankCheckout}/src/storage/postgres/index.ts`)).PostgresObservationRepository
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

const schema = `cmkw_${dataset.key}_${mode}`.replace(/-/g, '_');
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
// Each row's length, and each project's row count and average length.
await pool.query(`
  CREATE TABLE kw_len AS
  SELECT id, project_id, coalesce((SELECT sum(cardinality(p.positions)) FROM unnest(content_search) p), 0)::float8 AS dl
  FROM observations`);
await pool.query('CREATE UNIQUE INDEX ON kw_len (id)');
const stats = new Map<string, { n: number; avgdl: number }>();
for (const r of (await pool.query(`SELECT project_id, count(*)::float8 AS n, avg(dl)::float8 AS avgdl FROM kw_len GROUP BY project_id`)).rows) {
  stats.set(r.project_id, { n: r.n, avgdl: r.avgdl });
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
// Each project's document frequency per lexeme, for the sweep's bm25.
if (TsRankRepository) {
  await pool.query(`
    CREATE TABLE kw_df AS
    SELECT project_id, lexeme, count(*)::float8 AS df
    FROM observations, unnest(tsvector_to_array(content_search)) AS lexeme
    GROUP BY project_id, lexeme`);
  await pool.query('CREATE UNIQUE INDEX ON kw_df (project_id, lexeme)');
}
await pool.query('ANALYZE');
const loadSeconds = (performance.now() - started) / 1000;

const repo = new PostgresObservationRepository(pool);
const projectIdOf = (q: Query) => projectIds.get(projectOf(q))!;

// bm25 over the query's distinct english lexemes. $4 lists the rows to rank;
// null ranks every row holding any query term.
const BM25_SQL = `
  WITH q AS (SELECT DISTINCT lexeme FROM unnest(tsvector_to_array(to_tsvector('english', $3))) AS lexeme),
  scope AS (SELECT o.id, o.content_search FROM observations o WHERE o.project_id = $1 AND o.team_id = $2),
  df AS (
    SELECT q.lexeme, count(s.id)::float8 AS df
    FROM q LEFT JOIN scope s ON s.content_search @@ quote_literal(q.lexeme)::tsquery
    GROUP BY q.lexeme
  ),
  cand AS (
    SELECT s.id, s.content_search FROM scope s
    WHERE CASE WHEN $4::text[] IS NULL
      THEN s.content_search @@ (SELECT string_agg(quote_literal(lexeme), ' | ')::tsquery FROM q)
      ELSE s.id = ANY($4::text[]) END
  ),
  tf AS (
    SELECT c.id, v.lexeme, cardinality(v.positions)::float8 AS tf
    FROM cand c, unnest(c.content_search) v
    WHERE v.lexeme IN (SELECT lexeme FROM q)
  )
  SELECT tf.id,
    sum(ln(($5::float8 - df.df + 0.5) / (df.df + 0.5) + 1)
        * tf.tf * 2.2 / (tf.tf + 1.2 * (0.25 + 0.75 * l.dl / $6::float8))) AS score
  FROM tf JOIN df USING (lexeme) JOIN kw_len l ON l.id = tf.id
  GROUP BY tf.id
  ORDER BY score DESC, tf.id
  LIMIT ${LIMIT}`;

// As BM25_SQL over every row holding any query term, with document
// frequencies from kw_df.
const BM25_CACHED_SQL = `
  WITH q AS (SELECT DISTINCT lexeme FROM unnest(tsvector_to_array(to_tsvector('english', $3))) AS lexeme),
  df AS (
    SELECT q.lexeme, coalesce(d.df, 0) AS df
    FROM q LEFT JOIN kw_df d ON d.project_id = $1 AND d.lexeme = q.lexeme
  ),
  cand AS (
    SELECT o.id, o.content_search FROM observations o
    WHERE o.project_id = $1 AND o.team_id = $2
      AND o.content_search @@ (SELECT string_agg(quote_literal(lexeme), ' | ')::tsquery FROM q)
  ),
  tf AS (
    SELECT c.id, v.lexeme, cardinality(v.positions)::float8 AS tf
    FROM cand c, unnest(c.content_search) v
    WHERE v.lexeme IN (SELECT lexeme FROM q)
  )
  SELECT tf.id,
    sum(ln(($4::float8 - df.df + 0.5) / (df.df + 0.5) + 1)
        * tf.tf * 2.2 / (tf.tf + 1.2 * (0.25 + 0.75 * l.dl / $5::float8))) AS score
  FROM tf JOIN df USING (lexeme) JOIN kw_len l ON l.id = tf.id
  GROUP BY tf.id
  ORDER BY score DESC, tf.id
  LIMIT ${LIMIT}`;

const TS_RANK_ANY_SQL = `
  WITH q AS (
    SELECT string_agg(quote_literal(lexeme), ' | ')::tsquery AS tsq
    FROM unnest(tsvector_to_array(to_tsvector('english', $3))) AS lexeme
  )
  SELECT o.id FROM observations o CROSS JOIN q
  WHERE o.project_id = $1 AND o.team_id = $2 AND o.content_search @@ q.tsq
  ORDER BY ts_rank(o.content_search, q.tsq) DESC, o.id
  LIMIT ${LIMIT}`;

const TEXTSEARCH_SQL = `
  SELECT id FROM observations
  WHERE project_id = $1 AND team_id = $2
  ORDER BY content <@> to_bm25query($3, '${bm25Index}'), id
  LIMIT ${LIMIT}`;

const bm25 = async (q: Query, ids: string[] | null) => {
  const s = stats.get(projectIdOf(q))!;
  return (await pool.query(BM25_SQL, [projectIdOf(q), team.id, q.text, ids, s.n, s.avgdl])).rows.map(r => r.id as string);
};
const shipped = async (q: Query, limit: number) =>
  (await repo.search({ projectId: projectIdOf(q), teamId: team.id, query: q.text, limit })).map((o: { id: string }) => o.id);

const tsRankRepo = TsRankRepository ? new TsRankRepository(pool) : null;
const textsearchPlain = async (q: Query) =>
  (await pool.query(TEXTSEARCH_SQL, [projectIdOf(q), team.id, q.text])).rows.map(r => r.id as string);
const variants: [string, (q: Query) => Promise<string[]>][] = tsRankRepo ? [
  ['ts_rank', async q => (await tsRankRepo.search({ projectId: projectIdOf(q), teamId: team.id, query: q.text, limit: LIMIT })).map((o: { id: string }) => o.id)],
  ['bm25', async q => {
    const s = stats.get(projectIdOf(q))!;
    return (await pool.query(BM25_CACHED_SQL, [projectIdOf(q), team.id, q.text, s.n, s.avgdl])).rows.map(r => r.id as string);
  }],
  ...(textsearch ? [
    ['pg_textsearch bm25', (q: Query) => shipped(q, LIMIT)],
    ['plain pg_textsearch', textsearchPlain],
  ] as [string, (q: Query) => Promise<string[]>][] : []),
] : [
  ['ts_rank', q => shipped(q, LIMIT)],
  ['bm25', async q => { const ids = await shipped(q, ALL_MATCHES); return ids.length ? bm25(q, ids) : []; }],
  ['ts_rank, any term', async q => (await pool.query(TS_RANK_ANY_SQL, [projectIdOf(q), team.id, q.text])).rows.map(r => r.id)],
  ['bm25, any term', q => bm25(q, null)],
];
if (textsearch && !tsRankRepo) variants.push(['pg_textsearch', textsearchPlain]);

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
await admin.end();

const pairs: [string, string][] = variants.slice(1).map(([label]) => [label, 'ts_rank']);
if (!tsRankRepo) pairs.push(['bm25, any term', 'ts_rank, any term']);
const scope = mode === 'store'
  ? 'every document in one claude-mem project, searched by every query'
  : queries[0].candidates ? 'each query is its own claude-mem project holding its own haystack' : 'each query searches its claude-mem project';
const md = resultsHeader(`${dataset.key}: server keyword ranking, ${tsRankRepo ? 'keyword only, no vectors' : 'ts_rank and bm25'} (${mode})`, dataset,
  `${queries.length} queries` + (values.manifest ? ` from ${values.manifest}` : '') +
  `; ${scope}; a document is one observation; top ${LIMIT}; no vectors. ` +
  `Runs and the bm25 formula are described at the top of src/keyword-rank.ts.`) +
  renderTables(runs, queries, pairs) +
  `\n## Timing\n\n${timings.map(t => `- ${t}`).join('\n')}\n`;
mkdirSync(values.results!, { recursive: true });
const name = values.manifest ? `-${values.manifest.replace(/^.*\//, '').replace(/\.txt$/, '')}` : '';
writeFileSync(`${values.results}/${dataset.key}-keyword-${tsRankRepo ? 'sweep' : 'rank'}-${mode}${name}.md`, md);
console.log(md);
