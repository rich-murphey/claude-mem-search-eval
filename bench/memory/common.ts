// Shared pieces of the memory benchmark harness (claude-mem-rs#52): the
// dataset, the pilot subset, the model call through the usage proxy, timing,
// and JSONL files.
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadLongMemEvalS, type LmeQuestion } from '../../src/longmemeval.ts';

export const PROXY = process.env.BENCH_PROXY ?? 'http://127.0.0.1:37902';

export interface Question extends LmeQuestion {
  question_date: string;
  haystack_dates: string[];
}

export async function loadS(): Promise<Question[]> {
  return (await loadLongMemEvalS('cache')) as Question[];
}

export const TYPES = [
  'single-session-user', 'single-session-assistant', 'single-session-preference',
  'multi-session', 'temporal-reasoning', 'knowledge-update',
] as const;

/** mulberry32: a small seeded PRNG, so the subset is reproducible from the seed alone. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `perType` questions of each type, drawn with a seeded Fisher-Yates shuffle of each type's ids in file order. */
export function drawSubset(questions: Question[], perType: number, seed: number): string[] {
  const rand = rng(seed);
  const out: string[] = [];
  for (const t of TYPES) {
    const ids = questions.filter(q => q.question_type === t).map(q => q.question_id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    out.push(...ids.slice(0, perType));
  }
  return out;
}

export function readManifest(path: string): string[] {
  return readFileSync(path, 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
}

/** LongMemEval date "2023/05/30 (Tue) 23:40" as epoch ms, read as UTC. */
export function lmeDate(s: string): number {
  const m = /^(\d{4})\/(\d{2})\/(\d{2}) \(\w+\) (\d{2}):(\d{2})$/.exec(s.trim());
  if (!m) throw new Error(`bad LongMemEval date ${s}`);
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
}

export const isAbstention = (q: Question) => q.question_id.endsWith('_abs');
/** Whose memory a question asks about: the assistant's for single-session-assistant, else the user's. */
export const observedPeer = (q: Question) => (q.question_type === 'single-session-assistant' ? 'assistant' : 'user');

export function setProxyCtx(ctx: string) {
  return fetch(`${PROXY}/_ctx`, { method: 'POST', body: JSON.stringify({ ctx }) });
}

export interface Call { text: string; input_tokens: number; output_tokens: number; ms: number; stop_reason: string | null }

/** One Anthropic Messages call through the proxy, retried on 429/5xx/transport errors. */
export async function messages(tag: string, body: Record<string, unknown>): Promise<Call> {
  let wait = 2000;
  for (let attempt = 0; ; attempt++) {
    const t0 = performance.now();
    try {
      const r = await fetch(`${PROXY}/${tag}/v1/messages`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'anthropic-version': '2023-06-01' }, body: JSON.stringify(body),
      });
      const text = await r.text();
      if (r.status === 429 || r.status >= 500) throw new Error(`status ${r.status}: ${text.slice(0, 200)}`);
      if (!r.ok) throw Object.assign(new Error(`status ${r.status}: ${text.slice(0, 400)}`), { fatal: true });
      const v = JSON.parse(text);
      return {
        text: (v.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n').trim(),
        input_tokens: (v.usage?.input_tokens ?? 0) + (v.usage?.cache_read_input_tokens ?? 0) + (v.usage?.cache_creation_input_tokens ?? 0),
        output_tokens: v.usage?.output_tokens ?? 0,
        ms: performance.now() - t0,
        stop_reason: v.stop_reason ?? null,
      };
    } catch (e: any) {
      if (e.fatal || attempt >= 6) throw e;
      await new Promise(res => setTimeout(res, wait));
      wait *= 2;
    }
  }
}

export function appendJsonl(path: string, row: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify(row) + '\n');
}

export function readJsonl<T = any>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
}

export function writeJson(path: string, v: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(v, null, 2) + '\n');
}

/** Run `fn` over `items` with at most `n` in flight. */
export async function pool<T, R>(items: T[], n: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }));
  return out;
}

export const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));
export const sha = (s: string) => createHash('sha256').update(s).digest('hex');

/** Rough token count (chars/4) for sizing only; costs come from provider usage fields. */
export const approxTokens = (s: string) => Math.ceil(s.length / 4);

/** A question's history as text, one block per session with its date: the full-context (F) and oracle (G) arms. */
export function renderHistory(q: Question, onlyEvidence = false): string {
  const keep = new Set(q.answer_session_ids);
  const blocks: string[] = [];
  q.haystack_sessions.forEach((turns, i) => {
    if (onlyEvidence && !keep.has(q.haystack_session_ids[i])) return;
    const lines = turns.map(t => `${t.role}: ${t.content}`);
    blocks.push(`### Session ${blocks.length + 1} (${q.haystack_dates[i]})\n${lines.join('\n')}`);
  });
  return blocks.join('\n\n');
}
