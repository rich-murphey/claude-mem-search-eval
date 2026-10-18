// Retrieval metrics over ranked session ids, bootstrap intervals, and the
// markdown tables both evaluations write.
import { readFileSync } from 'node:fs';

export const K = 5; // claude-mem's default per-prompt injection limit
export const BOOTSTRAP = 2000;

export type Metrics = Record<string, number>;

export function metricsFor(ranked: string[], relevant: Set<string>): Metrics {
  const hitAt = (k: number) => ranked.slice(0, k).filter(s => relevant.has(s)).length;
  const r = relevant.size;
  const p5 = hitAt(K) / K, r5 = hitAt(K) / r;
  let dcg = 0, idcg = 0;
  ranked.slice(0, 10).forEach((s, i) => { if (relevant.has(s)) dcg += 1 / Math.log2(i + 2); });
  for (let i = 0; i < Math.min(r, 10); i++) idcg += 1 / Math.log2(i + 2);
  const first = ranked.findIndex(s => relevant.has(s));
  return {
    'P@5': p5,
    'R@5': r5,
    'F1@5': p5 + r5 > 0 ? (2 * p5 * r5) / (p5 + r5) : 0,
    'R@10': hitAt(10) / r,
    'R-prec': hitAt(r) / r,
    'MRR': first < 0 ? 0 : 1 / (first + 1),
    'nDCG@10': dcg / idcg,
  };
}

/** fp16 rows as fp32, renormalised: fp16 rounding leaves each norm slightly off 1. */
export function loadVectors(path: string, dims: number): Float32Array {
  const buf = readFileSync(path);
  const v = Float32Array.from(new Float16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2));
  for (let r = 0; r < v.length; r += dims) {
    let norm = 0;
    for (let d = 0; d < dims; d++) norm += v[r + d] * v[r + d];
    norm = Math.sqrt(norm);
    for (let d = 0; d < dims; d++) v[r + d] /= norm;
  }
  return v;
}

/** Question ids listed in a manifest file, comments and blank lines skipped. */
export function readManifest(path: string): Set<string> {
  return new Set(readFileSync(path, 'utf8').split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#')));
}

// Deterministic resampling (mulberry32), so intervals are reproducible.
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function interval(values: number[], seed = 1): [number, number] {
  const next = rng(seed), means: number[] = [];
  for (let b = 0; b < BOOTSTRAP; b++) {
    let s = 0;
    for (let i = 0; i < values.length; i++) s += values[Math.floor(next() * values.length)];
    means.push(s / values.length);
  }
  means.sort((a, b) => a - b);
  return [means[Math.floor(BOOTSTRAP * 0.025)], means[Math.floor(BOOTSTRAP * 0.975)]];
}
export const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;

export const RELATIVE_ACCURACY_NOTE =
  `Best treated as a measurement of relative accuracy between models, given ` +
  `the label errors discussed in the README ("Caveat on absolute accuracy").`;

/**
 * The overall table, R@5 / F1@5 by question type, and paired differences.
 * `runs` maps a row label to per-question metrics in `questions` order;
 * `pairs` lists [label, baseline label] for the difference table.
 */
export function renderTables(
  runs: Map<string, Metrics[]>,
  questions: { question_type: string }[],
  pairs: [string, string][],
): string {
  const names = Object.keys(runs.values().next().value![0]);
  const fmt = (x: number) => x.toFixed(3);
  const head = (first: string, cols: string[]) => `| ${first} | ${cols.join(' | ')} |\n|---|${cols.map(() => '---').join('|')}|\n`;
  let md = head('Run', names);
  for (const [label, results] of runs) {
    md += `| ${label} | ${names.map(n => {
      const v = results.map(r => r[n]); const [lo, hi] = interval(v);
      return `${fmt(mean(v))} (${fmt(lo)}–${fmt(hi)})`;
    }).join(' | ')} |\n`;
  }
  const types = [...new Set(questions.map(q => q.question_type))].sort();
  md += `\n## R@5 / F1@5 by question type\n\n` +
    head('Run', types.map(t => `${t} (${questions.filter(q => q.question_type === t).length})`));
  for (const [label, results] of runs) {
    md += `| ${label} | ${types.map(t => {
      const sel = results.filter((_, i) => questions[i].question_type === t);
      return `${fmt(mean(sel.map(r => r['R@5'])))} / ${fmt(mean(sel.map(r => r['F1@5'])))}`;
    }).join(' | ')} |\n`;
  }
  if (pairs.length > 0) {
    md += `\n## Paired differences\n\nPer-question difference, then the mean and its 95% interval.\n\n` +
      head('Run − baseline', names);
    for (const [label, base] of pairs) {
      const a = runs.get(label)!, b = runs.get(base)!;
      md += `| ${label} − ${base} | ${names.map(n => {
        const d = a.map((r, i) => r[n] - b[i][n]); const [lo, hi] = interval(d);
        return `${mean(d) >= 0 ? '+' : ''}${fmt(mean(d))} (${fmt(lo)}–${fmt(hi)})`;
      }).join(' | ')} |\n`;
    }
  }
  return md;
}
