// Tier-0 check of a published vector file: re-embed a seeded sample of rows
// and compare with the published fp16 vectors.
//
//   node src/verify.ts --model minilm-l6 [--n 200]
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { loadEncoder } from './encoder.ts';
import { contentHash, distinctTurns, loadLongMemEvalS } from './longmemeval.ts';
import { modelByKey } from './models.ts';

const MIN_COSINE = 0.9999;
const { values } = parseArgs({
  options: { model: { type: 'string' }, n: { type: 'string', default: '200' }, out: { type: 'string', default: 'out' } },
});
const model = modelByKey(values.model ?? '');
const rows = distinctTurns(await loadLongMemEvalS());

// The row index must match turns.tsv, or every vector is read against the wrong text.
const index = readFileSync(`${values.out}/turns.tsv`, 'utf8').trim().split('\n').slice(1);
if (index.length !== rows.length) throw new Error(`turns.tsv has ${index.length} rows, expected ${rows.length}`);
index.forEach((line, i) => {
  const [sessionId, turnIndex, , , hash] = line.split('\t');
  const r = rows[i];
  if (sessionId !== r.sessionId || Number(turnIndex) !== r.turnIndex || hash !== contentHash(r.content)) {
    throw new Error(`turns.tsv row ${i + 2} does not match the dataset`);
  }
});

const buf = readFileSync(`${values.out}/${model.key}/turns.f16.bin`);
const published = new Float16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2);
const sample = rows.map((_, i) => i)
  .sort((a, b) => (createHash('sha256').update(`verify:${a}`).digest('hex') < createHash('sha256').update(`verify:${b}`).digest('hex') ? -1 : 1))
  .slice(0, Number(values.n));
const encode = await loadEncoder(model);
let worst = 1;
for (let b = 0; b < sample.length; b += 16) {
  const idx = sample.slice(b, b + 16);
  const fresh = await encode(idx.map(i => model.passagePrefix + rows[i].content));
  idx.forEach((row, k) => {
    // fp16 rounding leaves a published row's norm slightly off 1, so the
    // dot product is divided by it to give the cosine.
    let dot = 0, norm = 0;
    for (let d = 0; d < model.dims; d++) {
      const p = published[row * model.dims + d];
      dot += fresh[k][d] * p;
      norm += p * p;
    }
    worst = Math.min(worst, dot / Math.sqrt(norm));
  });
}
console.log(`${model.key}: ${sample.length} rows re-embedded, worst cosine ${worst.toFixed(7)}`);
if (worst < MIN_COSINE) { console.error(`below ${MIN_COSINE}`); process.exit(1); }
