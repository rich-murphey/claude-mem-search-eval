// Pilot summary for the memory benchmark (claude-mem-rs#52).
//
//   node bench/memory/report.ts --out results/memory-bench/pilot --usage results/memory-bench/pilot/usage.jsonl
//        --pins bench/memory/pins.json --summary <path to pilot-summary.json> [--kappa-sample 0.1]
//
// Reads each arm's ingest, answers, judgments, windows and sampler CSV, the
// proxy's usage log, and writes pilot-summary.json in the shape
// docs/memory-benchmark.md § pilot-summary.json defines. Accuracy is the
// first answer of each question (rep 0); the spread of repeats is reported
// separately. CIs: 10,000-sample bootstrap (paired for comparisons); exact
// McNemar on discordant questions.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { appendJsonl, approxTokens, isAbstention, loadS, pool, readJsonl, readManifest, rng, writeJson, type Question } from './common.ts';
import { judge, SECOND_JUDGE_MODEL } from './judge.ts';

const { values } = parseArgs({
  options: {
    out: { type: 'string', default: 'results/memory-bench/pilot' },
    usage: { type: 'string' },
    pins: { type: 'string', default: 'bench/memory/pins.json' },
    manifest: { type: 'string', default: 'manifests/memory-bench-pilot-120.txt' },
    summary: { type: 'string' },
    'kappa-sample': { type: 'string', default: '0.1' },
    published: { type: 'string', default: `${process.env.HOME}/.cache/memory-bench/honcho-benchmarks/a1d689b/longmemeval_s_results_20251212_201328.json` },
  },
});
const OUT = values.out!;
const ARMS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
const B = 10_000;

const all = await loadS();
const byId = new Map(all.map(q => [q.question_id, q]));
const ids = readManifest(values.manifest!);
const qs = ids.map(id => byId.get(id)!) as Question[];

// ---------- statistics ----------
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
function quantile(xs: number[], p: number) {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return NaN;
  const i = (s.length - 1) * p;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
}
function bootstrapMean(xs: number[], seed = 1): [number, number] {
  const r = rng(seed);
  const ms = Array.from({ length: B }, () => { let s = 0; for (let i = 0; i < xs.length; i++) s += xs[Math.floor(r() * xs.length)]; return s / xs.length; });
  return [quantile(ms, 0.025), quantile(ms, 0.975)];
}
function bootstrapMedian(xs: number[], seed = 2): [number, number] {
  const r = rng(seed);
  const ms = Array.from({ length: 2000 }, () => quantile(Array.from(xs, () => xs[Math.floor(r() * xs.length)]), 0.5));
  return [quantile(ms, 0.025), quantile(ms, 0.975)];
}
function binomTail(k: number, n: number): number {
  // P(X <= k), X ~ Bin(n, 1/2), exact in log space
  let p = 0;
  const lf = (m: number) => { let s = 0; for (let i = 2; i <= m; i++) s += Math.log(i); return s; };
  for (let i = 0; i <= k; i++) p += Math.exp(lf(n) - lf(i) - lf(n - i) - n * Math.LN2);
  return p;
}
function mcnemar(a: boolean[], b: boolean[]): number {
  let b01 = 0, b10 = 0;
  a.forEach((x, i) => { if (x && !b[i]) b10++; if (!x && b[i]) b01++; });
  const n = b01 + b10;
  return n === 0 ? 1 : Math.min(1, 2 * binomTail(Math.min(b01, b10), n));
}
function cohenKappa(a: boolean[], b: boolean[]): number {
  const n = a.length;
  const po = a.filter((x, i) => x === b[i]).length / n;
  const pa = a.filter(Boolean).length / n, pb = b.filter(Boolean).length / n;
  const pe = pa * pb + (1 - pa) * (1 - pb);
  return pe === 1 ? 1 : (po - pe) / (1 - pe);
}

// ---------- per-arm inputs ----------
const dirOf = (arm: string) => `${OUT}/arm-${arm}`;
const labels = (arm: string, rep = 0) => {
  const m = new Map<string, boolean>();
  for (const j of readJsonl(`${dirOf(arm)}/judgments.jsonl`)) if (j.rep === rep) m.set(j.question_id, j.label);
  return m;
};
const answersOf = (arm: string) => readJsonl(`${dirOf(arm)}/answers.jsonl`);
const windowsOf = (arm: string) => readJsonl(`${dirOf(arm)}/windows.jsonl`).map(w => ({ ...w, s: Date.parse(w.start), e: Date.parse(w.end) }));

// ---------- usage ----------
const usage = values.usage && existsSync(values.usage) ? readJsonl(values.usage).map(u => ({ ...u, t: Date.parse(u.ts) })) : [];
function usageFor(tagPrefix: string, wins: { s: number; e: number }[] | null) {
  const rows = usage.filter(u => u.tag.startsWith(tagPrefix) && u.status === 200 && (!wins || wins.some(w => u.t >= w.s && u.t <= w.e + 5000)));
  return {
    calls: rows.length,
    input: rows.reduce((a, u) => a + (u.input_tokens ?? 0), 0),
    output: rows.reduce((a, u) => a + (u.output_tokens ?? 0), 0),
    cached: rows.reduce((a, u) => a + (u.cached_tokens ?? 0), 0),
    usd: rows.reduce((a, u) => a + (u.cost_usd ?? 0), 0),
  };
}
// List prices (USD per 1M tokens) for calls the provider returns no cost for, fetched 2026-11-06.
const PRICE: Record<string, [number, number]> = { 'text-embedding-3-small': [0.02, 0], 'gpt-4o-2024-08-06': [2.5, 10] };
function usdNoCost(tag: string) {
  return usage.filter(u => u.tag.startsWith(tag) && u.status === 200 && u.cost_usd == null)
    .reduce((a, u) => a + ((PRICE[u.model]?.[0] ?? 0) * u.input_tokens + (PRICE[u.model]?.[1] ?? 0) * u.output_tokens) / 1e6, 0);
}

// ---------- sampler ----------
function cpuMem(arm: string) {
  const path = `${dirOf(arm)}/samples.csv`;
  if (!existsSync(path)) return null;
  const lines = readFileSync(path, 'utf8').trim().split('\n').slice(1).map(l => l.split(','));
  // per ts: sum over groups
  const byTs = new Map<string, { phase: string; usage: number; mem: number; peak: number; host: number }>();
  for (const [ts, phase, , u, mc, mp, , , host] of lines) {
    const k = ts;
    const v = byTs.get(k) ?? { phase, usage: 0, mem: 0, peak: 0, host: Number(host) };
    v.usage += Number(u); v.mem += Number(mc) || 0; v.peak += Number(mp) || 0;
    byTs.set(k, v);
  }
  const pts = [...byTs.entries()].map(([ts, v]) => ({ ts: Number(ts), ...v })).sort((a, b) => a.ts - b.ts);
  const cpu: Record<string, number> = {}, outside: Record<string, number> = {}, secs: Record<string, number> = {};
  for (let i = 1; i < pts.length; i++) {
    const ph = pts[i - 1].phase;
    if (ph === 'idle') continue;
    const du = pts[i].usage - pts[i - 1].usage, dh = pts[i].host - pts[i - 1].host, dt = (pts[i].ts - pts[i - 1].ts) / 1000;
    if (!(du >= 0) || !(dh >= 0)) continue;
    cpu[ph] = (cpu[ph] ?? 0) + du / 1e6;
    outside[ph] = (outside[ph] ?? 0) + (dh - du) / 1e6;
    secs[ph] = (secs[ph] ?? 0) + dt;
  }
  const active = pts.filter(p => p.phase !== 'idle');
  const query = pts.filter(p => p.phase === 'query').map(p => p.mem);
  return {
    cpu, secs,
    outside_cores: Object.fromEntries(Object.keys(secs).map(k => [k, outside[k] / secs[k]])),
    mem_peak_bytes: active.length ? Math.max(...active.map(p => p.mem)) : null,
    mem_peak_cgroup_bytes: pts.length ? Math.max(...pts.map(p => p.peak)) : null,
    mem_steady_bytes: query.length ? quantile(query, 0.5) : null,
  };
}

// ---------- recall ----------
function recallAt(arm: string, k: number): number | null {
  const rows = answersOf(arm).filter(r => r.rep === 0 && Array.isArray(r.sessions));
  const vals: number[] = [];
  for (const r of rows) {
    const q = byId.get(r.question_id)!;
    if (isAbstention(q) || !q.answer_session_ids.length) continue;
    const top = new Set(r.sessions.slice(0, k));
    vals.push(q.answer_session_ids.filter(s => top.has(s)).length / q.answer_session_ids.length);
  }
  return vals.length ? mean(vals) : null;
}

// ---------- assemble ----------
const ingestedTokens = qs.reduce((a, q) => a + q.haystack_sessions.flat().reduce((b, t) => b + approxTokens(t.content), 0), 0);
const pins = existsSync(values.pins!) ? JSON.parse(readFileSync(values.pins!, 'utf8')) : {};
const storeBytes = existsSync(`${OUT}/store-bytes.json`) ? JSON.parse(readFileSync(`${OUT}/store-bytes.json`, 'utf8')) : {};

const armRows: any[] = [];
const correct: Record<string, Map<string, boolean>> = {};
for (const arm of ARMS) {
  const lab = labels(arm);
  correct[arm] = lab;
  const present = qs.filter(q => lab.has(q.question_id));
  const xs = present.map(q => (lab.get(q.question_id) ? 1 : 0));
  const byType: Record<string, number> = {};
  for (const t of new Set(present.map(q => q.question_type))) {
    const sub = present.filter(q => q.question_type === t);
    byType[t] = mean(sub.map(q => (lab.get(q.question_id) ? 1 : 0)));
  }
  const ans = answersOf(arm);
  const ingest = readJsonl(`${dirOf(arm)}/ingest.jsonl`);
  const wins = windowsOf(arm);
  const winOf = (stage: string) => wins.filter(w => w.stage === stage);
  const ingestsWithModels = ['A', 'B', 'C'].includes(arm);
  // tokens per stage
  const obsTag = arm === 'A' ? 'A.deriver' : `${arm}.observer`;
  const ing = ingestsWithModels ? usageFor(obsTag, null) : null;
  const emb = arm === 'A' ? usageFor('A.embedding', winOf('ingest')) : arm === 'E' ? usageFor('A.embedding', winOf('query')) : null;
  const ansU = arm === 'A' ? usageFor('A.dialectic', null) : usageFor(`${arm}.answer`, null);
  const usd = (ing?.usd ?? 0) + ansU.usd + (emb ? usdNoCost('A.embedding') * (emb.input / Math.max(1, usageFor('A.embedding', null).input)) : 0);
  const lat = (f: string) => ans.map(r => r[f]).filter((v: any) => typeof v === 'number');
  const e2e = lat('e2e_ms');
  const cm = cpuMem(arm);
  const msgs = ingest.reduce((a, r) => a + r.messages, 0);
  const ingestSecs = winOf('ingest').reduce((a, w) => a + (w.e - w.s) / 1000, 0);
  const queries = ans.length;
  let spread: number | null = null;
  const reps = [...new Set(ans.map(r => r.rep))];
  if (reps.length > 1) {
    const accs = reps.map(rep => { const l = labels(arm, rep); return mean(qs.filter(q => l.has(q.question_id)).map(q => (l.get(q.question_id) ? 1 : 0))); });
    spread = (Math.max(...accs) - Math.min(...accs)) * 100;
  }
  const cpuIngest = cm ? cm.cpu.ingest ?? 0 : null;
  const cpuQuery = cm ? cm.cpu.query ?? 0 : null;
  armRows.push({
    arm,
    n: present.length,
    accuracy: xs.length ? mean(xs) : null,
    ci95: xs.length ? bootstrapMean(xs) : null,
    by_type: byType,
    recall_at: { '5': recallAt(arm, 5), '10': recallAt(arm, 10) },
    tokens: {
      ingest_in: ing?.input ?? null, ingest_out: ing?.output ?? null, consolidate: null,
      answer_in: ansU.input, answer_out: ansU.output, embedding: emb?.input ?? null,
    },
    usd: Math.round(usd * 10000) / 10000,
    latency_ms: {
      ingest_ack_p50: ingest.length ? quantile(ingest.flatMap(r => r.acks_ms), 0.5) : null,
      drain_p50: ingest.length ? quantile(ingest.map(r => r.drain_ms), 0.5) : null,
      retrieval_p50: lat('retrieval_ms').length ? quantile(lat('retrieval_ms'), 0.5) : null,
      answer_p50: lat('answer_ms').length ? quantile(lat('answer_ms'), 0.5) : null,
      p50: e2e.length ? quantile(e2e, 0.5) : null,
      p95: e2e.length ? quantile(e2e, 0.95) : null,
      p99: e2e.length ? quantile(e2e, 0.99) : null,
      p50_ci95: e2e.length > 5 ? bootstrapMedian(e2e) : null,
      cold_p50: quantile(ans.filter(r => r.rep === 0).map(r => r.e2e_ms), 0.5) || null,
      warm_p50: reps.length > 1 ? quantile(ans.filter(r => r.rep > 0).map(r => r.e2e_ms), 0.5) : null,
    },
    messages_per_s: msgs && ingestSecs ? msgs / ingestSecs : null,
    cpu_seconds: cm ? (cpuIngest ?? 0) + (cpuQuery ?? 0) : 0,
    cpu_seconds_per_1k_messages: cm && msgs ? (cpuIngest ?? 0) / (msgs / 1000) : null,
    cpu_seconds_per_query: cm && queries ? (cpuQuery ?? 0) / queries : null,
    mem_peak_bytes: cm?.mem_peak_bytes ?? 0,
    mem_steady_bytes: cm?.mem_steady_bytes ?? null,
    disk_bytes_per_m_tokens: storeBytes[arm] ? Math.round(storeBytes[arm] / (ingestedTokens / 1e6)) : null,
    outside_load_cores: cm?.outside_cores ?? null,
    repeat_spread_pp: spread,
    answer_context_tokens_p50: lat('context_tokens_approx').length ? quantile(lat('context_tokens_approx'), 0.5) : null,
  });
}

const PAIRS = [['A', 'B'], ['A', 'E'], ['B', 'C'], ['B', 'D'], ['B', 'F'], ['A', 'F'], ['B', 'E'], ['F', 'G']];
const comparisons = PAIRS.map(([x, y]) => {
  const common = qs.filter(q => correct[x].has(q.question_id) && correct[y].has(q.question_id));
  if (!common.length) return { pair: `${x}-${y}`, n: 0, diff_pp: null, ci95: null, mcnemar_p: null };
  const a = common.map(q => correct[x].get(q.question_id)!);
  const b = common.map(q => correct[y].get(q.question_id)!);
  const d = a.map((v, i) => (v ? 1 : 0) - (b[i] ? 1 : 0));
  const [lo, hi] = bootstrapMean(d, 7);
  return { pair: `${x}-${y}`, n: common.length, diff_pp: mean(d) * 100, ci95: [lo * 100, hi * 100], mcnemar_p: mcnemar(a, b) };
});

// reproduction: arm A against the published 90.4%, and the published per-question results on the same subset
const A = armRows.find(r => r.arm === 'A');
let publishedOnSubset: number | null = null;
if (existsSync(values.published!)) {
  const pub = JSON.parse(readFileSync(values.published!, 'utf8')).detailed_results as any[];
  const m = new Map(pub.map(r => [r.question_id, r.passed]));
  const hit = qs.filter(q => m.has(q.question_id));
  publishedOnSubset = hit.length ? mean(hit.map(q => (m.get(q.question_id) ? 1 : 0))) : null;
}

// judge reliability: a seeded 10% of every arm's rep-0 judgments, re-judged by the second judge
const kpath = `${OUT}/judge2.jsonl`;
const pool2 = ARMS.flatMap(arm => readJsonl(`${dirOf(arm)}/judgments.jsonl`).filter(j => j.rep === 0).map(j => ({ ...j, arm })));
const r = rng(52);
const picked = pool2.filter(() => r() < Number(values['kappa-sample']));
const done2 = new Map(readJsonl(kpath).map(j => [`${j.arm}#${j.question_id}`, j]));
const ansMap = new Map(ARMS.flatMap(arm => answersOf(arm).filter(a => a.rep === 0).map(a => [`${arm}#${a.question_id}`, a.response])));
await pool(picked.filter(j => !done2.has(`${j.arm}#${j.question_id}`)), 6, async j => {
  const q = byId.get(j.question_id)!;
  const second = await judge(q, ansMap.get(`${j.arm}#${j.question_id}`) ?? '', SECOND_JUDGE_MODEL);
  const row = { arm: j.arm, question_id: j.question_id, first: j.label, second: second.label, raw: second.raw };
  appendJsonl(kpath, row);
  done2.set(`${j.arm}#${j.question_id}`, row);
});
const kRows = picked.map(j => done2.get(`${j.arm}#${j.question_id}`)).filter(Boolean) as any[];
const judgeKappa = kRows.length ? cohenKappa(kRows.map(k => k.first), kRows.map(k => k.second)) : null;

const judgeUsage = { gpt4o: usageFor('J.judge', null), second: usageFor('J.judge2', null) };

const summary = {
  pins,
  subset: { seed: 52, per_type: 20, question_ids: ids },
  reproduction: A?.accuracy == null ? null : {
    accuracy: A.accuracy, ci95: A.ci95, published: 0.904,
    ci_contains_published: A.ci95[0] <= 0.904 && 0.904 <= A.ci95[1],
    published_on_same_subset: publishedOnSubset,
  },
  arms: armRows,
  comparisons,
  judge_kappa: judgeKappa,
  judge_kappa_n: kRows.length,
  judge_tokens: { gpt4o_in: judgeUsage.gpt4o.input, gpt4o_out: judgeUsage.gpt4o.output, second_in: judgeUsage.second.input, second_usd: judgeUsage.second.usd },
  ingested_tokens_approx: ingestedTokens,
  budget_phase45: null as any,
};
writeJson(values.summary ?? `${OUT}/pilot-summary.json`, summary);
console.log(JSON.stringify({ arms: armRows.map(a => ({ arm: a.arm, n: a.n, acc: a.accuracy, ci: a.ci95, r5: a.recall_at['5'], usd: a.usd })), reproduction: summary.reproduction, kappa: judgeKappa }, null, 1));
