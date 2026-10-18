// Interleaves a model's shard files into one row-ordered vector file and
// writes the row and question indexes every vector file is read against.
//
//   node src/merge.ts --model minilm-l6 --shards 4
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { contentHash, distinctTurns, loadLongMemEvalS } from './longmemeval.ts';
import { modelByKey } from './models.ts';

const { values } = parseArgs({
  options: { model: { type: 'string' }, shards: { type: 'string' }, out: { type: 'string', default: 'out' } },
});
const model = modelByKey(values.model ?? '');
const shards = Number(values.shards);
const questions = await loadLongMemEvalS();
const rows = distinctTurns(questions);

writeFileSync(`${values.out}/turns.tsv`,
  'session_id\tturn_index\trole\thas_answer\tcontent_sha256_16\n' +
  rows.map(r => `${r.sessionId}\t${r.turnIndex}\t${r.role}\t${r.hasAnswer ? 1 : 0}\t${contentHash(r.content)}`).join('\n') + '\n');
writeFileSync(`${values.out}/questions.tsv`,
  'question_id\tquestion_type\tanswer_session_ids\n' +
  questions.map(q => `${q.question_id}\t${q.question_type}\t${q.answer_session_ids.join(',')}`).join('\n') + '\n');

const merged = new Float16Array(rows.length * model.dims);
for (let s = 0; s < shards; s++) {
  const buf = readFileSync(`${values.out}/${model.key}/turns.shard-${s}-of-${shards}.f16.bin`);
  const part = new Float16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2);
  const expected = Math.ceil((rows.length - s) / shards);
  if (part.length !== expected * model.dims) throw new Error(`shard ${s}: ${part.length / model.dims} rows, expected ${expected}`);
  for (let k = 0; k < expected; k++) {
    merged.set(part.subarray(k * model.dims, (k + 1) * model.dims), (k * shards + s) * model.dims);
  }
}
writeFileSync(`${values.out}/${model.key}/turns.f16.bin`, new Uint8Array(merged.buffer));
console.log(`${model.key}: ${rows.length} rows x ${model.dims}`);
