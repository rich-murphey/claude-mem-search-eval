// Retrieval accuracy of claude-mem's worker search: the local install's SQLite
// store, its FTS5 keyword search, and its Chroma search by meaning
// (chroma-mcp's default all-MiniLM-L6-v2, embedded by Chroma itself), through
// SearchManager.search, which mem_search calls.
//
//   bun src/worker-search.ts --claude-mem ~/wt/claude-mem/<tree> --dataset longmemeval-s
//     [--mode scoped|store] [--manifest manifests/x.txt] [--min-relevant 5] [--keyword-only]
//
// Runs under bun (bun:sqlite, claude-mem's TypeScript source) with a fresh
// claude-mem data directory, so chroma-mcp, launched through uvx as the worker
// launches it, starts empty. Chroma embeds every document part itself, which
// takes as long as embedding them with the server's model. Modes as in
// server-search.ts.
//
// Each document is one observation whose facts are its parts, so Chroma holds
// one document per part (obs_<id>_fact_<n>) and FTS5 indexes the parts, as the
// server holds one embedding part per part. The observation's title is the
// document id, which maps results back. Observations are stored with the
// current time, inside the worker's 90-day recency window.
//
// Runs, both through SearchManager.search (results in relevance order, as
// mem_search requests them; SearchOrchestrator alone defaults to date order):
//   worker keyword  without Chroma (CLAUDE_MEM_CHROMA_ENABLED=false): FTS5, AND
//                   of the query's terms, widened to OR when that finds
//                   nothing and the query has 3+ terms; CJK queries match by
//                   substring.
//   worker search   with Chroma: Chroma's nearest documents, SQLite only for
//                   an empty result.
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { loadDataset, type Doc, type Query } from './datasets.ts';
import { BOOTSTRAP, metricsFor, readManifest, renderTables, resultsHeader, type Metrics } from './metrics.ts';

const LIMIT = 10;

const { values } = parseArgs({
  options: {
    'claude-mem': { type: 'string' },
    dataset: { type: 'string', default: 'longmemeval-s' },
    mode: { type: 'string', default: 'scoped' },
    manifest: { type: 'string' },
    'min-relevant': { type: 'string', default: '1' },
    'keyword-only': { type: 'boolean', default: false },
    results: { type: 'string', default: 'results' },
  },
});
const claudeMem = resolve(values['claude-mem'] ?? '');
const mode = values.mode as 'scoped' | 'store';
if (mode !== 'scoped' && mode !== 'store') throw new Error(`--mode must be scoped or store, not ${mode}`);

process.env.CLAUDE_MEM_DATA_DIR = mkdtempSync(join(tmpdir(), 'claude-mem-search-eval-worker-'));
const { SessionStore } = await import(`${claudeMem}/src/services/sqlite/SessionStore.ts`);
const { SessionSearch } = await import(`${claudeMem}/src/services/sqlite/SessionSearch.ts`);
const { ChromaSync } = await import(`${claudeMem}/src/services/sync/ChromaSync.ts`);
const { ChromaMcpManager } = await import(`${claudeMem}/src/services/sync/ChromaMcpManager.ts`);
const { SearchManager } = await import(`${claudeMem}/src/services/worker/SearchManager.ts`);
const { FormattingService } = await import(`${claudeMem}/src/services/worker/FormattingService.ts`);
const { TimelineService } = await import(`${claudeMem}/src/services/worker/TimelineService.ts`);

const dataset = await loadDataset(values.dataset!);
const manifest = values.manifest ? readManifest(values.manifest) : null;
// --min-relevant 5 keeps queries with at least five relevant documents, where
// a perfect top 5 scores P@5 = 1 (with one, P@5 cannot exceed 0.2).
const minRelevant = Number(values['min-relevant']);
const queries = dataset.queries.filter(q => (!manifest || manifest.has(q.id)) && q.relevant.size >= minRelevant);
const docsById = new Map(dataset.docs.map(d => [d.id, d]));

// The project each query searches, and the documents each project holds.
const projects = new Map<string, Doc[]>();
let projectOf: (q: Query) => string;
if (mode === 'store') {
  const used = new Set(queries.flatMap(q => q.candidates ?? []));
  projects.set('cmeval-all', queries[0].candidates ? dataset.docs.filter(d => used.has(d.id)) : dataset.docs);
  projectOf = () => 'cmeval-all';
} else if (queries[0].candidates) {
  for (const q of queries) projects.set(`cmeval-${q.id}`, q.candidates!.map(id => docsById.get(id)!));
  projectOf = q => `cmeval-${q.id}`;
} else {
  for (const d of dataset.docs) {
    const name = `cmeval-${d.project}`;
    if (!projects.has(name)) projects.set(name, []);
    projects.get(name)!.push(d);
  }
  projectOf = q => `cmeval-${q.project}`;
}

const store = new SessionStore();
const search = new SessionSearch();
let started = performance.now();
for (const [project, docs] of projects) {
  const sdkId = store.createSDKSession(`content-${project}`, project, 'claude-mem-search-eval');
  store.ensureMemorySessionIdRegistered(sdkId, `memory-${project}`);
  for (const d of docs) {
    store.storeObservation(`memory-${project}`, project, {
      type: 'discovery',
      title: d.id,
      subtitle: null,
      facts: d.parts,
      narrative: null,
      concepts: [],
      files_read: [],
      files_modified: [],
    }, 1, 0, undefined, undefined, { skipTitleDedup: true });
  }
}
const timings = [`seed SQLite ${((performance.now() - started) / 1000).toFixed(0)}s`];

const runs = new Map<string, Metrics[]>();
const searchAll = async (manager: any, label: string) => {
  const started = performance.now();
  const results: Metrics[] = [];
  for (const q of queries) {
    const found = await manager.search({ query: q.text, project: projectOf(q), limit: LIMIT, type: 'observations', format: 'json' });
    results.push(metricsFor(found.observations.map((o: { title: string | null }) => o.title ?? ''), q.relevant, q.judged));
  }
  runs.set(label, results);
  timings.push(`${queries.length} ${label} searches ${((performance.now() - started) / 1000).toFixed(0)}s`);
};
await searchAll(new SearchManager(search, store, null, new FormattingService(), new TimelineService()), 'worker keyword');

if (!values['keyword-only']) {
  const sync = new ChromaSync('claude-mem');
  started = performance.now();
  for (const project of projects.keys()) {
    const outcome = await sync.ensureBackfilled(project, store);
    if (outcome && typeof outcome === 'object' && 'aborted' in outcome && outcome.aborted) {
      throw new Error(`Chroma backfill of ${project} aborted: ${JSON.stringify(outcome)}`);
    }
  }
  timings.push(`Chroma backfill (embedding by chroma-mcp) ${((performance.now() - started) / 1000).toFixed(0)}s`);
  await searchAll(new SearchManager(search, store, sync, new FormattingService(), new TimelineService()), 'worker search');
  await ChromaMcpManager.getInstance().stop();
}

const scope = mode === 'store'
  ? 'every document in one claude-mem project, searched by every query'
  : queries[0].candidates ? 'each query is its own claude-mem project holding its own haystack' : 'each query searches its claude-mem project';
const md = resultsHeader(`${dataset.key} through claude-mem's worker search (${mode})`, dataset,
  `${queries.length} queries` +
  (values.manifest ? ` from ${values.manifest}` : '') +
  (minRelevant > 1 ? ` with at least ${minRelevant} relevant documents` : '') +
  `; ${scope}; a document is one observation whose facts are its parts; top ${LIMIT} from SearchManager.search; ` +
  `95% intervals from ${BOOTSTRAP} bootstrap resamples over queries.`) +
  renderTables(runs, queries, runs.has('worker search') ? [['worker search', 'worker keyword']] : []) +
  `\n## Timing\n\n${timings.map(t => `- ${t}`).join('\n')}\n`;
mkdirSync(values.results!, { recursive: true });
const name = (values.manifest ? `-${values.manifest.replace(/^.*\//, '').replace(/\.txt$/, '')}` : '') +
  (minRelevant > 1 ? `-min${minRelevant}` : '') + (values['keyword-only'] ? '-keyword' : '');
writeFileSync(`${values.results}/${dataset.key}-worker-${mode}${name}.md`, md);
console.log(md);
process.exit(0);
