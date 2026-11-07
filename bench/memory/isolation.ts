// Phase 1 isolation check (trove#52): ask question 2 against question
// 1's store; none of question 2's evidence sessions may come back.
//
//   node bench/memory/isolation.ts --manifest manifests/memory-bench-smoke-2.txt [--prefix smoke-]
import { parseArgs } from 'node:util';
import * as cmr from './cmr.ts';
import * as honcho from './honcho.ts';
import { loadS, readManifest } from './common.ts';

const { values } = parseArgs({ options: { manifest: { type: 'string' }, prefix: { type: 'string', default: '' }, arms: { type: 'string', default: 'A,B,C,D' } } });
const qs = await loadS();
const [q1, q2] = readManifest(values.manifest!).map(id => qs.find(q => q.question_id === id)!);
const foreign = new Set(q2.answer_session_ids.filter(s => !q1.haystack_session_ids.includes(s)));
let ok = true;
for (const arm of values.arms!.split(',')) {
  const sessions = arm === 'A'
    ? (await honcho.searchSessions(q2, honcho.workspaceOf(q1, values.prefix))).sessions
    : (await cmr.retrieve(arm, { ...q2, question_id: q1.question_id }, cmr.sessionMap(arm, q1.question_id))).sessions;
  const leaked = sessions.filter(s => s && foreign.has(s));
  const outside = sessions.filter(s => s && !q1.haystack_session_ids.includes(s));
  console.log(`${arm}: ${sessions.length} rows from q1's store; q2 evidence leaked: ${leaked.length}; rows outside q1's haystack: ${outside.length}`);
  ok &&= leaked.length === 0 && outside.length === 0;
}
console.log(ok ? 'isolated' : 'NOT isolated');
process.exit(ok ? 0 : 1);
