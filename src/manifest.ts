// A reproducible stratified sample of answerable LongMemEval-S questions.
//
//   node src/manifest.ts --n 100 --seed claude-mem-lme-s-v1 > manifests/lme-s-100-v1.txt
//
// Abstention questions are dropped; each question type gets its share of n by
// largest remainder; within a type, questions are taken in order of
// sha256(seed + question_id). No random number generator is involved, so any
// language reproduces the list from the seed.
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { loadLongMemEvalS, LME_REVISION, LME_S_SHA256 } from './longmemeval.ts';

const { values } = parseArgs({ options: { n: { type: 'string' }, seed: { type: 'string' } } });
const n = Number(values.n), seed = values.seed!;
const questions = (await loadLongMemEvalS()).filter(q => !q.question_id.endsWith('_abs'));
const byType = new Map<string, typeof questions>();
for (const q of questions) {
  if (!byType.has(q.question_type)) byType.set(q.question_type, []);
  byType.get(q.question_type)!.push(q);
}
const types = [...byType.keys()].sort();
const share = new Map(types.map(t => [t, (n * byType.get(t)!.length) / questions.length]));
const take = new Map(types.map(t => [t, Math.floor(share.get(t)!)]));
let left = n - [...take.values()].reduce((a, b) => a + b, 0);
for (const t of [...types].sort((a, b) => (share.get(b)! - take.get(b)!) - (share.get(a)! - take.get(a)!) || (a < b ? -1 : 1))) {
  if (left-- <= 0) break;
  take.set(t, take.get(t)! + 1);
}
const key = (id: string) => createHash('sha256').update(seed + id).digest('hex');
console.log(`# LongMemEval-S (cleaned) revision ${LME_REVISION}, sha256 ${LME_S_SHA256}`);
console.log(`# n=${n} seed=${seed}; ${types.map(t => `${t}=${take.get(t)}`).join(' ')}`);
for (const t of types) {
  for (const q of [...byType.get(t)!].sort((a, b) => (key(a.question_id) < key(b.question_id) ? -1 : 1)).slice(0, take.get(t))) {
    console.log(q.question_id);
  }
}
