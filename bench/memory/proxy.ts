// LLM usage proxy for the memory benchmark (claude-mem-rs#52).
//
//   node bench/memory/proxy.ts --port 37902 --log results/memory-bench/<phase>/usage.jsonl
//
// Every model call of every arm goes through here, so tokens, dollars and
// latency come from one place, from the provider's own usage fields. A client
// points its base URL at http://127.0.0.1:37902/<tag>, where <tag> names the
// arm and stage (`A.deriver`, `B.observer`, `H.answer`, `J.judge`). The proxy
// swaps in the server-side key, maps the model name, pins the provider and
// writes one JSON line per call:
//   {ts, tag, ctx, route, model, provider, status, input_tokens, output_tokens,
//    cached_tokens, reasoning_tokens, cost_usd, ms}
//
// Routes: /v1/messages and /v1/chat/completions go to OpenRouter (Anthropic
// models pinned to provider `anthropic`, Gemini to `google-ai-studio`, no
// fallbacks); /v1/embeddings goes to OpenAI directly; /openai/v1/chat/completions
// goes to OpenAI directly (the judge). POST /_ctx {ctx} sets a label copied
// into every later line (the harness's current phase).
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { homedir } from 'node:os';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    port: { type: 'string', default: '37902' },
    log: { type: 'string', default: 'results/memory-bench/usage.jsonl' },
    // Rich, 2026-11-06: no OpenRouter at all; its routes answer 403.
    'no-openrouter': { type: 'boolean', default: false },
    // Messages calls go here instead (the claude-mem-rs subscription runner), model names unmapped.
    'messages-upstream': { type: 'string' },
  },
});

const OPENROUTER_KEY = readFileSync(`${homedir()}/.config/openrouter/KEY`, 'utf8').trim();
const OPENAI_KEY = envFile(`${homedir()}/.config/openai.env`).OPENAI_API_KEY;
mkdirSync(dirname(values.log!), { recursive: true });

/** Bench model names (as the systems spell them) to OpenRouter ids. */
export const MODEL_MAP: Record<string, string> = {
  'claude-haiku-4-5': 'anthropic/claude-haiku-4.5',
  'claude-haiku-5-5': 'anthropic/claude-haiku-5.5',
  'claude-sonnet-5-5': 'anthropic/claude-sonnet-5.5',
  'gemini-2.5-flash-lite': 'google/gemini-2.5-flash-lite',
};

function envFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

function openRouterModel(model: string): string {
  const id = MODEL_MAP[model] ?? model;
  if (!id.includes('/')) throw new Error(`no OpenRouter id for model ${model}`);
  return id;
}

function pin(id: string) {
  if (id.startsWith('anthropic/')) return { order: ['anthropic'], allow_fallbacks: false };
  if (id.startsWith('google/')) return { order: ['google-ai-studio'], allow_fallbacks: false };
  if (id.startsWith('openai/')) return { order: ['openai'], allow_fallbacks: false };
  return undefined;
}

let ctx = '';

interface Usage { input_tokens: number; output_tokens: number; cached_tokens: number; reasoning_tokens: number; cost_usd: number | null; provider: string | null }

function usageOf(v: any): Usage {
  const u = v?.usage ?? {};
  // Anthropic shape: input_tokens excludes cache reads; OpenAI shape: prompt_tokens includes them.
  const anthropic = u.input_tokens !== undefined;
  const cached = anthropic
    ? (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)
    : (u.prompt_tokens_details?.cached_tokens ?? 0);
  return {
    input_tokens: anthropic ? (u.input_tokens ?? 0) + cached : (u.prompt_tokens ?? 0),
    output_tokens: anthropic ? (u.output_tokens ?? 0) : (u.completion_tokens ?? 0),
    cached_tokens: cached,
    reasoning_tokens: u.output_tokens_details?.thinking_tokens ?? u.completion_tokens_details?.reasoning_tokens ?? 0,
    cost_usd: typeof u.cost === 'number' ? u.cost : null,
    provider: v?.provider ?? null,
  };
}

/** Merge the usage objects seen in an SSE stream (Anthropic or OpenAI). */
function usageOfStream(text: string): Usage {
  const merged: any = { usage: {} };
  for (const line of text.split('\n')) {
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') continue;
    try {
      const v = JSON.parse(data);
      const u = v.usage ?? v.message?.usage;
      if (u) Object.assign(merged.usage, Object.fromEntries(Object.entries(u).filter(([, x]) => x !== null)));
      if (v.provider) merged.provider = v.provider;
    } catch { /* partial line */ }
  }
  return usageOf(merged);
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/_ctx' && req.method === 'POST') {
    ctx = JSON.parse((await readBody(req)).toString() || '{}').ctx ?? '';
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ctx }));
    return;
  }
  const m = /^\/([^/]+)(\/.*)$/.exec(url.pathname);
  if (!m) { res.writeHead(404).end('no tag'); return; }
  const [, tag, rest] = m;
  const raw = await readBody(req);
  let target: string;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  let body: any = raw.length ? JSON.parse(raw.toString()) : undefined;
  let route: string;
  if (rest.endsWith('/embeddings')) {
    route = 'embeddings';
    target = 'https://api.openai.com/v1/embeddings';
    headers.authorization = `Bearer ${OPENAI_KEY}`;
  } else if (rest.startsWith('/openai/') && rest.endsWith('/chat/completions')) {
    route = 'openai.chat';
    target = 'https://api.openai.com/v1/chat/completions';
    headers.authorization = `Bearer ${OPENAI_KEY}`;
  } else if (rest.endsWith('/messages')) {
    route = 'messages';
    target = 'https://openrouter.ai/api/v1/messages';
    headers.authorization = `Bearer ${OPENROUTER_KEY}`;
    headers['anthropic-version'] = String(req.headers['anthropic-version'] ?? '2023-06-01');
    if (req.headers['anthropic-beta']) headers['anthropic-beta'] = String(req.headers['anthropic-beta']);
  } else if (rest.endsWith('/chat/completions')) {
    route = 'chat';
    target = 'https://openrouter.ai/api/v1/chat/completions';
    headers.authorization = `Bearer ${OPENROUTER_KEY}`;
  } else {
    res.writeHead(404).end(`no route for ${rest}`);
    return;
  }
  if (route === 'messages' && values['messages-upstream']) {
    route = 'runner';
    target = `${values['messages-upstream']}/v1/messages`;
    delete headers.authorization;
    headers['x-cmem-caller'] = `memory-bench.${tag}`;
  }
  if (values['no-openrouter'] && route !== 'embeddings' && route !== 'openai.chat' && route !== 'runner') {
    appendFileSync(values.log!, JSON.stringify({ ts: new Date().toISOString(), tag, ctx, route, model: body?.model ?? null, status: 403, error: 'openrouter refused (--no-openrouter)' }) + '\n');
    res.writeHead(403, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { type: 'forbidden', message: 'OpenRouter is off for this run (--no-openrouter)' } }));
    return;
  }
  if (body && route !== 'embeddings' && route !== 'openai.chat' && route !== 'runner') {
    body.model = openRouterModel(body.model);
    const p = pin(body.model);
    if (p) body.provider = p;
    if (route === 'chat') body.usage = { include: true };
    if (route === 'chat' && body.stream) body.stream_options = { include_usage: true };
  }
  const started = performance.now();
  let status = 0;
  let usage: Usage | null = null;
  let error: string | undefined;
  try {
    const upstream = await fetch(target, { method: req.method, headers, body: body ? JSON.stringify(body) : undefined });
    status = upstream.status;
    const type = upstream.headers.get('content-type') ?? 'application/json';
    res.writeHead(status, { 'content-type': type });
    if (type.includes('event-stream') && upstream.body) {
      let text = '';
      const decoder = new TextDecoder();
      for await (const chunk of upstream.body as any) {
        res.write(chunk);
        text += decoder.decode(chunk, { stream: true });
      }
      res.end();
      usage = usageOfStream(text);
    } else {
      const text = await upstream.text();
      res.end(text);
      try { usage = usageOf(JSON.parse(text)); } catch { /* non-JSON error body */ }
      if (status >= 400) error = text.slice(0, 300);
    }
  } catch (e) {
    error = String(e);
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { type: 'proxy_error', message: error } }));
  }
  const line = {
    ts: new Date().toISOString(), tag, ctx, route, model: body?.model ?? null, status,
    ...(usage ?? {}), ms: Math.round(performance.now() - started), ...(error ? { error } : {}),
  };
  appendFileSync(values.log!, JSON.stringify(line) + '\n');
}

createServer((req, res) => {
  handle(req, res).catch(e => {
    if (!res.headersSent) res.writeHead(500);
    res.end(String(e));
  });
}).listen(Number(values.port), '127.0.0.1', () => console.log(`proxy on 127.0.0.1:${values.port}, log ${values.log}`));
