// LongMemEval-cleaned (xiaowu0162/longmemeval-cleaned, MIT), pinned by
// revision and checked by hash, so every run reads the same bytes. The data
// is downloaded from Hugging Face, never redistributed here.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

export const LME_REVISION = '98d7416c24c778c2fee6e6f3006e7a073259d48f';
export const LME_S_SHA256 = 'd6f21ea9d60a0d56f34a05b609c79c88a451d2ae03597821ea3d5a9678c3a442';
const LME_S_URL =
  `https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/${LME_REVISION}/longmemeval_s_cleaned.json`;

export interface LmeTurn { role: string; content: string; has_answer?: boolean }
export interface LmeQuestion {
  question_id: string;
  question_type: string;
  question: string;
  answer: unknown;
  answer_session_ids: string[];
  haystack_session_ids: string[];
  haystack_sessions: LmeTurn[][];
}

export async function loadLongMemEvalS(cacheDir = 'cache'): Promise<LmeQuestion[]> {
  const path = `${cacheDir}/longmemeval_s_cleaned.json`;
  if (!existsSync(path)) {
    mkdirSync(cacheDir, { recursive: true });
    const response = await fetch(LME_S_URL);
    if (!response.ok) throw new Error(`download failed: ${response.status} ${LME_S_URL}`);
    writeFileSync(path, Buffer.from(await response.arrayBuffer()));
  }
  const bytes = readFileSync(path);
  const sha = createHash('sha256').update(bytes).digest('hex');
  if (sha !== LME_S_SHA256) throw new Error(`${path} has sha256 ${sha}, expected ${LME_S_SHA256}`);
  return JSON.parse(bytes.toString('utf8'));
}

export interface TurnRow { sessionId: string; turnIndex: number; role: string; hasAnswer: boolean; content: string }

/**
 * Every distinct session's turns, sessions in order of first appearance in the
 * file, turns in session order. This order is the row order of every vector
 * file. A session id that recurs with different turns is an error, since rows
 * are keyed by (session id, turn index).
 */
export function distinctTurns(questions: LmeQuestion[]): TurnRow[] {
  const seen = new Map<string, string>();
  const rows: TurnRow[] = [];
  for (const q of questions) {
    q.haystack_session_ids.forEach((sessionId, i) => {
      const turns = q.haystack_sessions[i];
      const digest = createHash('sha256').update(JSON.stringify(turns)).digest('hex');
      const prior = seen.get(sessionId);
      if (prior !== undefined) {
        if (prior !== digest) throw new Error(`session ${sessionId} recurs with different turns`);
        return;
      }
      seen.set(sessionId, digest);
      turns.forEach((turn, turnIndex) => rows.push({
        sessionId, turnIndex, role: turn.role, hasAnswer: turn.has_answer === true, content: turn.content,
      }));
    });
  }
  return rows;
}

export const contentHash = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 16);
