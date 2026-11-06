// Honcho adapter (arms A and E) over its v3 HTTP API (claude-mem-rs#52).
//
// Per question: one workspace (named for the question), two peers, one
// Honcho session per benchmark session, each session's turns added in order
// with their original timestamps. The peer the question is about observes
// itself; the other peer observes nothing (single-session-assistant questions
// are about the assistant, the rest about the user). This is the call
// sequence of Honcho's own LongMemEval runner (tests/bench/longmem.py in the
// fork), not its code.
import { isAbstention, lmeDate, observedPeer, sleep, type Question } from './common.ts';

export const HONCHO = process.env.BENCH_HONCHO ?? 'http://127.0.0.1:8010';

async function call(method: string, path: string, body?: unknown): Promise<any> {
  let wait = 1000;
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(`${HONCHO}/v3${path}`, {
      method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    if (r.ok) return text ? JSON.parse(text) : null;
    if (attempt >= 5 || (r.status < 500 && r.status !== 429)) throw new Error(`honcho ${method} ${path} ${r.status}: ${text.slice(0, 300)}`);
    await sleep(wait);
    wait *= 2;
  }
}

export const workspaceOf = (q: Question, prefix = '') => `${prefix}${q.question_id}`;

export interface IngestTiming { acks_ms: number[]; messages: number }

/** Honcho caps a message at 25,000 characters; its runner splits longer turns the same way. */
function chunks(s: string, n = 25000): string[] {
  if (s.length <= n) return [s];
  const out = [];
  for (let i = 0; i < s.length; i += n) out.push(s.slice(i, i + n));
  return out;
}

export async function ingest(q: Question, ws: string): Promise<IngestTiming> {
  const timing: IngestTiming = { acks_ms: [], messages: 0 };
  const observed = observedPeer(q);
  await call('POST', '/workspaces', { id: ws });
  for (const p of ['user', 'assistant']) await call('POST', `/workspaces/${ws}/peers`, { id: p });
  for (let i = 0; i < q.haystack_sessions.length; i++) {
    const sid = q.haystack_session_ids[i];
    const at = new Date(lmeDate(q.haystack_dates[i])).toISOString();
    await call('POST', `/workspaces/${ws}/sessions`, {
      id: sid,
      peers: {
        user: { observe_me: observed === 'user', observe_others: false },
        assistant: { observe_me: observed === 'assistant', observe_others: false },
      },
    });
    const msgs = q.haystack_sessions[i].flatMap(t => chunks(t.content).map(c => ({ peer_id: t.role === 'user' ? 'user' : 'assistant', content: c, created_at: at })));
    for (let j = 0; j < msgs.length; j += 100) {
      const t0 = performance.now();
      await call('POST', `/workspaces/${ws}/sessions/${sid}/messages`, { messages: msgs.slice(j, j + 100) });
      timing.acks_ms.push(performance.now() - t0);
    }
    timing.messages += msgs.length;
  }
  return timing;
}

/** Wait until the workspace's deriver queue is empty; the drain time in ms. */
export async function drain(ws: string, timeoutMs = 4 * 3600_000): Promise<number> {
  const t0 = performance.now();
  let quiet = 0;
  while (performance.now() - t0 < timeoutMs) {
    const s = await call('GET', `/workspaces/${ws}/queue/status`);
    if ((s.pending_work_units ?? 0) + (s.in_progress_work_units ?? 0) === 0) {
      if (++quiet >= 2) return performance.now() - t0;
    } else quiet = 0;
    await sleep(1000);
  }
  throw new Error(`queue for ${ws} did not drain`);
}

const questionWithDate = (q: Question) => `[${q.question_date}] ${q.question}`;

/** Arm A: Honcho's dialectic (chat) endpoint answers, as its runner asks: the question prefixed with its date. */
export async function chat(q: Question, ws: string): Promise<{ text: string; ms: number }> {
  const t0 = performance.now();
  const r = await call('POST', `/workspaces/${ws}/peers/${observedPeer(q)}/chat`, { query: questionWithDate(q) });
  return { text: typeof r?.content === 'string' ? r.content : '', ms: performance.now() - t0 };
}

/** Arm E: Honcho's prompt-ready representation of the observed peer, curated by the question. */
export async function representation(q: Question, ws: string): Promise<{ text: string; ms: number }> {
  const t0 = performance.now();
  const r = await call('POST', `/workspaces/${ws}/peers/${observedPeer(q)}/representation`, {
    search_query: q.question, search_top_k: 25, max_conclusions: 50, include_most_frequent: true,
  });
  return { text: r.representation ?? '', ms: performance.now() - t0 };
}

/** Honcho's message search over the workspace: the ranked benchmark session ids, for recall@k. */
export async function searchSessions(q: Question, ws: string, limit = 50): Promise<{ sessions: string[]; ms: number }> {
  const t0 = performance.now();
  const rows: any[] = await call('POST', `/workspaces/${ws}/search`, { query: q.question, limit });
  return { sessions: rows.map(r => r.session_id ?? r.session_name), ms: performance.now() - t0 };
}

export async function deleteWorkspace(ws: string) {
  await call('DELETE', `/workspaces/${ws}`).catch(() => undefined);
}

export { isAbstention };
