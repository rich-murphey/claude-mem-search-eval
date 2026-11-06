// claude-mem-rs adapter (arms B, C, D) over its HTTP API (claude-mem-rs#52).
//
// B and C ingest a chat the way the live plugin does (measured on the live
// store 2026-11-06: user_prompt events carry no generation job, every
// assistant_message event does): per benchmark session, POST
// /v1/sessions/start, the user turns as `user_prompt` events with
// generate=false, the assistant turns as `assistant_message` events with
// generate=true, each with the session's date as occurredAtEpoch (plus the
// turn index in ms, to keep order), then POST /v1/sessions/:id/end, which
// queues the session summary. D stores each turn verbatim as a memory
// (POST /v1/memories), with no observer.
//
// After the jobs drain, each observation's created_at is set to the time of
// what it came from (its source event; a summary, its session's last event;
// a D memory, its turn), because the server stamps rows when they are
// written and a replay writes a year of history in minutes. The context
// renderer dates every row by created_at.
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { lmeDate, sha, sleep, type Question } from './common.ts';

export const PORTS: Record<string, number> = { B: 37897, C: 37898, D: 37899 };
const KEY = 'cmb_memory_bench_52';
const TEAM = 'bench';

export const dbOf = (arm: string) => `${homedir()}/.cache/memory-bench/cmr-${arm}/claude-mem.sqlite`;

function sql(arm: string, statement: string): string {
  return execFileSync('sqlite3', ['-cmd', '.timeout 30000', dbOf(arm), statement], { encoding: 'utf8' }).trim();
}

/** The bench key, its team, and one project per question. */
export function provision(arm: string, projects: string[]) {
  const now = Date.now();
  const rows = projects.map(p => `('${p}','${TEAM}','${p}','{}',${now},${now})`).join(',');
  sql(arm, `INSERT OR IGNORE INTO api_keys (id, key_hash, team_id, project_id, scopes, created_at)
            VALUES ('bench', '${sha(KEY)}', '${TEAM}', NULL, '["memories:read","memories:write"]', ${now});
            INSERT OR IGNORE INTO projects (id, team_id, name, metadata, created_at, updated_at) VALUES ${rows};`);
}

async function call(arm: string, method: string, path: string, body?: unknown): Promise<any> {
  let wait = 1000;
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(`http://127.0.0.1:${PORTS[arm]}${path}`, {
      method, headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    if (r.ok) return text ? JSON.parse(text) : null;
    if (attempt >= 5 || (r.status < 500 && r.status !== 429)) throw new Error(`cmr ${arm} ${method} ${path} ${r.status}: ${text.slice(0, 300)}`);
    await sleep(wait);
    wait *= 2;
  }
}

export interface IngestTiming { acks_ms: number[]; messages: number; sessions: Record<string, string> }

export async function ingest(arm: string, q: Question): Promise<IngestTiming> {
  const project = q.question_id;
  const timing: IngestTiming = { acks_ms: [], messages: 0, sessions: {} };
  const timed = async (method: string, path: string, body?: unknown) => {
    const t0 = performance.now();
    const v = await call(arm, method, path, body);
    timing.acks_ms.push(performance.now() - t0);
    return v;
  };
  for (let i = 0; i < q.haystack_sessions.length; i++) {
    const sid = q.haystack_session_ids[i];
    const at = lmeDate(q.haystack_dates[i]);
    const turns = q.haystack_sessions[i];
    const start = await timed('POST', '/v1/sessions/start', {
      projectId: project, externalSessionId: sid, contentSessionId: sid, platformSource: 'claude', metadata: { project: 'longmemeval' },
    });
    const server = start.session.id as string;
    timing.sessions[server] = sid;
    if (arm === 'D') {
      for (let t = 0; t < turns.length; t++) {
        await timed('POST', '/v1/memories', {
          projectId: project, serverSessionId: server, kind: 'turn',
          content: `[${q.haystack_dates[i]}] ${turns[t].role}: ${turns[t].content}`,
          metadata: { sessionId: sid, role: turns[t].role, turn: t, occurredAt: at + t },
        });
      }
    } else {
      const ev = (t: number) => turns[t].role === 'user'
        ? { projectId: project, serverSessionId: server, sourceType: 'api', eventType: 'user_prompt', occurredAtEpoch: at + t, platformSource: 'claude', payload: { prompt: turns[t].content } }
        : { projectId: project, serverSessionId: server, sourceType: 'api', eventType: 'assistant_message', occurredAtEpoch: at + t, platformSource: 'claude', payload: { last_assistant_message: turns[t].content, platformSource: 'claude' } };
      const user = turns.map((_, t) => t).filter(t => turns[t].role === 'user').map(ev);
      const asst = turns.map((_, t) => t).filter(t => turns[t].role !== 'user').map(ev);
      for (let j = 0; j < user.length; j += 500) await timed('POST', '/v1/events/batch?generate=false', user.slice(j, j + 500));
      for (let j = 0; j < asst.length; j += 500) await timed('POST', '/v1/events/batch?generate=true', asst.slice(j, j + 500));
      await timed('POST', `/v1/sessions/${server}/end`, {});
    }
    timing.messages += turns.length;
  }
  return timing;
}

/** Jobs of a project not yet finished. */
export function pendingJobs(arm: string, project: string): number {
  return Number(sql(arm, `SELECT count(*) FROM generation_jobs WHERE project_id = '${project}' AND status NOT IN ('completed','failed','cancelled','skipped')`));
}

export function jobStats(arm: string, project: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const line of sql(arm, `SELECT status, count(*) FROM generation_jobs WHERE project_id = '${project}' GROUP BY 1`).split('\n').filter(Boolean)) {
    const [s, n] = line.split('|');
    out[s] = Number(n);
  }
  return out;
}

export async function drain(arm: string, project: string, timeoutMs = 6 * 3600_000): Promise<number> {
  const t0 = performance.now();
  if (arm !== 'D') {
    while (pendingJobs(arm, project) > 0) {
      if (performance.now() - t0 > timeoutMs) throw new Error(`jobs for ${project} did not drain`);
      await sleep(2000);
    }
  }
  const ms = performance.now() - t0;
  sql(arm, `UPDATE observations SET created_at = COALESCE(
      (SELECT e.occurred_at FROM observation_sources s JOIN agent_events e ON e.id = s.agent_event_id WHERE s.observation_id = observations.id LIMIT 1),
      json_extract(metadata, '$.occurredAt'),
      (SELECT max(e.occurred_at) FROM agent_events e WHERE e.server_session_id = observations.server_session_id),
      created_at)
    WHERE project_id = '${project}'`);
  return ms;
}

export interface Retrieved { context: string; sessions: (string | null)[]; ms: number; count: number }

/** The deployed per-prompt retrieval: POST /v1/context/semantic at its maximum limit, 20. */
export async function retrieve(arm: string, q: Question, sessions: Record<string, string>): Promise<Retrieved> {
  const t0 = performance.now();
  const r = await call(arm, 'POST', '/v1/context/semantic', { projectId: q.question_id, query: q.question, limit: 20 });
  const ms = performance.now() - t0;
  return {
    context: r.context ?? '',
    sessions: (r.observations ?? []).map((o: any) => sessions[o.serverSessionId] ?? o.metadata?.sessionId ?? null),
    ms,
    count: r.count ?? (r.observations ?? []).length,
  };
}

/** Benchmark session id of each server session of a project (from the store, for runs resumed after ingestion). */
export function sessionMap(arm: string, project: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of sql(arm, `SELECT id, external_session_id FROM server_sessions WHERE project_id = '${project}'`).split('\n').filter(Boolean)) {
    const [id, ext] = line.split('|');
    out[id] = ext;
  }
  return out;
}

export function storeBytes(arm: string): number {
  return Number(execFileSync('du', ['-sb', `${homedir()}/.cache/memory-bench/cmr-${arm}`], { encoding: 'utf8' }).split('\t')[0]);
}
