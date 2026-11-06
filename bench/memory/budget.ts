// Phase 4–5 budget, extrapolated from the pilot's measured costs and rates
// (claude-mem-rs#52, docs/memory-benchmark.md § Phases).
//
//   node bench/memory/budget.ts --summary <pilot-summary.json> --out results/memory-bench/pilot
//
// Per-token ingestion cost and per-question answer and judge cost come from
// the pilot's usage log; history sizes for M (1,000,381 tokens a question)
// and S (101,571) from Plastic Labs' published runs (honcho-benchmarks
// a1d689b), BEAM-1M from the BEAM run in the pilot. Writes budget_phase45
// into the summary and budget.json beside it.
import { existsSync, readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { readJsonl, writeJson } from './common.ts';

const { values } = parseArgs({ options: { summary: { type: 'string' }, out: { type: 'string', default: 'results/memory-bench/pilot' } } });
const summary = JSON.parse(readFileSync(values.summary!, 'utf8'));
const OUT = values.out!;
const usage = readJsonl(`${OUT}/usage.jsonl`).filter(u => u.status === 200);
const sum = (rows: any[], f: string) => rows.reduce((a, u) => a + (u[f] ?? 0), 0);
const byTag = (p: string) => usage.filter(u => u.tag.startsWith(p));

const S_TOKENS = 101_571, M_TOKENS = 1_000_381;
const N_PILOT = summary.subset.question_ids.length;
const pilotTokens = summary.ingested_tokens_approx as number; // chars/4 over the subset
const perTok = (usd: number) => usd / pilotTokens; // USD per ingested token (approx tokens)
const ingestUsd: Record<string, number> = {
  A: sum(byTag('A.deriver'), 'cost_usd') + sum(byTag('A.embedding').filter(u => true), 'input_tokens') * 0.02 / 1e6,
  B: sum(byTag('B.observer'), 'cost_usd'),
  C: sum(byTag('C.observer'), 'cost_usd'),
};
const ingestTok: Record<string, number> = {
  A: sum(byTag('A.deriver'), 'input_tokens') + sum(byTag('A.deriver'), 'output_tokens'),
  B: sum(byTag('B.observer'), 'input_tokens') + sum(byTag('B.observer'), 'output_tokens'),
  C: sum(byTag('C.observer'), 'input_tokens') + sum(byTag('C.observer'), 'output_tokens'),
};
// answers: per answer, from the pilot (A: the dialectic; F scales with history)
const answers = (arm: string) => readJsonl(`${OUT}/arm-${arm}/answers.jsonl`).length || 1;
const ansTag = (arm: string) => (arm === 'A' ? 'A.dialectic' : `${arm}.answer`);
const perAnswerUsd = (arm: string) => sum(byTag(ansTag(arm)), 'cost_usd') / answers(arm);
const perAnswerTok = (arm: string) => (sum(byTag(ansTag(arm)), 'input_tokens') + sum(byTag(ansTag(arm)), 'output_tokens')) / answers(arm);
const judgeTok = (sum(byTag('J.judge'), 'input_tokens') + sum(byTag('J.judge'), 'output_tokens')) / Math.max(1, byTag('J.judge').length);
const judgeUsd = (sum(byTag('J.judge'), 'input_tokens') * 2.5 + sum(byTag('J.judge'), 'output_tokens') * 10) / 1e6 / Math.max(1, byTag('J.judge').length);

// wall time: pilot ingestion hours per ingested token (concurrency 8), and seconds per answer
const hours = (arm: string, stage: string) => readJsonl(`${OUT}/arm-${arm}/windows.jsonl`).filter(w => w.stage === stage)
  .reduce((a, w) => a + (Date.parse(w.end) - Date.parse(w.start)) / 3.6e6, 0);
const ingestHoursPerTok = (arm: string) => hours(arm, 'ingest') / pilotTokens;
const secPerAnswer = (arm: string) => (hours(arm, 'query') * 3600) / answers(arm);

const beam = (arm: string) => {
  const p = `${OUT}/beam/arm-${arm}/ingest.jsonl`;
  return existsSync(p) ? readJsonl(p)[0] : null;
};
const BEAM_CONV = 35, BEAM_Q = 20, BEAM_TOK = 1_061_523; // chars/4 of conversation 1, as the pilot ingested it

interface Line { item: string; tokens: number; usd: number; wall_hours: number; note?: string }
const lines: Line[] = [];
const add = (l: Line) => lines.push({ ...l, tokens: Math.round(l.tokens), usd: Math.round(l.usd * 100) / 100, wall_hours: Math.round(l.wall_hours * 10) / 10 });
const scaleS = 500 / N_PILOT;
const tokRatio = (n: number) => n / (pilotTokens / N_PILOT); // ingested tokens of one item over a pilot question's

for (const arm of ['A', 'B', 'C']) {
  add({ item: `S ingest ${arm} (500)`, tokens: ingestTok[arm] * scaleS, usd: ingestUsd[arm] * scaleS, wall_hours: hours(arm, 'ingest') * scaleS });
  add({ item: `M ingest ${arm} (98)`, tokens: ingestTok[arm] / N_PILOT * 98 * (M_TOKENS / S_TOKENS), usd: ingestUsd[arm] / N_PILOT * 98 * (M_TOKENS / S_TOKENS), wall_hours: hours(arm, 'ingest') / N_PILOT * 98 * (M_TOKENS / S_TOKENS) });
  const b = arm === 'C' ? null : beam(arm);
  const beamUsd = b ? b.usd ?? null : null;
  add({
    item: `BEAM-1M ingest ${arm} (35)`,
    tokens: ingestTok[arm] / N_PILOT * tokRatio(BEAM_TOK) * BEAM_CONV,
    usd: (beamUsd ?? ingestUsd[arm] / N_PILOT * tokRatio(BEAM_TOK)) * BEAM_CONV,
    wall_hours: (b ? (b.ingest_ms + b.drain_ms) / 3.6e6 : hours(arm, 'ingest') / N_PILOT * tokRatio(BEAM_TOK)) * BEAM_CONV,
    note: b ? 'per-conversation cost and time measured on BEAM-1M conversation 1' : 'scaled from LongMemEval S per token',
  });
}
for (const arm of ['A', 'B', 'C', 'D', 'E', 'F', 'G']) {
  const nS = 500, nM = arm === 'F' ? 0 : 98, nBeam = ['F', 'G'].includes(arm) ? 0 : BEAM_CONV * BEAM_Q;
  const n = nS + nM + nBeam;
  // F's answer cost scales with history; it runs on S only (M and BEAM-1M exceed the answer model's 200k context)
  add({ item: `answers ${arm} (S 500${nM ? ', M 98' : ''}${nBeam ? ', BEAM-1M 700' : ''})`, tokens: perAnswerTok(arm) * n, usd: perAnswerUsd(arm) * n, wall_hours: secPerAnswer(arm) * n / 3600 });
}
const totalAnswers = 7 * 500 + 6 * 98 + 5 * 700;
add({ item: `judging (GPT-4o, ${totalAnswers} answers, + 10% second judge)`, tokens: judgeTok * totalAnswers * 1.1, usd: judgeUsd * totalAnswers * 1.1, wall_hours: totalAnswers / 8 * 1.5 / 3600 });
// Phase 5 ablations
add({ item: 'Phase 5: A with dreaming on, S 500 (re-ingest; dream cost assumed equal to A ingest)', tokens: ingestTok.A * scaleS * 2, usd: ingestUsd.A * scaleS * 2 + perAnswerUsd('A') * 500, wall_hours: hours('A', 'ingest') * scaleS * 2 + secPerAnswer('A') * 500 / 3600, note: 'dream cost not measured in the pilot' });
add({ item: 'Phase 5: B ColBERT off, S 500 (answers only)', tokens: perAnswerTok('B') * 500, usd: perAnswerUsd('B') * 500, wall_hours: secPerAnswer('B') * 500 / 3600 });
add({ item: 'Phase 5: B RRF k in {1,5,10,20}, S 500 (answers only; k=60 is the main run)', tokens: perAnswerTok('B') * 2000, usd: perAnswerUsd('B') * 2000, wall_hours: secPerAnswer('B') * 2000 / 3600 });

const total = { tokens: lines.reduce((a, l) => a + l.tokens, 0), usd: Math.round(lines.reduce((a, l) => a + l.usd, 0) * 100) / 100, wall_hours: Math.round(lines.reduce((a, l) => a + l.wall_hours, 0) * 10) / 10 };
summary.budget_phase45 = { ...total, lines, basis: 'pilot usage log (OpenRouter per-call cost; OpenAI list prices for judge and embeddings, 2026-11-06); history sizes S 101,571 and M 1,000,381 tokens from Plastic Labs\' published runs; wall hours are sequential sums, before running arms in parallel' };
writeJson(values.summary!, summary);
writeJson(`${OUT}/budget.json`, summary.budget_phase45);
console.table(lines);
console.log(total);
