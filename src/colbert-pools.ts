// Dumps claude-mem's hybrid top N candidate pools for the ColBERT rerank
// (src/colbert_rerank.py), so it reorders exactly what src/rerank.ts's
// cross-encoder reorders.
//
//   node src/colbert-pools.ts --dataset miracl-en --mode scoped [--depth 50] [--sample 400] [--manifest m.txt] [--in ../model-agnostic/out]
//
// The hybrid is src/rerank.ts's, unchanged: minilm-l6 vector leg, exact, by
// nearest part, 100 deep; the bm25 leg from <in>/<dataset>/keyword-<mode>.jsonl;
// RRF k = 60. Writes <out>/<dataset>/colbert/pool-<mode>.jsonl (per query: id,
// text, relevant ids, the hybrid's top N doc ids, the baseline's metrics as
// src/rerank.ts computes them) and docs-<mode>.jsonl (the parts of every doc
// in any pool).
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
    in: { type: 'string', default: 'out' },
    out: { type: 'string', default: 'out' },
  },
});
const DIM = 384, LEG = 100, DEPTH = Number(values.depth);
const dataset = await loadDataset(values.dataset!);
const dir = `${values.in}/${dataset.key}`;
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
  // A fixed sample: the queries with the smallest sha256 of their id, as src/rerank.ts.
  const h = (id: string) => createHash('sha256').update(id).digest('hex');
  evaluated = evaluated.sort((a, b) => (h(a.q.id) < h(b.q.id) ? -1 : 1)).slice(0, Number(values.sample));
}

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

function metrics(top: number[], relevant: Set<string>): number[] {
  const ids = top.slice(0, 10).map(i => docIds[i]);
  const h5 = ids.slice(0, 5).filter(s => relevant.has(s)).length;
  let dcg = 0, idcg = 0;
  ids.forEach((s, i) => { if (relevant.has(s)) dcg += 1 / Math.log2(i + 2); });
  for (let i = 0; i < Math.min(relevant.size, 10); i++) idcg += 1 / Math.log2(i + 2);
  const first = ids.findIndex(s => relevant.has(s));
  return [h5 > 0 ? 1 : 0, h5 / relevant.size, first < 0 ? 0 : 1 / (first + 1), dcg / idcg];
}

const pool: string[] = [];
const used = new Set<number>();
for (const { q, i } of evaluated) {
  const base = hybrid(i);
  const top = base.slice(0, DEPTH);
  top.forEach(d => used.add(d));
  pool.push(JSON.stringify({ q: q.id, text: q.text, relevant: [...q.relevant], top: top.map(d => docIds[d]), base: metrics(base, q.relevant) }));
}
const outDir = `${values.out}/${dataset.key}/colbert`;
mkdirSync(outDir, { recursive: true });
writeFileSync(`${outDir}/pool-${values.mode}.jsonl`, pool.join('\n') + '\n');
writeFileSync(`${outDir}/docs-${values.mode}.jsonl`,
  [...used].sort((a, b) => a - b).map(d => JSON.stringify({ id: docIds[d], parts: dataset.docs[d].parts })).join('\n') + '\n');
console.log(`${dataset.key} ${values.mode}: ${pool.length} queries, ${used.size} docs in pools`);
