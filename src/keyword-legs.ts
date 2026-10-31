// The keyword leg of claude-mem's hybrid search, with its bm25 scores, for
// offline fusion experiments (src/model-agnostic.ts).
//
//   node src/keyword-legs.ts --db postgres://postgres:t@127.0.0.1:55491/postgres \
//     --dataset longmemeval-s --mode store
//
// Writes out/<dataset>/keyword-<mode>.jsonl: per query, the ids and bm25
// scores of the up to 100 observations the keyword leg ranks, in its order.
// The leg is the one PostgresObservationRepository.searchHybrid runs on
// pg_textsearch (claude-mem src/storage/postgres/observations.ts): any query
// term matches, ordered by `content <@> to_bm25query(query, index)` over an
// english-config bm25 index, the 100 first taken and the non-matching dropped.
// The table holds what server-search.ts loads for the same mode, so index-wide
// statistics (document count, lengths, idf) are the same. Needs a throwaway
// Postgres with pg_textsearch preloaded; each dataset and mode gets its own
// schema, dropped and rebuilt.
import { mkdirSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import pg from 'pg';
import { loadDataset, type Doc, type Query } from './datasets.ts';

const LEG = 100;
const { values } = parseArgs({
  options: {
    db: { type: 'string' },
    dataset: { type: 'string', default: 'longmemeval-s' },
    mode: { type: 'string', default: 'store' },
    out: { type: 'string', default: 'out' },
  },
});
const mode = values.mode as 'scoped' | 'store';
const dataset = await loadDataset(values.dataset!);
const queries = dataset.queries;

// The same projects server-search.ts creates for this mode.
const projects = new Map<string, { docs: Doc[]; prefix: string }>();
let projectOf: (q: Query) => string;
if (mode === 'store') {
  const used = new Set(queries.flatMap(q => q.candidates ?? []));
  projects.set('all', { docs: queries[0].candidates ? dataset.docs.filter(d => used.has(d.id)) : dataset.docs, prefix: '' });
  projectOf = () => 'all';
} else if (queries[0].candidates) {
  const byId = new Map(dataset.docs.map(d => [d.id, d]));
  for (const q of queries) projects.set(q.id, { docs: q.candidates!.map(id => byId.get(id)!), prefix: `${q.id}:` });
  projectOf = q => q.id;
} else {
  for (const d of dataset.docs) {
    if (!projects.has(d.project)) projects.set(d.project, { docs: [], prefix: '' });
    projects.get(d.project)!.docs.push(d);
  }
  projectOf = q => q.project!;
}

const client = new pg.Client({ connectionString: values.db });
await client.connect();
const schema = `kw_${dataset.key}_${mode}`.replace(/-/g, '_');
await client.query('CREATE EXTENSION IF NOT EXISTS pg_textsearch SCHEMA public');
await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE; CREATE SCHEMA ${schema}; SET search_path = ${schema}, public`);
await client.query(`CREATE TABLE observations (
  id text PRIMARY KEY, project text NOT NULL, content text NOT NULL,
  content_search tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED)`);
let t0 = performance.now();
for (const [name, { docs, prefix }] of projects) {
  for (let i = 0; i < docs.length; i += 500) {
    const batch = docs.slice(i, i + 500);
    await client.query(
      `INSERT INTO observations (id, project, content) SELECT id, $2, c FROM unnest($1::text[], $3::text[]) AS t(id, c)`,
      [batch.map(d => prefix + d.id), name, batch.map(d => d.parts.join('\n\n'))],
    );
  }
}
await client.query(`CREATE INDEX idx_observations_content_bm25 ON observations USING bm25 (content) WITH (text_config = 'english')`);
await client.query('CREATE INDEX ON observations (project); ANALYZE observations');
console.error(`${dataset.key} ${mode}: loaded and indexed in ${((performance.now() - t0) / 1000).toFixed(0)}s`);

const anyTerm = `(SELECT string_agg(quote_literal(lexeme), ' | ')::tsquery
  FROM unnest(tsvector_to_array(to_tsvector('english', $2))) AS lexeme)`;
const order = `content OPERATOR(public.<@>) public.to_bm25query($2, 'idx_observations_content_bm25')`;
const lines: string[] = [];
// Per query, the leg as claude-mem runs it (ids only), then with its scores:
// naming the score outside the index scan rescores each row.
const msPlain: number[] = [], msScored: number[] = [];
t0 = performance.now();
for (const q of queries) {
  let t = performance.now();
  await client.query(
    `SELECT id FROM (
       SELECT id, content_search @@ ${anyTerm} AS matches_query
       FROM observations WHERE project = $1
       ORDER BY ${order}, id LIMIT ${LEG}
     ) AS candidates WHERE matches_query`,
    [projectOf(q), q.text],
  );
  msPlain.push(performance.now() - t);
  t = performance.now();
  const { rows } = await client.query(
    `SELECT id, -(${order}) AS score FROM (
       SELECT id, content, content_search @@ ${anyTerm} AS matches_query
       FROM observations WHERE project = $1
       ORDER BY ${order}, id LIMIT ${LEG}
     ) AS candidates WHERE matches_query`,
    [projectOf(q), q.text],
  );
  msScored.push(performance.now() - t);
  const prefix = projects.get(projectOf(q))!.prefix;
  lines.push(JSON.stringify({ q: q.id, ids: rows.map(r => r.id.slice(prefix.length)), scores: rows.map(r => Number(r.score)) }));
}
const p = (v: number[], f: number) => [...v].sort((a, b) => a - b)[Math.floor(v.length * f)].toFixed(1);
console.error(`${dataset.key} ${mode}: ${queries.length} keyword legs in ${((performance.now() - t0) / 1000).toFixed(0)}s; ` +
  `ms p50/p95 ids only ${p(msPlain, 0.5)}/${p(msPlain, 0.95)}, with bm25 scores ${p(msScored, 0.5)}/${p(msScored, 0.95)}`);
await client.query(`DROP SCHEMA ${schema} CASCADE`);
await client.end();
mkdirSync(`${values.out}/${dataset.key}`, { recursive: true });
writeFileSync(`${values.out}/${dataset.key}/keyword-${mode}.jsonl`, lines.join('\n') + '\n');
