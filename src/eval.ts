// Vector-only retrieval accuracy on LongMemEval-S, from precomputed vectors.
//
//   node src/eval.ts [--models minilm-l6,multilingual-e5-small] [--manifest manifests/x.txt]
//
// Each question searches its own haystack (LongMemEval's definition): the
// turns of its ~47 sessions. A session scores as its best turn, as claude-mem
// scores an observation by its nearest part. Relevant = answer_session_ids.
// Abstention questions (*_abs) have no relevant session and are skipped.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { distinctTurns, loadLongMemEvalS, LME_REVISION } from './longmemeval.ts';
import { MODELS, modelByKey } from './models.ts';

const K = 5; // claude-mem's default per-prompt injection limit
const BOOTSTRAP = 2000;

const { values } = parseArgs({
  options: {
    models: { type: 'string', default: MODELS.map(m => m.key).join(',') },
    manifest: { type: 'string' },
    out: { type: 'string', default: 'out' },
    results: { type: 'string', default: 'results' },
  },
});

const questions = (await loadLongMemEvalS()).filter(q => !q.question_id.endsWith('_abs'));
const manifest = values.manifest
  ? new Set(readFileSync(values.manifest, 'utf8').split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#')))
  : null;
const evaluated = manifest ? questions.filter(q => manifest.has(q.question_id)) : questions;

const allQuestions = await loadLongMemEvalS();
const rows = distinctTurns(allQuestions);
const sessionRows = new Map<string, number[]>();
rows.forEach((r, i) => {
  let list = sessionRows.get(r.sessionId);
  if (!list) sessionRows.set(r.sessionId, list = []);
  list.push(i);
});
const queryIndex = new Map(allQuestions.map((q, i) => [q.question_id, i]));

type Metrics = Record<string, number>;

function metricsFor(ranked: string[], relevant: Set<string>): Metrics {
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

function loadVectors(path: string, dims: number): Float16Array {
  const buf = readFileSync(path);
  return new Float16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2);
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
function interval(values: number[], seed = 1): [number, number] {
  const next = rng(seed), means: number[] = [];
  for (let b = 0; b < BOOTSTRAP; b++) {
    let s = 0;
    for (let i = 0; i < values.length; i++) s += values[Math.floor(next() * values.length)];
    means.push(s / values.length);
  }
  means.sort((a, b) => a - b);
  return [means[Math.floor(BOOTSTRAP * 0.025)], means[Math.floor(BOOTSTRAP * 0.975)]];
}
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;

const perModel = new Map<string, Metrics[]>();
for (const key of values.models!.split(',')) {
  const model = modelByKey(key);
  const turns = loadVectors(`${values.out}/${key}/turns.f16.bin`, model.dims);
  const queries = loadVectors(`${values.out}/${key}/queries.f16.bin`, model.dims);
  if (turns.length !== rows.length * model.dims) throw new Error(`${key}: turns.f16.bin has ${turns.length / model.dims} rows, expected ${rows.length}`);
  const results: Metrics[] = [];
  for (const q of evaluated) {
    const qi = queryIndex.get(q.question_id)!;
    const qv = queries.subarray(qi * model.dims, (qi + 1) * model.dims);
    const scored = q.haystack_session_ids.map(sessionId => {
      let best = -Infinity;
      for (const row of sessionRows.get(sessionId)!) {
        let dot = 0;
        const base = row * model.dims;
        for (let d = 0; d < model.dims; d++) dot += qv[d] * turns[base + d];
        if (dot > best) best = dot;
      }
      return { sessionId, best };
    });
    scored.sort((a, b) => b.best - a.best || (a.sessionId < b.sessionId ? -1 : 1));
    results.push(metricsFor(scored.map(s => s.sessionId), new Set(q.answer_session_ids)));
  }
  perModel.set(key, results);
}

const names = Object.keys(perModel.values().next().value![0]);
const fmt = (x: number) => x.toFixed(3);
let md = `# LongMemEval-S, vector only\n\n` +
  `Dataset revision ${LME_REVISION}; ${evaluated.length} questions` +
  (values.manifest ? ` from ${values.manifest}` : ' (all answerable)') +
  `; each searches its own haystack; a session scores as its best turn; ` +
  `95% intervals from ${BOOTSTRAP} bootstrap resamples over questions.\n\n` +
  `Absolute values are estimates against labels with errors in both ` +
  `directions; see the README's "Caveat on absolute accuracy". Paired ` +
  `differences between models are the reliable comparison.\n\n` +
  `| Model | ${names.join(' | ')} |\n|---|${names.map(() => '---').join('|')}|\n`;
for (const [key, results] of perModel) {
  md += `| ${key} | ${names.map(n => {
    const v = results.map(r => r[n]); const [lo, hi] = interval(v);
    return `${fmt(mean(v))} (${fmt(lo)}–${fmt(hi)})`;
  }).join(' | ')} |\n`;
}
const types = [...new Set(evaluated.map(q => q.question_type))].sort();
md += `\n## R@5 and F1@5 by question type\n\n| Model | ${types.map(t => `${t} (${evaluated.filter(q => q.question_type === t).length})`).join(' | ')} |\n|---|${types.map(() => '---').join('|')}|\n`;
for (const [key, results] of perModel) {
  md += `| ${key} | ${types.map(t => {
    const sel = results.filter((_, i) => evaluated[i].question_type === t);
    return `${fmt(mean(sel.map(r => r['R@5'])))} / ${fmt(mean(sel.map(r => r['F1@5'])))}`;
  }).join(' | ')} |\n`;
}
const base = [...perModel.keys()][0];
if (perModel.size > 1) {
  md += `\n## Paired difference from ${base}\n\n| Model | ${names.join(' | ')} |\n|---|${names.map(() => '---').join('|')}|\n`;
  for (const [key, results] of perModel) {
    if (key === base) continue;
    md += `| ${key} | ${names.map(n => {
      const d = results.map((r, i) => r[n] - perModel.get(base)![i][n]); const [lo, hi] = interval(d);
      return `${d.length && mean(d) >= 0 ? '+' : ''}${fmt(mean(d))} (${fmt(lo)}–${fmt(hi)})`;
    }).join(' | ')} |\n`;
  }
}
mkdirSync(values.results!, { recursive: true });
const name = values.manifest ? values.manifest.replace(/^.*\//, '').replace(/\.txt$/, '') : 'all';
writeFileSync(`${values.results}/longmemeval-s-vector-${name}.md`, md);
console.log(md);
