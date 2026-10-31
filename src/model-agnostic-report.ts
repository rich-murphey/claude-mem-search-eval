// Cross-validated, paired comparison of the configurations src/model-agnostic.ts
// scored, against claude-mem's current hybrid search; writes the tables of
// results/model-agnostic.md's measured part to stdout.
//
//   node src/model-agnostic-report.ts [--models minilm-l6,multilingual-e5-small]
//
// No parameter is chosen on the queries it is scored on. Queries split into two
// folds by sha256(dataset/query id); for each technique, the setting with the
// best macro-averaged nDCG@10 over every dataset's fold-A queries is scored on
// fold B, and the reverse, so each query is scored once, under a setting chosen
// without it. One setting serves all datasets of a set at once, as one constant
// in claude-mem's code would. Differences are per query against the baseline,
// then averaged per dataset; the macro mean averages the datasets, and its 95%
// interval resamples queries within each dataset (2,000 resamples, fixed seed).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { interval } from './metrics.ts';

const { values } = parseArgs({
  options: {
    models: { type: 'string', default: 'minilm-l6,multilingual-e5-small' },
    out: { type: 'string', default: 'out' },
  },
});
const MIRACL = ['miracl-en', 'miracl-zh', 'miracl-ko', 'miracl-ja'];
const SETS: Record<string, [string, string][]> = {
  store: [['longmemeval-s', 'store'], ['memsearch-zh', 'store'], ['memsearch-en', 'store'], ...MIRACL.map(d => [d, 'scoped'] as [string, string])],
  scoped: [['longmemeval-s', 'scoped'], ['memsearch-zh', 'scoped'], ['memsearch-en', 'scoped'], ...MIRACL.map(d => [d, 'scoped'] as [string, string])],
};
const SHORT: Record<string, string> = {
  'longmemeval-s': 'LME', 'memsearch-zh': 'ms-zh', 'memsearch-en': 'ms-en',
  'miracl-en': 'M-en', 'miracl-zh': 'M-zh', 'miracl-ko': 'M-ko', 'miracl-ja': 'M-ja',
};
const BASE_H = 'base|max|-|rrf60|-', BASE_V = 'base|max|-|vec|-';
const SELECT = 'nDCG@10';

type Run = { dataset: string; configs: Map<string, number>; queries: string[]; metrics: string[]; data: Float32Array; fold: Uint8Array; nQ: number; nM: number; maxParts: number };
function load(dataset: string, model: string, mode: string): Run | null {
  const stem = `${values.out}/${dataset}/ma/${model}-${mode}`;
  if (!existsSync(`${stem}.json`)) return null;
  const meta = JSON.parse(readFileSync(`${stem}.json`, 'utf8'));
  const buf = readFileSync(`${stem}.bin`);
  const data = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  return {
    dataset, configs: new Map(meta.configs.map((c: string, i: number) => [c, i])), queries: meta.queries, metrics: meta.metrics,
    data, nQ: meta.queries.length, nM: meta.metrics.length, maxParts: meta.maxParts,
    fold: Uint8Array.from(meta.queries, (q: string) => createHash('sha256').update(`${dataset}/${q}`).digest()[0] & 1),
  };
}
const metricOf = (r: Run, config: string, q: number, m: number) => r.data[(r.configs.get(config)! * r.nQ + q) * r.nM + m];

/** Families: a name, its candidate configurations (baseline included where it is one of the settings), and the baseline. */
type Family = { name: string; where: string; candidates: (all: string[]) => string[]; baseline: string };
const fam = (name: string, where: string, re: RegExp, baseline: string, extra: string[] = []): Family =>
  ({ name, where, candidates: all => [...new Set([...all.filter(c => re.test(c)), ...extra])], baseline });
const HYBRID: Family[] = [
  fam('RRF k (1-120)', 'fusion', /^base\|max\|-\|rrf\d+\|-$/, BASE_H),
  fam('weighted RRF, k = 60 (w_vec 0.3-0.7)', 'fusion', /^base\|max\|-\|wrrf[\d.]+\|-$/, BASE_H, [BASE_H]),
  fam('convex combination, min-max (α 0-1)', 'fusion', /^base\|max\|-\|cc-mm[\d.]+\|-$/, BASE_H, [BASE_V, 'base|max|-|kw|-']),
  fam('convex combination, theoretical-min (α 0-1)', 'fusion', /^base\|max\|-\|cc-tmm[\d.]+\|-$/, BASE_H, [BASE_V, 'base|max|-|kw|-']),
  fam('convex combination, z-score (α 0-1)', 'fusion', /^base\|max\|-\|cc-z[\d.]+\|-$/, BASE_H, [BASE_V, 'base|max|-|kw|-']),
  fam('any fusion above', 'fusion', /^base\|max\|-\|(rrf|wrrf|cc-|vec|kw)[^|]*\|-$/, BASE_H),
  fam('vector only (drop keyword leg)', 'fusion', /^base\|max\|-\|vec\|-$/, BASE_H),
  fam('mean-centring', 'space', /^center\|max\|-\|rrf60\|-$/, BASE_H),
  fam('all-but-the-top, D = 1-8', 'space', /^abtt\d\|max\|-\|rrf60\|-$/, BASE_H),
  fam('whitening, k = 384/256/128', 'space', /^whiten\d+\|max\|-\|rrf60\|-$/, BASE_H),
  fam('part aggregation (top-2/3 mean, soft max)', 'agg', /^base\|[^|]+\|-\|rrf60\|-$/, BASE_H),
  fam('vector PRF (Rocchio), RRF 60', 'prf', /^base\|max\|prf-[^|]+\|rrf60\|-$/, BASE_H, [BASE_H]),
  fam('vector PRF + any fusion', 'prf', /^base\|max\|prf-[^|]+\|[^|]+\|-$/, BASE_H, [BASE_H]),
  fam('MMR over fused top 50 (λ 0.5-0.95)', 'mmr', /^base\|max\|-\|rrf60\|mmr[\d.]+$/, BASE_H, [BASE_H]),
  fam('space × aggregation × fusion, best of all', 'stack', /^[^|]+\|[^|]+\|-\|[^|]+\|-$/, BASE_H),
];
const VECTOR: Family[] = [
  fam('mean-centring', 'space', /^center\|max\|-\|vec\|-$/, BASE_V),
  fam('all-but-the-top, D = 1-8', 'space', /^abtt\d\|max\|-\|vec\|-$/, BASE_V),
  fam('whitening, k = 384/256/128', 'space', /^whiten\d+\|max\|-\|vec\|-$/, BASE_V),
  fam('part aggregation', 'agg', /^base\|[^|]+\|-\|vec\|-$/, BASE_V),
  fam('vector PRF from vector top k', 'prf', /^base\|max\|prf-v[^|]+\|vec\|-$/, BASE_V, [BASE_V]),
  fam('vector PRF from hybrid top k', 'prf', /^base\|max\|prf-h[^|]+\|vec\|-$/, BASE_V, [BASE_V]),
  fam('MMR over top 50', 'mmr', /^base\|max\|-\|vec\|mmr[\d.]+$/, BASE_V, [BASE_V]),
];

/** Choose on `selectOn`'s training folds (default: the scored runs themselves), score `runs`' other folds. */
function evaluate(runs: Run[], f: Family, selectOn: Run[] = runs) {
  const cands = f.candidates([...runs[0].configs.keys()]).filter(c => runs.every(r => r.configs.has(c)) && selectOn.every(r => r.configs.has(c)));
  const sel = runs[0].metrics.indexOf(SELECT);
  const chosen: string[] = [];
  for (const train of [0, 1]) {
    let best = '', bestV = -Infinity;
    for (const c of cands) {
      let macro = 0;
      for (const r of selectOn) {
        let s = 0, n = 0;
        for (let q = 0; q < r.nQ; q++) if (r.fold[q] === train) { s += metricOf(r, c, q, sel); n++; }
        macro += s / n;
      }
      if (macro > bestV + 1e-12) { bestV = macro; best = c; }
    }
    chosen.push(best);
  }
  // Fold 0 trains the setting fold 1 is scored on, and the reverse.
  const perDataset = runs.map(r => r.metrics.map((_, m) => {
    const d: number[] = [];
    for (let q = 0; q < r.nQ; q++) d.push(metricOf(r, chosen[1 - r.fold[q]], q, m) - metricOf(r, f.baseline, q, m));
    return d;
  }));
  return { chosen, perDataset, nCands: cands.length };
}

const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
function macroInterval(perDataset: number[][]): [number, number, number] {
  // Stratified bootstrap: resample each dataset's queries, average the dataset means.
  let seed = 7;
  const next = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const means: number[] = [];
  for (let b = 0; b < 2000; b++) {
    let s = 0;
    for (const v of perDataset) { let t = 0; for (let i = 0; i < v.length; i++) t += v[Math.floor(next() * v.length)]; s += t / v.length; }
    means.push(s / perDataset.length);
  }
  means.sort((a, b) => a - b);
  return [mean(perDataset.map(mean)), means[50], means[1949]];
}
const f3 = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(3)}`;
const ci = ([m, lo, hi]: [number, number, number]) => `${f3(m)} (${f3(lo)}…${f3(hi)})`;
const short = (c: string) => c.split('|').filter(x => x !== '-' && x !== 'base' && x !== 'max').join(' ') || 'baseline';

const models = values.models!.split(',');
for (const model of models) {
  for (const [setName, members] of Object.entries(SETS)) {
    const runs = members.map(([d, m]) => load(d, model, m)).filter((r): r is Run => r !== null);
    // The other model's runs, to score a setting chosen on it: does the constant transfer?
    const other = models.find(m => m !== model);
    const otherRuns = other ? members.map(([d, m]) => load(d, other, m)).filter((r): r is Run => r !== null) : [];
    const transfer = otherRuns.length === runs.length;
    if (runs.length === 0) continue;
    const names = runs.map(r => SHORT[r.dataset]);
    console.log(`\n### ${model}, ${setName} mode (${names.join(', ')})\n`);
    // Absolute baseline levels.
    console.log(`Baseline (current hybrid; vector only) per dataset, R@5 / nDCG@10: ` + runs.map(r => {
      const m = (c: string, k: string) => mean(Array.from({ length: r.nQ }, (_, q) => metricOf(r, c, q, r.metrics.indexOf(k)))).toFixed(3);
      return `${SHORT[r.dataset]} ${m(BASE_H, 'R@5')}/${m(BASE_H, 'nDCG@10')}; ${m(BASE_V, 'R@5')}/${m(BASE_V, 'nDCG@10')}`;
    }).join(' · ') + '\n');
    for (const [view, families] of [['Against the current hybrid (RRF 60)', HYBRID], ['Vector leg alone, against vector only', VECTOR]] as const) {
      const rowsOut: { line: string; key: number }[] = [];
      for (const f of families) {
        const { chosen, perDataset } = evaluate(runs, f);
        const mi = (k: string) => runs[0].metrics.indexOf(k);
        const macro = (k: string) => macroInterval(perDataset.map(p => p[mi(k)]));
        const r5 = macro('R@5');
        const tags = runs.map((r, i) => {
          const d = perDataset[i][mi('R@5')]; const [lo, hi] = interval(d); const m = mean(d);
          return lo > 0 ? `${SHORT[r.dataset]} ${f3(m)}` : hi < 0 ? `${SHORT[r.dataset]} ${f3(m)}` : null;
        });
        const helps = runs.map((r, i) => (tags[i] && mean(perDataset[i][mi('R@5')]) > 0 ? tags[i] : null)).filter(Boolean).join(', ') || '—';
        const hurts = runs.map((r, i) => (tags[i] && mean(perDataset[i][mi('R@5')]) < 0 ? tags[i] : null)).filter(Boolean).join(', ') || '—';
        const perDs = runs.map((r, i) => `${f3(mean(perDataset[i][mi('R@5')]))}`).join(' / ');
        const moved = transfer ? macroInterval(evaluate(runs, f, otherRuns).perDataset.map(p => p[mi('R@5')])) : null;
        rowsOut.push({
          key: r5[0],
          line: `| ${f.name} | ${[...new Set(chosen.map(short))].join('; ')} | ${ci(r5)} | ${ci(macro('nDCG@10'))} | ${ci(macro('hit@5'))} | ${perDs} | ${helps} | ${hurts} |${moved ? ` ${ci(moved)} |` : ''}`,
        });
      }
      rowsOut.sort((a, b) => b.key - a.key);
      console.log(`#### ${view}\n\n| Technique | Setting chosen (fold A; fold B) | ΔR@5 macro (95%) | ΔnDCG@10 macro | Δhit@5 macro | ΔR@5 ${names.join(' / ')} | Helps (R@5, 95% > 0) | Hurts (R@5, 95% < 0) |${transfer ? ` ΔR@5 macro, setting chosen on ${other} |` : ''}\n|---|---|---|---|---|---|---|---|${transfer ? '---|' : ''}`);
      for (const r of rowsOut) console.log(r.line);
      console.log('');
    }
  }
}

// Cross-encoder reranking (src/rerank.ts), where it was run: paired against
// the same queries' current hybrid ranking.
const rerankRows: string[] = [];
for (const [dataset, mode] of [...SETS.store, ...SETS.scoped]) {
  for (const depth of [50]) {
    const path = `${values.out}/${dataset}/ma/rerank-${mode}-${depth}.json`;
    if (!existsSync(path) || rerankRows.some(r => r.startsWith(`| ${SHORT[dataset]} ${mode} `))) continue;
    const r = JSON.parse(readFileSync(path, 'utf8'));
    const res: { base: number[]; rerank: number[]; ms: number; pairs: number }[] = r.results;
    const col = (m: number) => {
      const d = res.map(x => x.rerank[m] - x.base[m]); const [lo, hi] = interval(d);
      return `${mean(res.map(x => x.base[m])).toFixed(3)} → ${mean(res.map(x => x.rerank[m])).toFixed(3)}, ${ci([mean(d), lo, hi])}`;
    };
    const ms = res.map(x => x.ms).sort((a, b) => a - b);
    rerankRows.push(`| ${SHORT[dataset]} ${mode} | ${res.length} | ${col(1)} | ${col(3)} | ${col(0)} | ${mean(res.map(x => x.pairs)).toFixed(0)} | ${ms[Math.floor(ms.length / 2)].toFixed(0)} / ${ms[Math.floor(ms.length * 0.95)].toFixed(0)} |`);
  }
}
if (rerankRows.length) {
  console.log(`\n### Cross-encoder rerank of the hybrid top 50 (minilm-l6)\n\n| Dataset | Queries | R@5 (Δ, 95%) | nDCG@10 (Δ, 95%) | hit@5 (Δ, 95%) | Pairs/query | ms p50 / p95 |\n|---|---|---|---|---|---|---|`);
  for (const row of rerankRows) console.log(row);
}
