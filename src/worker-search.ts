// Retrieval accuracy of claude-mem's worker search on LongMemEval-S: the
// local install's SQLite store, its FTS5 keyword search, and its Chroma search
// by meaning (chroma-mcp's default all-MiniLM-L6-v2, embedded by Chroma
// itself), through SearchManager.search, which mem_search calls.
//
//   bun src/worker-search.ts --claude-mem ~/wt/claude-mem/<tree> [--mode haystack|store]
//     [--manifest manifests/lme-s-100-v1.txt] [--keyword-only]
//
// Runs under bun (bun:sqlite, claude-mem's TypeScript source) with a fresh
// claude-mem data directory, so chroma-mcp, launched through uvx as the worker
// launches it, starts empty. Chroma embeds every session's turns itself, which
// takes as long as embedding them with the server's model.
//
// Each LongMemEval session is one observation whose facts are its turns, so
// Chroma holds one document per turn (obs_<id>_fact_<n>) and FTS5 indexes the
// turns, as the server holds one embedding part per turn. The observation's
// title is the session id, which maps results back. Observations are stored
// with the current time, inside the worker's 90-day recency window.
//
// Runs, both through SearchManager.search (results in relevance order, as
// mem_search requests them; SearchOrchestrator alone defaults to date order):
//   worker keyword  without Chroma (CLAUDE_MEM_CHROMA_ENABLED=false): FTS5, AND
//                   of the query's terms, widened to OR when that finds
//                   nothing and the query has 3+ terms.
//   worker search   with Chroma: Chroma's nearest documents, SQLite only for
//                   an empty result.
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { distinctTurns, loadLongMemEvalS, LME_REVISION } from './longmemeval.ts';
import { BOOTSTRAP, metricsFor, readManifest, RELATIVE_ACCURACY_NOTE, renderTables, type Metrics } from './metrics.ts';

const LIMIT = 10;

const { values } = parseArgs({
  options: {
    'claude-mem': { type: 'string' },
    mode: { type: 'string', default: 'haystack' },
    manifest: { type: 'string' },
    'min-relevant': { type: 'string', default: '1' },
    'keyword-only': { type: 'boolean', default: false },
    results: { type: 'string', default: 'results' },
  },
});
const claudeMem = resolve(values['claude-mem'] ?? '');
const mode = values.mode as 'haystack' | 'store';
if (mode !== 'haystack' && mode !== 'store') throw new Error(`--mode must be haystack or store, not ${mode}`);

process.env.CLAUDE_MEM_DATA_DIR = mkdtempSync(join(tmpdir(), 'claude-mem-search-eval-worker-'));
const { SessionStore } = await import(`${claudeMem}/src/services/sqlite/SessionStore.ts`);
const { SessionSearch } = await import(`${claudeMem}/src/services/sqlite/SessionSearch.ts`);
const { ChromaSync } = await import(`${claudeMem}/src/services/sync/ChromaSync.ts`);
const { ChromaMcpManager } = await import(`${claudeMem}/src/services/sync/ChromaMcpManager.ts`);
const { SearchManager } = await import(`${claudeMem}/src/services/worker/SearchManager.ts`);
const { FormattingService } = await import(`${claudeMem}/src/services/worker/FormattingService.ts`);
const { TimelineService } = await import(`${claudeMem}/src/services/worker/TimelineService.ts`);

const allQuestions = await loadLongMemEvalS();
const manifest = values.manifest ? readManifest(values.manifest) : null;
// --min-relevant 5 keeps questions with at least five relevant sessions,
// where a perfect top 5 scores P@5 = 1 (with one, P@5 cannot exceed 0.2).
const minRelevant = Number(values['min-relevant']);
const questions = allQuestions.filter(q => !q.question_id.endsWith('_abs') && (!manifest || manifest.has(q.question_id))
  && new Set(q.answer_session_ids).size >= minRelevant);
const rows = distinctTurns(allQuestions);
const turnsOf = new Map<string, string[]>();
for (const r of rows) {
  if (!turnsOf.has(r.sessionId)) turnsOf.set(r.sessionId, []);
  turnsOf.get(r.sessionId)!.push(r.content);
}

const store = new SessionStore();
const search = new SessionSearch();
const projectOf = (questionId: string) => (mode === 'haystack' ? `lme-${questionId}` : 'lme-all');

let started = performance.now();
const seed = (project: string, sessionIds: string[]) => {
  const sdkId = store.createSDKSession(`content-${project}`, project, 'longmemeval');
  store.ensureMemorySessionIdRegistered(sdkId, `memory-${project}`);
  for (const sessionId of sessionIds) {
    store.storeObservation(`memory-${project}`, project, {
      type: 'discovery',
      title: sessionId,
      subtitle: null,
      facts: turnsOf.get(sessionId)!,
      narrative: null,
      concepts: [],
      files_read: [],
      files_modified: [],
    }, 1, 0, undefined, undefined, { skipTitleDedup: true });
  }
};
const projects = mode === 'haystack'
  ? questions.map(q => projectOf(q.question_id))
  : ['lme-all'];
if (mode === 'haystack') {
  // A haystack can list a session twice (README, Data); it is stored once.
  for (const q of questions) seed(projectOf(q.question_id), [...new Set(q.haystack_session_ids)]);
} else {
  seed('lme-all', [...new Set(questions.flatMap(q => q.haystack_session_ids))]);
}
const timings = [`seed SQLite ${((performance.now() - started) / 1000).toFixed(0)}s`];

const sessionIdsOf = (observations: Array<{ title: string | null }>) => observations.map(o => o.title ?? '');
const runs = new Map<string, Metrics[]>();

const searchAll = async (manager: any, label: string) => {
  const started = performance.now();
  const results: Metrics[] = [];
  for (const q of questions) {
    const found = await manager.search({ query: q.question, project: projectOf(q.question_id), limit: LIMIT, type: 'observations', format: 'json' });
    results.push(metricsFor(sessionIdsOf(found.observations), new Set(q.answer_session_ids)));
  }
  runs.set(label, results);
  timings.push(`${questions.length} ${label} searches ${((performance.now() - started) / 1000).toFixed(0)}s`);
};
await searchAll(new SearchManager(search, store, null, new FormattingService(), new TimelineService()), 'worker keyword');

if (!values['keyword-only']) {
  const sync = new ChromaSync('claude-mem');
  started = performance.now();
  for (const project of projects) {
    const outcome = await sync.ensureBackfilled(project, store);
    if (outcome && typeof outcome === 'object' && 'aborted' in outcome && outcome.aborted) {
      throw new Error(`Chroma backfill of ${project} aborted: ${JSON.stringify(outcome)}`);
    }
  }
  timings.push(`Chroma backfill (embedding by chroma-mcp) ${((performance.now() - started) / 1000).toFixed(0)}s`);

  await searchAll(new SearchManager(search, store, sync, new FormattingService(), new TimelineService()), 'worker search');
  await ChromaMcpManager.getInstance().stop();
}

const md = `# LongMemEval-S through claude-mem's worker search (${mode})\n\n` +
  `Dataset revision ${LME_REVISION}; ${questions.length} answerable questions` +
  (values.manifest ? ` from ${values.manifest}` : '') +
  (minRelevant > 1 ? ` with at least ${minRelevant} relevant sessions` : '') + '; ' +
  (mode === 'haystack'
    ? 'each question is its own claude-mem project holding its own haystack'
    : `all ${new Set(questions.flatMap(q => q.haystack_session_ids)).size} sessions in one project, searched by every question`) +
  `; a session is one observation whose facts are its turns; top ${LIMIT}; ` +
  `95% intervals from ${BOOTSTRAP} bootstrap resamples over questions.\n\n` +
  `${RELATIVE_ACCURACY_NOTE}\n\n` +
  renderTables(runs, questions, runs.has('worker search') ? [['worker search', 'worker keyword']] : []) +
  `\n## Timing\n\n${timings.map(t => `- ${t}`).join('\n')}\n`;
mkdirSync(values.results!, { recursive: true });
const name = (values.manifest ? `-${values.manifest.replace(/^.*\//, '').replace(/\.txt$/, '')}` : '') +
  (minRelevant > 1 ? `-min${minRelevant}` : '');
writeFileSync(`${values.results}/longmemeval-s-claude-mem-worker-${mode}${name}${values['keyword-only'] ? '-keyword' : ''}.md`, md);
console.log(md);
process.exit(0);
