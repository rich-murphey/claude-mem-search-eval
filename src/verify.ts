// Tier-0 check of a published vector file: confirm rows.tsv lines up with the
// dataset, then re-embed a seeded sample of rows and compare with the
// published fp16 vectors.
//
//   node src/verify.ts --dataset longmemeval-s --model minilm-l6 [--n 200]
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { contentHash, loadDataset, rowsOf } from './datasets.ts';
import { loadEncoder } from './encoder.ts';
import { modelByKey } from './models.ts';

const MIN_COSINE = 0.9999;
const { values } = parseArgs({
  options: {
    dataset: { type: 'string', default: 'longmemeval-s' },
    model: { type: 'string' },
    n: { type: 'string', default: '200' },
    out: { type: 'string', default: 'out' },
  },
});
const model = modelByKey(values.model ?? '');
const dataset = await loadDataset(values.dataset!);
const rows = rowsOf(dataset);
const dir = `${values.out}/${dataset.key}`;

// The row index must match rows.tsv, or every vector is read against the wrong text.
const index = readFileSync(`${dir}/rows.tsv`, 'utf8').trim().split('\n').slice(1);
if (index.length !== rows.length) throw new Error(`rows.tsv has ${index.length} rows, expected ${rows.length}`);
index.forEach((line, i) => {
  const [doc, part, hash] = line.split('\t');
  const r = rows[i];
  if (doc !== r.doc || Number(part) !== r.part || hash !== contentHash(r.text)) {
    throw new Error(`rows.tsv row ${i + 2} does not match the dataset`);
  }
});

const buf = readFileSync(`${dir}/${model.key}/rows.f16.bin`);
const published = new Float16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2);
const key = (i: number) => createHash('sha256').update(`verify:${i}`).digest('hex');
const sample = rows.map((_, i) => i).sort((a, b) => (key(a) < key(b) ? -1 : 1)).slice(0, Number(values.n));
const encode = await loadEncoder(model);
let worst = 1;
for (let b = 0; b < sample.length; b += 16) {
  const idx = sample.slice(b, b + 16);
  const fresh = await encode(idx.map(i => model.passagePrefix + rows[i].text));
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
console.log(`${dataset.key} ${model.key}: ${sample.length} rows re-embedded, worst cosine ${worst.toFixed(7)}`);
if (worst < MIN_COSINE) { console.error(`below ${MIN_COSINE}`); process.exit(1); }
