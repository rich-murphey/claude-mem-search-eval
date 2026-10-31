// A small cross-encoder reranking claude-mem's hybrid top N, with its latency.
//
//   node src/rerank.ts --dataset miracl-en --mode scoped [--depth 50] [--sample 300] [--manifest m.txt] [--threads 8]
//
// The baseline is claude-mem's current hybrid ranking, rebuilt as
// src/model-agnostic.ts builds it (minilm-l6 vector leg, exact, by nearest
// part, 100 deep; the bm25 leg from out/<dataset>/keyword-<mode>.jsonl; RRF
// k = 60). Each of its top N observations is scored by
// cross-encoder/ms-marco-MiniLM-L6-v2 (Xenova's ONNX export, fp32) against
// the query, an observation scoring as its best part, and the top N reordered
// by that score. Writes out/<dataset>/ma/rerank-<mode>-<depth>.json: per query,
// the metrics of both rankings and the milliseconds the reranking took.
import { AutoModelForSequenceClassification, AutoTokenizer } from '@huggingface/transformers';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { loadDataset, rowsOf } from './datasets.ts';
import { loadVectors, readManifest } from './metrics.ts';

const { values } = parseArgs({
  options: {
    dataset: { type: 'string', default: 'miracl-en' },
    mode: { type: 'string', default: 'scoped' },
    depth: { type: 'string', default: '50' },
    sample: { type: 'string' },
    manifest: { type: 'string' },
    threads: { type: 'string', default: '8' },
    out: { type: 'string', default: 'out' },
    model: { type: 'string', default: 'Xenova/ms-marco-MiniLM-L-6-v2' },
  },
});
const DIM = 384, LEG = 100, MAX_TOKENS = 512, DEPTH = Number(values.depth);
const dataset = await loadDataset(values.dataset!);
const dir = `${values.out}/${dataset.key}`;
const rows = rowsOf(dataset);
const docIds = dataset.docs.map(d => d.id);
const docIndex = new Map(docIds.map((id, i) => [id, i]));
const rowDoc = Int32Array.from(rows, r => docIndex.get(r.doc)!);
const R = loadVectors(`${dir}/minilm-l6/rows.f16.bin`, DIM);
const Q = loadVectors(`${dir}/minilm-l6/queries.f16.bin`, DIM);
const keyword = new Map<string, string[]>(readFileSync(`${dir}/keyword-${values.mode}.jsonl`, 'utf8').trim().split('\n')
  .map(l => JSON.parse(l)).map(k => [k.q, k.ids]));

const manifest = values.manifest ? readManifest(values.manifest) : null;
let evaluated = dataset.queries.map((q, i) => ({ q, i })).filter(({ q }) => !manifest || manifest.has(q.id));
if (values.sample) {
  // A fixed sample: the queries with the smallest sha256 of their id.
  const h = (id: string) => createHash('sha256').update(id).digest('hex');
  evaluated = evaluated.sort((a, b) => (h(a.q.id) < h(b.q.id) ? -1 : 1)).slice(0, Number(values.sample));
}

// Candidate rows per query, as model-agnostic.ts: haystack, project or store.
const store = values.mode === 'store';
const candidateDocs = (qi: number): number[] => {
  const q = dataset.queries[qi];
  if (store) {
    if (!q.candidates) return docIds.map((_, i) => i);
    return [...new Set(dataset.queries.flatMap(x => x.candidates!))].map(id => docIndex.get(id)!);
  }
  if (q.candidates) return [...new Set(q.candidates)].map(id => docIndex.get(id)!);
  return dataset.docs.flatMap((d, i) => (d.project === q.project ? [i] : []));
};
const docRows: number[][] = Array.from({ length: docIds.length }, () => []);
rowDoc.forEach((d, r) => docRows[d].push(r));
const storeDocs = store ? candidateDocs(evaluated[0].i) : null;

function hybrid(qi: number): number[] {
  const docs = storeDocs ?? candidateDocs(qi);
  const scored = docs.map(d => {
    let best = -Infinity;
    for (const r of docRows[d]) { let s = 0; for (let k = 0; k < DIM; k++) s += Q[qi * DIM + k] * R[r * DIM + k]; if (s > best) best = s; }
    return { d, best };
  });
  scored.sort((a, b) => b.best - a.best || a.d - b.d);
  const score = new Map<number, number>();
  scored.slice(0, LEG).forEach(({ d }, i) => score.set(d, (score.get(d) ?? 0) + 1 / (60 + i + 1)));
  (keyword.get(dataset.queries[qi].id) ?? []).forEach((id, i) => { const d = docIndex.get(id)!; score.set(d, (score.get(d) ?? 0) + 1 / (60 + i + 1)); });
  return [...score.keys()].sort((x, y) => score.get(y)! - score.get(x)! || x - y);
}

const tokenizer = await AutoTokenizer.from_pretrained(values.model!);
const model = await AutoModelForSequenceClassification.from_pretrained(values.model!, {
  dtype: 'fp32',
  session_options: { enableCpuMemArena: false, intraOpNumThreads: Number(values.threads), interOpNumThreads: 1 },
});
const sep = BigInt(tokenizer.sep_token_id);

async function crossScores(query: string, texts: string[]): Promise<Float32Array> {
  const out = new Float32Array(texts.length);
  for (let start = 0; start < texts.length; start += 16) {
    const batch = texts.slice(start, start + 16);
    const inputs = tokenizer(new Array(batch.length).fill(query), {
      text_pair: batch, padding: true, truncation: true, max_length: MAX_TOKENS,
    });
    // transformers.js drops the closing [SEP] of a truncated input (src/encoder.ts).
    const [n, width] = inputs.input_ids.dims as number[];
    const ids = inputs.input_ids.data as BigInt64Array, mask = inputs.attention_mask.data as BigInt64Array;
    for (let r = 0; r < n; r++) {
      const last = r * width + MAX_TOKENS - 1;
      if (width === MAX_TOKENS && mask[last] === 1n && ids[last] !== sep) ids[last] = sep;
    }
    const { logits } = await model(inputs);
    out.set(logits.data as Float32Array, start);
  }
  return out;
}

function metrics(top: number[], relevant: Set<string>): number[] {
  const ids = top.slice(0, 10).map(i => docIds[i]);
  const h5 = ids.slice(0, 5).filter(s => relevant.has(s)).length;
  let dcg = 0, idcg = 0;
  ids.forEach((s, i) => { if (relevant.has(s)) dcg += 1 / Math.log2(i + 2); });
  for (let i = 0; i < Math.min(relevant.size, 10); i++) idcg += 1 / Math.log2(i + 2);
  const first = ids.findIndex(s => relevant.has(s));
  return [h5 > 0 ? 1 : 0, h5 / relevant.size, first < 0 ? 0 : 1 / (first + 1), dcg / idcg];
}

const results: { q: string; base: number[]; rerank: number[]; ms: number; pairs: number }[] = [];
let done = 0;
for (const { q, i } of evaluated) {
  const base = hybrid(i);
  const top = base.slice(0, DEPTH);
  const t0 = performance.now();
  // Parts cut at 4,000 characters: past 512 tokens they are truncated anyway.
  const texts: string[] = [], owner: number[] = [];
  top.forEach((d, j) => dataset.docs[d].parts.forEach(p => { texts.push(p.slice(0, 4000)); owner.push(j); }));
  const s = await crossScores(q.text, texts);
  const best = new Float32Array(top.length).fill(-Infinity);
  owner.forEach((j, k) => { if (s[k] > best[j]) best[j] = s[k]; });
  const reranked = top.map((d, j) => ({ d, s: best[j], j })).sort((a, b) => b.s - a.s || a.j - b.j).map(x => x.d);
  const ms = performance.now() - t0;
  results.push({ q: q.id, base: metrics(base, q.relevant), rerank: metrics(reranked, q.relevant), ms, pairs: texts.length });
  if (++done % 50 === 0) console.error(`${dataset.key}: ${done}/${evaluated.length}`);
}
mkdirSync(`${dir}/ma`, { recursive: true });
writeFileSync(`${dir}/ma/rerank-${values.mode}-${DEPTH}.json`, JSON.stringify({
  dataset: dataset.key, mode: values.mode, depth: DEPTH, model: values.model, threads: Number(values.threads),
  metrics: ['hit@5', 'R@5', 'MRR@10', 'nDCG@10'], results,
}));
const mean = (f: (r: typeof results[0]) => number) => results.reduce((a, r) => a + f(r), 0) / results.length;
const ms = results.map(r => r.ms).sort((a, b) => a - b);
console.log(`${dataset.key} ${values.mode} depth ${DEPTH}, ${results.length} queries: R@5 ${mean(r => r.base[1]).toFixed(3)} -> ${mean(r => r.rerank[1]).toFixed(3)}, ` +
  `nDCG@10 ${mean(r => r.base[3]).toFixed(3)} -> ${mean(r => r.rerank[3]).toFixed(3)}; ` +
  `${mean(r => r.pairs).toFixed(0)} pairs/query, p50 ${ms[Math.floor(ms.length / 2)].toFixed(0)} ms, p95 ${ms[Math.floor(ms.length * 0.95)].toFixed(0)} ms`);
