// Embeds LongMemEval-S turns (or its questions) with one model, one shard of
// rows per process, and writes fp16 vectors in row order.
//
//   node src/embed.ts --model minilm-l6 --shard 0/4 [--threads 8]
//   node src/embed.ts --model minilm-l6 --queries
//
import { mkdirSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { distinctTurns, loadLongMemEvalS } from './longmemeval.ts';
import { loadEncoder } from './encoder.ts';
import { modelByKey } from './models.ts';

const BATCH = 32;

const { values } = parseArgs({
  options: {
    model: { type: 'string' },
    shard: { type: 'string', default: '0/1' },
    threads: { type: 'string' },
    queries: { type: 'boolean', default: false },
    out: { type: 'string', default: 'out' },
  },
});
const model = modelByKey(values.model ?? '');
const [shard, shards] = values.shard!.split('/').map(Number);

async function embedAll(texts: string[], encode: (t: string[]) => Promise<Float32Array[]>, label: string) {
  // Longest first, so each batch pads to texts of similar length.
  const order = texts.map((_, i) => i).sort((a, b) => texts[b].length - texts[a].length);
  const out = new Float16Array(texts.length * model.dims);
  const started = performance.now();
  for (let b = 0; b < order.length; b += BATCH) {
    const idx = order.slice(b, b + BATCH);
    const vectors = await encode(idx.map(i => texts[i]));
    idx.forEach((i, k) => out.set(vectors[k], i * model.dims));
    if ((b / BATCH) % 50 === 0) {
      const s = (performance.now() - started) / 1000;
      console.error(`${label}: ${b + idx.length}/${texts.length} in ${s.toFixed(0)}s`);
    }
  }
  console.error(`${label}: done, ${texts.length} in ${((performance.now() - started) / 1000).toFixed(0)}s`);
  return out;
}

const questions = await loadLongMemEvalS();
const encode = await loadEncoder(model, values.threads ? Number(values.threads) : undefined);
const dir = `${values.out}/${model.key}`;
mkdirSync(dir, { recursive: true });

if (values.queries) {
  const texts = questions.map(q => model.queryPrefix + q.question);
  const vectors = await embedAll(texts, encode, `${model.key} queries`);
  writeFileSync(`${dir}/queries.f16.bin`, new Uint8Array(vectors.buffer));
} else {
  // Rows i with i % shards === shard, in ascending order.
  const rows = distinctTurns(questions).filter((_, i) => i % shards === shard);
  const texts = rows.map(r => model.passagePrefix + r.content);
  const vectors = await embedAll(texts, encode, `${model.key} shard ${shard}/${shards}`);
  writeFileSync(`${dir}/turns.shard-${shard}-of-${shards}.f16.bin`, new Uint8Array(vectors.buffer));
}
