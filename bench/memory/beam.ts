// One BEAM conversation ingested into arm A or B, to measure how ingestion
// cost, drain time, CPU, RAM and disk scale to 1M tokens (claude-mem-rs#52,
// Phase 3). Accuracy on BEAM needs its nugget judge and is left to the full
// runs.
//
//   node bench/memory/beam.ts --arm A|B --scale 1M --conv 1 --out results/memory-bench/pilot/beam
//
// Data: mohammadtavakoli78/BEAM, cloned to ~/.cache/memory-bench/BEAM. Each
// of the conversation's batches becomes one session, dated by its
// time_anchor; turns are taken in order, as Honcho's BEAM runner reads them.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { parseArgs } from 'node:util';
import * as cmr from './cmr.ts';
import * as honcho from './honcho.ts';
import { appendJsonl, approxTokens, type Question } from './common.ts';
import { dockerScope, Sampler, userService } from './sample.ts';

const { values } = parseArgs({
  options: {
    arm: { type: 'string' }, scale: { type: 'string', default: '1M' }, conv: { type: 'string', default: '1' },
    out: { type: 'string', default: 'results/memory-bench/pilot/beam' },
  },
});
const arm = values.arm!;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "March-01-2024" as a LongMemEval date string, "2024/03/01 (Fri) 00:00". */
function lmeStyle(anchor: string): string {
  const [mon, day, year] = anchor.split('-');
  const d = new Date(Date.UTC(+year, MONTHS.indexOf(mon), +day));
  return `${year}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${day.padStart(2, '0')} (${DAYS[d.getUTCDay()]}) 00:00`;
}

const chat = JSON.parse(readFileSync(`${homedir()}/.cache/memory-bench/BEAM/chats/${values.scale}/${values.conv}/chat.json`, 'utf8')) as any[];
const id = `beam${values.scale!.toLowerCase()}-${values.conv}`;
let anchor = 'January-01-2024';
const q: Question = {
  question_id: id, question_type: 'beam', question: '', question_date: '', answer: '', answer_session_ids: [],
  haystack_session_ids: [], haystack_dates: [], haystack_sessions: [],
};
chat.forEach((batch, b) => {
  const turns = (batch.turns as any[][]).flat();
  anchor = turns.find(t => t.time_anchor)?.time_anchor ?? anchor;
  q.haystack_session_ids.push(`${id}-b${b + 1}`);
  q.haystack_dates.push(lmeStyle(anchor));
  q.haystack_sessions.push(turns.map(t => ({ role: t.role, content: t.content })));
});
const tokens = q.haystack_sessions.flat().reduce((a, t) => a + approxTokens(t.content), 0);

const dir = `${values.out}/arm-${arm}`;
const groups: Record<string, string> = arm === 'A'
  ? { honcho: userService('bench-honcho'), honcho_pg: dockerScope('bench-honcho-pg') }
  : { [`cmr_${arm}`]: userService(`bench-cmr-${arm}`) };
const sampler = new Sampler(`${dir}/samples.csv`, groups).start();
sampler.setPhase('ingest');
const start = new Date().toISOString();
const t0 = performance.now();
if (arm !== 'A') cmr.provision(arm, [id]);
const timing = arm === 'A' ? await honcho.ingest(q, id) : await cmr.ingest(arm, q);
const ingest_ms = performance.now() - t0;
const drain_ms = arm === 'A' ? await honcho.drain(id, 12 * 3600_000) : await cmr.drain(arm, id, 12 * 3600_000);
sampler.stop();
appendJsonl(`${dir}/windows.jsonl`, { arm, stage: 'ingest', start, end: new Date().toISOString() });
appendJsonl(`${dir}/ingest.jsonl`, {
  question_id: id, sessions: q.haystack_sessions.length, messages: timing.messages, tokens_approx: tokens,
  acks_ms: timing.acks_ms.map(Math.round), ingest_ms: Math.round(ingest_ms), drain_ms: Math.round(drain_ms),
  ...(arm === 'A' ? {} : { jobs: cmr.jobStats(arm, id), store_bytes: cmr.storeBytes(arm) }),
});
console.log(`[${arm}] ${id}: ${timing.messages} msgs, ~${tokens} tokens, ingest ${(ingest_ms / 1000).toFixed(0)}s, drain ${(drain_ms / 1000).toFixed(0)}s`);
