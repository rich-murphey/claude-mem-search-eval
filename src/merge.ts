// Interleaves a model's shard files into one row-ordered vector file and
// writes the row and query indexes every vector file of the dataset is read
// against.
//
//   node src/merge.ts --dataset longmemeval-s --model minilm-l6 --shards 4
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { contentHash, loadDataset, rowsOf } from './datasets.ts';
import { modelByKey } from './models.ts';

const { values } = parseArgs({
  options: {
    dataset: { type: 'string', default: 'longmemeval-s' },
    model: { type: 'string' },
    shards: { type: 'string' },
    out: { type: 'string', default: 'out' },
  },
});
const model = modelByKey(values.model ?? '');
const shards = Number(values.shards);
const dataset = await loadDataset(values.dataset!);
const rows = rowsOf(dataset);
const dir = `${values.out}/${dataset.key}`;

writeFileSync(`${dir}/rows.tsv`,
  'doc_id\tpart\tcontent_sha256_16\n' +
  rows.map(r => `${r.doc}\t${r.part}\t${contentHash(r.text)}`).join('\n') + '\n');
writeFileSync(`${dir}/queries.tsv`,
  'query_id\ttype\trelevant_doc_ids\n' +
  dataset.queries.map(q => `${q.id}\t${q.type}\t${[...q.relevant].join(',')}`).join('\n') + '\n');

const merged = new Float16Array(rows.length * model.dims);
for (let s = 0; s < shards; s++) {
  const buf = readFileSync(`${dir}/${model.key}/rows.shard-${s}-of-${shards}.f16.bin`);
  const part = new Float16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2);
  const expected = Math.ceil((rows.length - s) / shards);
  if (part.length !== expected * model.dims) throw new Error(`shard ${s}: ${part.length / model.dims} rows, expected ${expected}`);
  for (let k = 0; k < expected; k++) {
    merged.set(part.subarray(k * model.dims, (k + 1) * model.dims), (k * shards + s) * model.dims);
  }
}
writeFileSync(`${dir}/${model.key}/rows.f16.bin`, new Uint8Array(merged.buffer));
console.log(`${dataset.key} ${model.key}: ${rows.length} rows x ${model.dims}`);
