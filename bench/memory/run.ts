// Memory benchmark runner (trove#52, docs/memory-benchmark.md).
//
//   node bench/memory/run.ts --arm A|B|C|D|E|F|G --manifest manifests/memory-bench-pilot-120.txt
//        --out results/memory-bench/pilot [--stage ingest|query|judge|all] [--repeats 3]
//        [--concurrency 8] [--limit N] [--prefix ws-prefix]
//
// Writes under <out>/arm-<X>/: ingest.jsonl (per question: messages, ack
// latencies, ingest and drain ms), answers.jsonl (per question and repeat:
// response, retrieval and answer latency, context tokens, retrieved
// sessions), judgments.jsonl, samples.csv (the cgroup sampler) and
// windows.jsonl (each stage's start and end, to attribute the proxy's usage
// log). Every stage resumes: a question already in its file is skipped.
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import * as cmr from './cmr.ts';
import * as honcho from './honcho.ts';
import { appendJsonl, approxTokens, loadS, pool, readJsonl, readManifest, renderHistory, type Question } from './common.ts';
import { answer, judge } from './judge.ts';
import { dockerScope, Sampler, userService } from './sample.ts';

const { values } = parseArgs({
  options: {
    arm: { type: 'string' },
    manifest: { type: 'string', default: 'manifests/memory-bench-pilot-120.txt' },
    out: { type: 'string', default: 'results/memory-bench/pilot' },
    stage: { type: 'string', default: 'all' },
    repeats: { type: 'string', default: '1' },
    concurrency: { type: 'string', default: '8' },
    limit: { type: 'string' },
    prefix: { type: 'string', default: '' },
  },
});
const arm = values.arm!;
if (!'ABCDEFG'.includes(arm) || arm.length !== 1) throw new Error('--arm A..G');
const dir = `${values.out}/arm-${arm}`;
const repeats = Number(values.repeats);
const conc = Number(values.concurrency);

const all = await loadS();
const byId = new Map(all.map(q => [q.question_id, q]));
let ids = readManifest(values.manifest!);
if (values.limit) ids = ids.slice(0, Number(values.limit));
const questions = ids.map(id => byId.get(id)!);

const groups: Record<string, string> = {};
if (arm === 'A' || arm === 'E') {
  groups.honcho = userService('bench-honcho');
  groups.honcho_pg = dockerScope('bench-honcho-pg');
} else if ('BCD'.includes(arm)) groups[`cmr_${arm}`] = userService(`bench-cmr-${arm}`);
const sampler = new Sampler(`${dir}/samples.csv`, groups).start();

function window<T>(stage: string, f: () => Promise<T>): Promise<T> {
  const start = new Date().toISOString();
  sampler.setPhase(stage);
  return f().finally(() => {
    appendJsonl(`${dir}/windows.jsonl`, { arm, stage, start, end: new Date().toISOString() });
    sampler.setPhase('idle');
  });
}

const ws = (q: Question) => honcho.workspaceOf(q, values.prefix);

async function ingestStage() {
  if (!['A', 'B', 'C', 'D'].includes(arm)) return;
  const done = new Set(readJsonl(`${dir}/ingest.jsonl`).map(r => r.question_id));
  const todo = questions.filter(q => !done.has(q.question_id));
  if (!todo.length) return;
  if (arm !== 'A') cmr.provision(arm, todo.map(q => q.question_id));
  await window('ingest', () => pool(todo, conc, async q => {
    const t0 = performance.now();
    const timing = arm === 'A' ? await honcho.ingest(q, ws(q)) : await cmr.ingest(arm, q);
    const ingest_ms = performance.now() - t0;
    const drain_ms = arm === 'A' ? await honcho.drain(ws(q)) : await cmr.drain(arm, q.question_id);
    const row = {
      question_id: q.question_id, messages: timing.messages, acks_ms: timing.acks_ms.map(Math.round), ingest_ms: Math.round(ingest_ms),
      drain_ms: Math.round(drain_ms), done_at: new Date().toISOString(),
      ...(arm === 'A' ? {} : { jobs: cmr.jobStats(arm, q.question_id) }),
    };
    appendJsonl(`${dir}/ingest.jsonl`, row);
    console.log(`[${arm}] ingested ${q.question_id} (${timing.messages} msgs, ingest ${(ingest_ms / 1000).toFixed(0)}s, drain ${(drain_ms / 1000).toFixed(0)}s)`);
  }));
}

/** Context for the shared answer harness, and the ranked sessions behind it. */
async function retrieve(q: Question): Promise<{ context: string; sessions: (string | null)[]; ms: number | null; search_ms?: number }> {
  switch (arm) {
    case 'B': case 'C': case 'D': {
      const r = await cmr.retrieve(arm, q, cmr.sessionMap(arm, q.question_id));
      return { context: r.context, sessions: r.sessions, ms: r.ms };
    }
    case 'E': {
      const r = await honcho.representation(q, ws(q));
      const s = await honcho.searchSessions(q, ws(q));
      return { context: r.text, sessions: s.sessions, ms: r.ms, search_ms: s.ms };
    }
    case 'F': return { context: renderHistory(q), sessions: [], ms: null };
    case 'G': return { context: renderHistory(q, true), sessions: [], ms: null };
  }
  throw new Error(`no retrieval for ${arm}`);
}

async function queryStage() {
  const done = new Set(readJsonl(`${dir}/answers.jsonl`).map(r => `${r.question_id}#${r.rep}`));
  await window('query', async () => {
    // One question at a time, so latency is not shared.
    for (let rep = 0; rep < repeats; rep++) {
      for (const q of questions) {
        if (done.has(`${q.question_id}#${rep}`)) continue;
        const t0 = performance.now();
        let row: Record<string, unknown>;
        if (arm === 'A') {
          const c = await honcho.chat(q, ws(q));
          const s = rep === 0 ? await honcho.searchSessions(q, ws(q)) : null;
          row = { response: c.text, answer_ms: Math.round(c.ms), e2e_ms: Math.round(c.ms), retrieval_ms: null, search_ms: s ? Math.round(s.ms) : null, sessions: s?.sessions ?? null };
        } else {
          const r = await retrieve(q);
          const a = await answer(`${arm}.answer`, q, r.context);
          row = {
            response: a.text, answer_ms: Math.round(a.ms), retrieval_ms: r.ms === null ? null : Math.round(r.ms),
            search_ms: r.search_ms ? Math.round(r.search_ms) : null, e2e_ms: Math.round(performance.now() - t0),
            context_tokens_approx: approxTokens(r.context), answer_input_tokens: a.input_tokens, answer_output_tokens: a.output_tokens,
            sessions: r.sessions.length ? r.sessions : null, stop_reason: a.stop_reason,
          };
        }
        appendJsonl(`${dir}/answers.jsonl`, { question_id: q.question_id, question_type: q.question_type, rep, ...row, at: new Date().toISOString() });
        console.log(`[${arm}] answered ${q.question_id} rep ${rep} in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
      }
    }
  });
}

async function judgeStage() {
  const done = new Set(readJsonl(`${dir}/judgments.jsonl`).map(r => `${r.question_id}#${r.rep}`));
  const todo = readJsonl(`${dir}/answers.jsonl`).filter(r => !done.has(`${r.question_id}#${r.rep}`) && byId.has(r.question_id));
  await window('judge', () => pool(todo, conc, async r => {
    const j = await judge(byId.get(r.question_id)!, r.response);
    appendJsonl(`${dir}/judgments.jsonl`, { question_id: r.question_id, rep: r.rep, label: j.label, raw: j.raw, model: j.model });
  }));
}

try {
  const st = values.stage!;
  if (st === 'ingest' || st === 'all') await ingestStage();
  if (st === 'query' || st === 'all') await queryStage();
  if (st === 'judge' || st === 'all') await judgeStage();
} finally {
  sampler.stop();
}
if (!existsSync(`${dir}/answers.jsonl`) && values.stage === 'all') console.warn('no answers written');
