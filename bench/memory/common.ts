// Shared pieces of the memory benchmark harness (trove#52): the
// dataset, the pilot subset, the model call through the usage proxy, timing,
// and JSONL files.
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
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

/** Where claudeP logs its calls: the proxy's usage log for the run. */
export const USAGE_LOG = process.env.BENCH_USAGE ?? 'results/memory-bench/pilot/usage.jsonl';
/** The subscription's seven-day use at which claudeP stops starting calls (order on #52: the 80% weekly reserve). */
const WEEK_STOP_PCT = 80;
let weekCheckedAt = 0;

function weekUsedPct(): number {
  const out = execFileSync(`${homedir()}/opt/trove/bin/trove`, ['queue', 'status'], { encoding: 'utf8' });
  return Number(JSON.parse(out).week_used_pct);
}

/**
 * One Claude call on Rich's subscription, through `claude -p` (Rich, 2026-11-06:
 * no OpenRouter, the API key has no credit): no tools, hooks, MCP servers,
 * settings or saved session, Claude Code's system prompt replaced by `system`.
 * `thinking` sets MAX_THINKING_TOKENS. Logged to USAGE_LOG with tag, tokens and
 * the CLI's notional list cost; cost_usd stays null, since nothing is billed.
 */
export async function claudeP(tag: string, model: string, system: string, prompt: string, thinking = 0): Promise<Call> {
  if (Date.now() - weekCheckedAt > 5 * 60_000) {
    const pct = weekUsedPct();
    if (pct >= WEEK_STOP_PCT) throw Object.assign(new Error(`subscription week ${pct}% used, at or over ${WEEK_STOP_PCT}%`), { fatal: true });
    weekCheckedAt = Date.now();
  }
  let wait = 5000;
  for (let attempt = 0; ; attempt++) {
    const t0 = performance.now();
    try {
      const env = { ...process.env, MAX_THINKING_TOKENS: String(thinking) };
      delete env.ANTHROPIC_API_KEY;
      const out = await new Promise<string>((resolve, reject) => {
        const p = spawn('claude', [
          '-p', '--model', model, '--output-format', 'json', '--tools', '', '--strict-mcp-config',
          '--no-session-persistence', '--settings', '{"disableAllHooks":true}', '--setting-sources', '', '--system-prompt', system,
        ], { cwd: tmpdir(), env });
        let o = '', e = '';
        p.stdout.on('data', d => (o += d));
        p.stderr.on('data', d => (e += d));
        p.on('error', reject);
        p.on('close', code => (o.trim() ? resolve(o) : reject(new Error(`claude -p exit ${code}: ${e.slice(0, 300)}`))));
        p.stdin.end(prompt);
      });
      const v = JSON.parse(out);
      if (v.is_error) throw new Error(`claude -p error: ${String(v.result).slice(0, 300)}`);
      const u = v.usage ?? {};
      const cached = (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
      const call: Call = {
        text: String(v.result ?? '').trim(), input_tokens: (u.input_tokens ?? 0) + cached, output_tokens: u.output_tokens ?? 0,
        ms: performance.now() - t0, stop_reason: v.stop_reason ?? null,
      };
      appendJsonl(USAGE_LOG, {
        ts: new Date().toISOString(), tag, ctx: '', route: 'claude-p', model: Object.keys(v.modelUsage ?? {})[0] ?? model, status: 200,
        input_tokens: call.input_tokens, output_tokens: call.output_tokens, cached_tokens: cached,
        reasoning_tokens: u.output_tokens_details?.thinking_tokens ?? 0, cost_usd: null, notional_usd: v.total_cost_usd ?? null, ms: Math.round(call.ms),
      });
      return call;
    } catch (e: any) {
      if (e.fatal || attempt >= 4) throw e;
      await new Promise(res => setTimeout(res, wait));
      wait *= 3;
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
