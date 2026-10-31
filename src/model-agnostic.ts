// Model-agnostic ways to improve claude-mem's search by meaning, measured
// offline on the precomputed vectors: no re-embedding, any model.
//
//   node src/model-agnostic.ts --dataset longmemeval-s --model minilm-l6 --mode store
//
// Needs out/<dataset>/<model>/{rows,queries}.f16.bin (scripts/fetch.sh) and
// out/<dataset>/keyword-<mode>.jsonl (src/keyword-legs.ts). Writes
// out/<dataset>/ma/<model>-<mode>.{json,bin}: per configuration and query,
// hit@5, R@5, MRR@10 and nDCG@10, which src/model-agnostic-report.ts
// cross-validates and pairs against the baseline.
//
// The baseline is claude-mem's server hybrid search (observations.ts,
// searchHybrid): the vector leg ranks observations by their nearest part and
// keeps 100 (exact here; the server reads the HNSW index's 400 nearest parts,
// widened x4 until 100 observations), the keyword leg is pg_textsearch bm25
// over any query term, 100 deep, and the two are fused by RRF, k = 60.
//
// A configuration varies one stage at a time, and some stack:
//   space   the stored and query vectors as stored (base), mean-centred, with
//           the top D principal directions removed as well (all-but-the-top,
//           Mu et al.), or whitened (Su et al.), optionally cut to k dims;
//           fitted on corpus vectors only, never on queries or labels.
//   agg     an observation's score from its parts' scores: max (claude-mem),
//           mean of the top 2 or 3, or a soft max τ·log Σ exp(s/τ).
//   prf     Rocchio in vector space: q' = α q + (1-α) mean of the nearest part
//           of the top k observations of the vector leg (v) or of the fused
//           list (h); then searched again.
//   fusion  vector only; keyword only; RRF with k; weighted RRF; a convex
//           combination α·n(vector) + (1-α)·n(bm25) under min-max (mm),
//           theoretical-min (tmm: cosine floor -1, bm25 floor 0) or z-score
//           normalisation over each leg's 100 (Bruch et al.).
//   mmr     maximal marginal relevance over the fused top 50, similarity the
//           cosine of the observations' nearest parts, λ the relevance weight.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { loadDataset, rowsOf, type Query } from './datasets.ts';
import { loadVectors } from './metrics.ts';

const { values } = parseArgs({
  options: {
    dataset: { type: 'string', default: 'longmemeval-s' },
    model: { type: 'string', default: 'minilm-l6' },
    mode: { type: 'string', default: 'store' },
    out: { type: 'string', default: 'out' },
    'fit-sample': { type: 'string', default: '50000' },
  },
});
const DIM = 384, LEG = 100, MMR_DEPTH = 50;
const mode = values.mode as 'scoped' | 'store';
const dataset = await loadDataset(values.dataset!);
const dir = `${values.out}/${dataset.key}`;
const t0 = performance.now();
const log = (s: string) => console.error(`${dataset.key} ${values.model} ${mode} ${((performance.now() - t0) / 1000).toFixed(0)}s: ${s}`);

// ---- data ------------------------------------------------------------------
const rows = rowsOf(dataset);
const docIds = dataset.docs.map(d => d.id);
const docIndex = new Map(docIds.map((id, i) => [id, i]));
const rowDoc = Int32Array.from(rows, r => docIndex.get(r.doc)!);
const nDocs = docIds.length, nRows = rows.length;
const maxParts = dataset.docs.reduce((m, d) => Math.max(m, d.parts.length), 0);
const baseRows = loadVectors(`${dir}/${values.model}/rows.f16.bin`, DIM);
const allQueryVecs = loadVectors(`${dir}/${values.model}/queries.f16.bin`, DIM);
const queries = dataset.queries;
const queryVecs = new Float32Array(queries.length * DIM);
dataset.queries.forEach((q, i) => queryVecs.set(allQueryVecs.subarray(i * DIM, (i + 1) * DIM), i * DIM));

// Candidate rows per query: its haystack or project (scoped), or the store.
let candRows: (qi: number) => Int32Array | null;
{
  const docRows: number[][] = Array.from({ length: nDocs }, () => []);
  rowDoc.forEach((d, r) => docRows[d].push(r));
  const rowsOfDocs = (docs: string[]) => Int32Array.from(docs.flatMap(id => docRows[docIndex.get(id)!]));
  if (mode === 'store') {
    const used = queries[0].candidates ? new Set(queries.flatMap(q => q.candidates!)) : null;
    const all = used && used.size < nDocs ? rowsOfDocs([...used]) : null;
    candRows = () => all;
  } else if (queries[0].candidates) {
    candRows = qi => rowsOfDocs([...new Set(queries[qi].candidates!)]);
  } else {
    const byProject = new Map<string, Int32Array>();
    for (const p of new Set(dataset.docs.map(d => d.project))) {
      byProject.set(p, rowsOfDocs(dataset.docs.filter(d => d.project === p).map(d => d.id)));
    }
    candRows = qi => byProject.get(queries[qi].project!)!;
  }
}

// Keyword leg.
const keyword = new Map<string, { ids: number[]; scores: number[] }>();
for (const line of readFileSync(`${dir}/keyword-${mode}.jsonl`, 'utf8').trim().split('\n')) {
  const k = JSON.parse(line);
  keyword.set(k.q, { ids: k.ids.map((id: string) => docIndex.get(id)!), scores: k.scores });
}

// ---- linear algebra ----------------------------------------------------------
function normalizeAll(v: Float32Array) {
  for (let r = 0; r < v.length; r += DIM) {
    let n = 0;
    for (let d = 0; d < DIM; d++) n += v[r + d] * v[r + d];
    n = Math.sqrt(n) || 1;
    for (let d = 0; d < DIM; d++) v[r + d] /= n;
  }
}

/** Mean and covariance of a deterministic sample of rows (every n-th). */
function fit(v: Float32Array, sample: number) {
  const n = v.length / DIM, step = Math.max(1, Math.floor(n / sample));
  const mu = new Float64Array(DIM);
  let m = 0;
  for (let r = 0; r < n; r += step, m++) for (let d = 0; d < DIM; d++) mu[d] += v[r * DIM + d];
  for (let d = 0; d < DIM; d++) mu[d] /= m;
  const cov = new Float64Array(DIM * DIM), x = new Float64Array(DIM);
  for (let r = 0; r < n; r += step) {
    for (let d = 0; d < DIM; d++) x[d] = v[r * DIM + d] - mu[d];
    for (let i = 0; i < DIM; i++) { const xi = x[i]; const o = i * DIM; for (let j = i; j < DIM; j++) cov[o + j] += xi * x[j]; }
  }
  for (let i = 0; i < DIM; i++) for (let j = i; j < DIM; j++) { cov[i * DIM + j] /= m; cov[j * DIM + i] = cov[i * DIM + j]; }
  return { mu, cov };
}

/** Eigen-decomposition of a symmetric matrix by cyclic Jacobi; eigenvalues descending, vectors as columns. */
function eigh(a: Float64Array, n: number) {
  const A = Float64Array.from(a), V = new Float64Array(n * n);
  for (let i = 0; i < n; i++) V[i * n + i] = 1;
  for (let sweep = 0; sweep < 50; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += A[p * n + q] ** 2;
    if (off < 1e-22) break;
    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = A[p * n + q];
        if (Math.abs(apq) < 1e-300) continue;
        const theta = (A[q * n + q] - A[p * n + p]) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = A[k * n + p], akq = A[k * n + q];
          A[k * n + p] = c * akp - s * akq; A[k * n + q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = A[p * n + k], aqk = A[q * n + k];
          A[p * n + k] = c * apk - s * aqk; A[q * n + k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = V[k * n + p], vkq = V[k * n + q];
          V[k * n + p] = c * vkp - s * vkq; V[k * n + q] = s * vkp + c * vkq;
        }
      }
    }
  }
  const order = [...Array(n).keys()].sort((i, j) => A[j * n + j] - A[i * n + i]);
  return { values: order.map(i => A[i * n + i]), vectors: order.map(i => Float64Array.from({ length: n }, (_, k) => V[k * n + i])) };
}

/** x -> normalize(P (x - mu)), P given as output rows (each a length-DIM vector). */
function project(v: Float32Array, mu: Float64Array, P: Float64Array[] | null, removeDirs: Float64Array[] | null) {
  const n = v.length / DIM, outDim = P ? P.length : DIM;
  const out = new Float32Array(n * DIM); // zero-padded past outDim
  const x = new Float64Array(DIM);
  for (let r = 0; r < n; r++) {
    for (let d = 0; d < DIM; d++) x[d] = v[r * DIM + d] - mu[d];
    if (removeDirs) for (const u of removeDirs) {
      let dot = 0; for (let d = 0; d < DIM; d++) dot += u[d] * x[d];
      for (let d = 0; d < DIM; d++) x[d] -= dot * u[d];
    }
    if (P) for (let i = 0; i < outDim; i++) { let s = 0; const p = P[i]; for (let d = 0; d < DIM; d++) s += p[d] * x[d]; out[r * DIM + i] = s; }
    else for (let d = 0; d < DIM; d++) out[r * DIM + d] = x[d];
  }
  normalizeAll(out);
  return out;
}

// ---- vector spaces -------------------------------------------------------------
const { mu, cov } = fit(baseRows, Number(values['fit-sample']));
const eig = eigh(cov, DIM);
log(`fitted: top eigenvalues ${eig.values.slice(0, 4).map(x => x.toExponential(2)).join(' ')}, min ${eig.values[DIM - 1].toExponential(2)}`);
// Eigenvalues are floored at 1e-6 of the largest, so a direction the corpus
// barely spans (a small store) is not blown up to unit variance.
const whitenP = (k: number) => eig.vectors.slice(0, k).map((u, i) => u.map(x => x / Math.sqrt(Math.max(eig.values[i], 1e-6 * eig.values[0]))));
type Space = { name: string; make: () => { rows: Float32Array; q: Float32Array } };
const SPACES: Space[] = [
  { name: 'base', make: () => ({ rows: baseRows, q: queryVecs }) },
  { name: 'center', make: () => ({ rows: project(baseRows, mu, null, null), q: project(queryVecs, mu, null, null) }) },
  ...[1, 2, 4, 8].map(D => ({
    name: `abtt${D}`,
    make: () => ({ rows: project(baseRows, mu, null, eig.vectors.slice(0, D)), q: project(queryVecs, mu, null, eig.vectors.slice(0, D)) }),
  })),
  ...[384, 256, 128].map(k => ({
    name: `whiten${k}`,
    make: () => ({ rows: project(baseRows, mu, whitenP(k), null), q: project(queryVecs, mu, whitenP(k), null) }),
  })),
];

// ---- scanning and aggregation ------------------------------------------------
const AGGS = maxParts > 1 ? ['max', 'top2', 'top3', 'lse0.01', 'lse0.03', 'lse0.1'] : ['max'];
const TAUS = [0.01, 0.03, 0.1];
type Leg = { ids: Int32Array; scores: Float32Array };
type QueryState = { legs: Map<string, Leg>; bestRow: Int32Array; bestScore: Float32Array; touched: Int32Array };

/** Top n by score, descending, ties by doc index; from parallel arrays over `docs`. */
function topN(docs: Int32Array, score: (d: number) => number, n: number): Leg {
  const heapD = new Int32Array(n), heapS = new Float64Array(n);
  let size = 0;
  const less = (sa: number, da: number, sb: number, db: number) => sa < sb || (sa === sb && da > db);
  for (let i = 0; i < docs.length; i++) {
    const d = docs[i], s = score(d);
    if (size < n) {
      let j = size++; heapD[j] = d; heapS[j] = s;
      while (j > 0) { const p = (j - 1) >> 1; if (!less(heapS[j], heapD[j], heapS[p], heapD[p])) break; [heapD[j], heapD[p]] = [heapD[p], heapD[j]]; [heapS[j], heapS[p]] = [heapS[p], heapS[j]]; j = p; }
    } else if (less(heapS[0], heapD[0], s, d)) {
      heapD[0] = d; heapS[0] = s; let j = 0;
      for (;;) {
        const l = 2 * j + 1, r = l + 1; let m = j;
        if (l < size && less(heapS[l], heapD[l], heapS[m], heapD[m])) m = l;
        if (r < size && less(heapS[r], heapD[r], heapS[m], heapD[m])) m = r;
        if (m === j) break;
        [heapD[j], heapD[m]] = [heapD[m], heapD[j]]; [heapS[j], heapS[m]] = [heapS[m], heapS[j]]; j = m;
      }
    }
  }
  const order = [...Array(size).keys()].sort((a, b) => heapS[b] - heapS[a] || heapD[a] - heapD[b]);
  return { ids: Int32Array.from(order, i => heapD[i]), scores: Float32Array.from(order, i => heapS[i]) };
}

// Per-doc accumulators, reused across queries.
const accMax = new Float32Array(nDocs).fill(-Infinity), acc2 = new Float32Array(nDocs), acc3 = new Float32Array(nDocs);
const accBest = new Int32Array(nDocs), accLse = TAUS.map(() => new Float64Array(nDocs)), accCount = new Int32Array(nDocs);

/** Score every candidate part of each query in `qis` against `qv` (one vector per entry), and aggregate. */
function scan(R: Float32Array, qv: Float32Array, qis: number[], aggs: string[]): QueryState[] {
  const out: QueryState[] = [];
  const B = 32;
  for (let b0 = 0; b0 < qis.length; b0 += B) {
    const batch = qis.slice(b0, b0 + B);
    const cands = batch.map(qi => candRows(qi));
    const shared = cands.every(c => c === null);
    const scores = batch.map((_, j) => new Float32Array(cands[j] ? cands[j]!.length : nRows));
    if (shared) {
      for (let r = 0; r < nRows; r++) {
        const base = r * DIM;
        for (let j = 0; j < batch.length; j++) {
          const qb = (b0 + j) * DIM; let s = 0;
          for (let d = 0; d < DIM; d++) s += qv[qb + d] * R[base + d];
          scores[j][r] = s;
        }
      }
    } else {
      batch.forEach((_, j) => {
        const c = cands[j]!, qb = (b0 + j) * DIM, sc = scores[j];
        for (let i = 0; i < c.length; i++) {
          const base = c[i] * DIM; let s = 0;
          for (let d = 0; d < DIM; d++) s += qv[qb + d] * R[base + d];
          sc[i] = s;
        }
      });
    }
    batch.forEach((qi, j) => {
      const c = cands[j], sc = scores[j], n = c ? c.length : nRows;
      const touched: number[] = [];
      for (let i = 0; i < n; i++) {
        const r = c ? c[i] : i, d = rowDoc[r], s = sc[i];
        if (accCount[d] === 0) { touched.push(d); accMax[d] = -Infinity; acc2[d] = -Infinity; acc3[d] = -Infinity; for (const a of accLse) a[d] = 0; }
        accCount[d]++;
        if (s > accMax[d]) { acc3[d] = acc2[d]; acc2[d] = accMax[d]; accMax[d] = s; accBest[d] = r; }
        else if (s > acc2[d]) { acc3[d] = acc2[d]; acc2[d] = s; }
        else if (s > acc3[d]) acc3[d] = s;
        if (aggs.length > 1) TAUS.forEach((t, k) => { accLse[k][d] += Math.exp((s - 1) / t); });
      }
      const docs = Int32Array.from(touched);
      const legs = new Map<string, Leg>();
      for (const a of aggs) {
        const f: (d: number) => number =
          a === 'max' ? d => accMax[d]
          : a === 'top2' ? d => accCount[d] >= 2 ? (accMax[d] + acc2[d]) / 2 : accMax[d]
          : a === 'top3' ? d => accCount[d] >= 3 ? (accMax[d] + acc2[d] + acc3[d]) / 3 : accCount[d] === 2 ? (accMax[d] + acc2[d]) / 2 : accMax[d]
          : (() => { const k = TAUS.indexOf(Number(a.slice(3))); const t = TAUS[k]; return (d: number) => 1 + t * Math.log(accLse[k][d]); })();
        legs.set(a, topN(docs, f, LEG));
      }
      const bestRow = new Int32Array(nDocs).fill(-1), bestScore = new Float32Array(nDocs).fill(-Infinity);
      for (const d of touched) { bestRow[d] = accBest[d]; bestScore[d] = accMax[d]; accCount[d] = 0; }
      out[qi] = { legs, bestRow, bestScore, touched: docs };
    });
  }
  return out;
}

// ---- fusion, MMR, metrics ------------------------------------------------------
type Ranked = { ids: number[]; scores: number[] };
const FUSIONS: string[] = [
  'vec', 'kw',
  ...[1, 5, 10, 20, 30, 60, 120].map(k => `rrf${k}`),
  ...[0.3, 0.4, 0.6, 0.7].map(w => `wrrf${w}`),
  ...['mm', 'tmm', 'z'].flatMap(n => [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9].map(a => `cc-${n}${a}`)),
];

function fuse(name: string, vec: Leg, kw: { ids: number[]; scores: number[] }): Ranked {
  if (name === 'vec') return { ids: [...vec.ids], scores: [...vec.scores] };
  if (name === 'kw') return { ids: kw.ids, scores: kw.scores };
  const score = new Map<number, number>();
  const add = (id: number, s: number) => score.set(id, (score.get(id) ?? 0) + s);
  if (name.startsWith('rrf') || name.startsWith('wrrf')) {
    const k = name.startsWith('rrf') ? Number(name.slice(3)) : 60;
    const w = name.startsWith('wrrf') ? Number(name.slice(4)) : 0.5;
    vec.ids.forEach((id, i) => add(id, 2 * w / (k + i + 1)));
    kw.ids.forEach((id, i) => add(id, 2 * (1 - w) / (k + i + 1)));
  } else {
    const m = /^cc-(mm|tmm|z)([\d.]+)$/.exec(name)!; const a = Number(m[2]);
    const norm = (s: ArrayLike<number>, floor: number | null) => {
      const arr = Array.from(s);
      if (arr.length === 0) return [];
      if (m[1] === 'z') {
        const mean = arr.reduce((x, y) => x + y, 0) / arr.length;
        const sd = Math.sqrt(arr.reduce((x, y) => x + (y - mean) ** 2, 0) / arr.length) || 1;
        return arr.map(x => (x - mean) / sd);
      }
      const max = Math.max(...arr), min = m[1] === 'tmm' && floor !== null ? floor : Math.min(...arr);
      return arr.map(x => (max - min > 0 ? (x - min) / (max - min) : 1));
    };
    // A document absent from a leg gets that leg's lowest normalised value (0 for mm/tmm; the min z).
    const nv = norm(vec.scores, -1), nk = norm(kw.scores, 0);
    const floorV = nv.length ? Math.min(...nv, m[1] === 'z' ? Infinity : 0) : 0;
    const floorK = nk.length ? Math.min(...nk, m[1] === 'z' ? Infinity : 0) : 0;
    const ids = new Set<number>([...vec.ids, ...kw.ids]);
    const vmap = new Map<number, number>(), kmap = new Map<number, number>();
    vec.ids.forEach((id, i) => vmap.set(id, nv[i])); kw.ids.forEach((id, i) => kmap.set(id, nk[i]));
    for (const id of ids) score.set(id, a * (vmap.get(id) ?? floorV) + (1 - a) * (kmap.get(id) ?? floorK));
  }
  const ids = [...score.keys()].sort((x, y) => score.get(y)! - score.get(x)! || x - y);
  return { ids, scores: ids.map(id => score.get(id)!) };
}

function mmr(r: Ranked, lambda: number, R: Float32Array, bestRow: Int32Array): number[] {
  const n = Math.min(MMR_DEPTH, r.ids.length);
  const ids = r.ids.slice(0, n), rel = r.scores.slice(0, n);
  const mx = Math.max(...rel), mn = Math.min(...rel);
  const nrel = rel.map(x => (mx > mn ? (x - mn) / (mx - mn) : 1));
  const chosen: number[] = [], maxSim = new Float64Array(n).fill(-Infinity), used = new Uint8Array(n);
  while (chosen.length < Math.min(10, n)) {
    let best = -1, bestV = -Infinity;
    for (let i = 0; i < n; i++) {
      if (used[i]) continue;
      const v = lambda * nrel[i] - (1 - lambda) * (chosen.length ? maxSim[i] : 0);
      if (v > bestV) { bestV = v; best = i; }
    }
    used[best] = 1; chosen.push(best);
    const rb = bestRow[ids[best]];
    for (let i = 0; i < n; i++) {
      if (used[i]) continue;
      const ri = bestRow[ids[i]];
      if (rb < 0 || ri < 0) continue;
      let s = 0; for (let d = 0; d < DIM; d++) s += R[rb * DIM + d] * R[ri * DIM + d];
      if (s > maxSim[i]) maxSim[i] = s;
    }
  }
  return chosen.map(i => ids[i]);
}

const METRICS = ['hit@5', 'R@5', 'MRR@10', 'nDCG@10'] as const;
function score(top: number[], q: Query): number[] {
  const rel = q.relevant;
  const ids = top.slice(0, 10).map(i => docIds[i]);
  const h5 = ids.slice(0, 5).filter(s => rel.has(s)).length;
  let dcg = 0, idcg = 0;
  ids.forEach((s, i) => { if (rel.has(s)) dcg += 1 / Math.log2(i + 2); });
  for (let i = 0; i < Math.min(rel.size, 10); i++) idcg += 1 / Math.log2(i + 2);
  const first = ids.findIndex(s => rel.has(s));
  return [h5 > 0 ? 1 : 0, h5 / rel.size, first < 0 ? 0 : 1 / (first + 1), dcg / idcg];
}

// ---- run ----------------------------------------------------------------------
const configs: string[] = [];
const results: Float32Array[] = []; // per config: queries x METRICS
const rankingsOut: Record<string, string[]> = {};
const qAll = queries.map((_, i) => i);
const kwOf = (qi: number) => keyword.get(queries[qi].id) ?? { ids: [], scores: [] };
function record(config: string, tops: number[][]) {
  const m = new Float32Array(queries.length * METRICS.length);
  tops.forEach((top, qi) => m.set(score(top, queries[qi]), qi * METRICS.length));
  configs.push(config); results.push(m);
  if (config === 'base|max|-|rrf60|-' || config === 'base|max|-|vec|-' || config === 'base|max|-|kw|-') {
    rankingsOut[config] = tops.map((top, qi) => [queries[qi].id, ...top.slice(0, 10).map(i => docIds[i])].join('\t'));
  }
}
function allFusions(prefix: string, states: QueryState[], aggs: string[], fusions = FUSIONS) {
  for (const a of aggs) for (const f of fusions) {
    record(`${prefix.replace('{agg}', a)}|${f}|-`, qAll.map(qi => fuse(f, states[qi].legs.get(a)!, kwOf(qi)).ids.slice(0, 10)));
  }
}

let baseStates: QueryState[] | null = null;
for (const space of SPACES) {
  const { rows: R, q: Q } = space.make();
  const states = scan(R, Q, qAll, AGGS);
  log(`scanned ${space.name}`);
  allFusions(`${space.name}|{agg}|-`, states, AGGS);
  if (space.name === 'base') {
    baseStates = states;
    // MMR over the fused top 50.
    for (const f of ['vec', 'rrf60']) for (const lambda of [0.5, 0.7, 0.85, 0.95]) {
      record(`base|max|-|${f}|mmr${lambda}`, qAll.map(qi => mmr(fuse(f, states[qi].legs.get('max')!, kwOf(qi)), lambda, R, states[qi].bestRow)));
    }
    // Vector PRF: feedback from the vector leg (v) or the fused list (h).
    for (const src of ['v', 'h']) for (const k of [3, 5, 10]) for (const alpha of [0.5, 0.7, 0.85]) {
      const Q2 = new Float32Array(queries.length * DIM);
      for (const qi of qAll) {
        const st = states[qi];
        const list = src === 'v' ? Array.from(st.legs.get('max')!.ids) : fuse('rrf60', st.legs.get('max')!, kwOf(qi)).ids;
        const fb = list.slice(0, k).map(d => st.bestRow[d]).filter(r => r >= 0);
        for (let d = 0; d < DIM; d++) {
          let s = 0; for (const r of fb) s += R[r * DIM + d];
          Q2[qi * DIM + d] = alpha * Q[qi * DIM + d] + (1 - alpha) * (fb.length ? s / fb.length : Q[qi * DIM + d]);
        }
      }
      normalizeAll(Q2);
      const st2 = scan(R, Q2, qAll, ['max']);
      allFusions(`base|{agg}|prf-${src}${k}-${alpha}`, st2, ['max'], ['vec', 'rrf60', 'rrf20', 'rrf10', 'cc-tmm0.5', 'cc-tmm0.7', 'cc-mm0.5', 'cc-mm0.7']);
    }
    log('prf and mmr done');
  }
}
void baseStates;

mkdirSync(`${dir}/ma`, { recursive: true });
const stem = `${dir}/ma/${values.model}-${mode}`;
writeFileSync(`${stem}.json`, JSON.stringify({
  dataset: dataset.key, model: values.model, mode, metrics: METRICS, configs,
  queries: queries.map(q => q.id), types: queries.map(q => q.type), maxParts, nRows, nDocs,
  eigTop: eig.values.slice(0, 8),
}));
const bin = new Float32Array(configs.length * queries.length * METRICS.length);
results.forEach((m, i) => bin.set(m, i * queries.length * METRICS.length));
writeFileSync(`${stem}.bin`, Buffer.from(bin.buffer));
for (const [c, lines] of Object.entries(rankingsOut)) writeFileSync(`${stem}.${c.split('|')[3]}.tsv`, lines.join('\n') + '\n');
log(`${configs.length} configurations written to ${stem}.{json,bin}`);
