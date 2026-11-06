// Judged precision on LongMemEval (README § Plan, step 5): an LLM judge reads
// every top-5 session that LongMemEval does not label relevant and says
// whether it holds evidence for the answer, bounding the false negatives in
// the labels.
//
//   node src/judge.ts --manifest manifests/lme-s-100-v1.txt [--models minilm-l6] \
//     [--rankings name=file.tsv] [--verdicts results/judge/verdicts.tsv]
//
// Rankings: each --models model's exact vector ranking (as eval.ts ranks), and
// each --rankings file (a query id and its ranked document ids per line,
// tab-separated, as server-search.ts --rankings-out writes). Verdicts are
// keyed by (question, session), appended as they come, and reused, so a
// second ranking pays only for the sessions it adds.
//
// Judge: GPT-4o (gpt-4o-2024-08-06, the memory benchmark's judge) through
// OpenRouter, pinned to OpenAI with no fallback, temperature 0; the key is
// read from ~/.config/openrouter/KEY. Each verdict records its cost as
// OpenRouter reports it.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { loadDataset, rowsOf, searchedDocs } from './datasets.ts';
import { loadLongMemEvalS, type LmeQuestion } from './longmemeval.ts';
import { interval, K, loadVectors, mean, readManifest } from './metrics.ts';
import { modelByKey } from './models.ts';

export const JUDGE_MODEL = 'openai/gpt-4o-2024-08-06';

export interface Verdict { question: string; session: string; relevant: boolean; reason: string; model: string; cost: number }

export const VERDICT_HEADER = 'question_id\tsession_id\tverdict\treason\tmodel\tcost_usd';

export function readVerdicts(path: string): Map<string, Verdict> {
  const out = new Map<string, Verdict>();
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, 'utf8').trim().split('\n').slice(1)) {
    const [question, session, verdict, reason, model, cost] = line.split('\t');
    out.set(`${question}\t${session}`, { question, session, relevant: verdict === 'relevant', reason, model, cost: Number(cost) });
  }
  return out;
}

/** A session as the judge reads it: its date, then each turn as role: content. */
export function renderSession(q: LmeQuestion & { haystack_dates?: string[] }, session: string): string {
  const i = q.haystack_session_ids.indexOf(session);
  if (i < 0) throw new Error(`${session} is not in ${q.question_id}'s haystack`);
  const date = q.haystack_dates?.[i];
  return (date ? `Session date: ${date}\n\n` : '') +
    q.haystack_sessions[i].map(t => `${t.role}: ${t.content}`).join('\n\n');
}

export function judgePrompt(q: LmeQuestion, session: string): string {
  return [
    'A memory system retrieved one past chat session to help answer a question. Decide whether this session holds evidence needed for the correct answer: a fact, preference, event or statement that the answer is drawn from, alone or combined with other sessions.',
    'A session that only shares the topic, or mentions related things without the information the answer needs, is not relevant.',
    '',
    `Question: ${q.question}`,
    `Correct answer: ${typeof q.answer === 'string' ? q.answer : JSON.stringify(q.answer)}`,
    `Question type: ${q.question_type}`,
    '',
    '<session>',
    session,
    '</session>',
    '',
    'Reply with JSON only: {"relevant": true or false, "reason": "at most 20 words, naming the evidence or what is missing"}',
  ].join('\n');
}

/** Parse {"relevant": bool, "reason": str} from a reply, tolerating a code fence. */
export function parseVerdict(text: string): { relevant: boolean; reason: string } {
  const m = /\{[\s\S]*\}/.exec(text);
  if (!m) throw new Error(`no JSON in reply: ${text.slice(0, 200)}`);
  const j = JSON.parse(m[0]);
  if (typeof j.relevant !== 'boolean') throw new Error(`no boolean "relevant" in reply: ${m[0].slice(0, 200)}`);
  return { relevant: j.relevant, reason: String(j.reason ?? '').replace(/[\t\n]+/g, ' ').trim() };
}

async function callJudge(prompt: string, key: string): Promise<{ text: string; cost: number }> {
  let wait = 2000;
  for (let attempt = 0; ; attempt++) {
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: JUDGE_MODEL,
        provider: { order: ['openai'], allow_fallbacks: false },
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        max_tokens: 80,
        response_format: { type: 'json_object' },
        usage: { include: true },
      }),
    });
    if (r.ok) {
      const j = await r.json();
      return { text: j.choices[0].message.content, cost: Number(j.usage?.cost ?? NaN) };
    }
    if (attempt >= 6 || (r.status < 500 && r.status !== 429)) throw new Error(`judge ${r.status}: ${await r.text()}`);
    await new Promise(res => setTimeout(res, wait));
    wait *= 2;
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      manifest: { type: 'string', default: 'manifests/lme-s-100-v1.txt' },
      models: { type: 'string', default: 'minilm-l6' },
      rankings: { type: 'string', multiple: true, default: [] },
      verdicts: { type: 'string', default: 'results/judge/verdicts.tsv' },
      out: { type: 'string', default: 'out' },
      results: { type: 'string', default: 'results' },
      concurrency: { type: 'string', default: '8' },
    },
  });
  const dataset = await loadDataset('longmemeval-s');
  const raw = new Map((await loadLongMemEvalS()).map(q => [q.question_id, q]));
  const manifest = readManifest(values.manifest!);
  const queries = dataset.queries.filter(q => manifest.has(q.id));
  const queryIndex = new Map(dataset.queries.map((q, i) => [q.id, i]));
  const searched = searchedDocs(dataset);

  // Each run's top K per query.
  const runs = new Map<string, Map<string, string[]>>();
  const docRows = new Map<string, number[]>();
  rowsOf(dataset).forEach((r, i) => {
    if (!docRows.has(r.doc)) docRows.set(r.doc, []);
    docRows.get(r.doc)!.push(i);
  });
  for (const key of values.models ? values.models.split(',') : []) {
    const model = modelByKey(key);
    const rows = loadVectors(`${values.out}/longmemeval-s/${key}/rows.f16.bin`, model.dims);
    const qvs = loadVectors(`${values.out}/longmemeval-s/${key}/queries.f16.bin`, model.dims);
    const top = new Map<string, string[]>();
    for (const q of queries) {
      const qi = queryIndex.get(q.id)!;
      const qv = qvs.subarray(qi * model.dims, (qi + 1) * model.dims);
      const scored = searched(q).map(doc => {
        let best = -Infinity;
        for (const row of docRows.get(doc)!) {
          let dot = 0;
          const base = row * model.dims;
          for (let d = 0; d < model.dims; d++) dot += qv[d] * rows[base + d];
          if (dot > best) best = dot;
        }
        return { doc, best };
      });
      scored.sort((a, b) => b.best - a.best || (a.doc < b.doc ? -1 : 1));
      top.set(q.id, scored.slice(0, K).map(s => s.doc));
    }
    runs.set(`${key} vector`, top);
  }
  for (const spec of values.rankings!) {
    const [label, path] = spec.split(/=(.*)/);
    const ranked = new Map(readFileSync(path, 'utf8').trim().split('\n').map(l => {
      const [id, ...docs] = l.split('\t');
      return [id, docs.slice(0, K)];
    }));
    for (const q of queries) if (!ranked.has(q.id)) throw new Error(`${path}: no ranking for ${q.id}`);
    runs.set(label, ranked);
  }

  // Judge every unlabelled top-K session not judged before.
  const verdicts = readVerdicts(values.verdicts!);
  const todo: Array<{ q: string; s: string }> = [];
  const seen = new Set<string>();
  for (const top of runs.values()) {
    for (const q of queries) {
      for (const s of top.get(q.id)!) {
        const k = `${q.id}\t${s}`;
        if (q.relevant.has(s) || verdicts.has(k) || seen.has(k)) continue;
        seen.add(k);
        todo.push({ q: q.id, s });
      }
    }
  }
  if (todo.length) {
    const key = readFileSync(`${homedir()}/.config/openrouter/KEY`, 'utf8').trim();
    mkdirSync(dirname(values.verdicts!), { recursive: true });
    if (!existsSync(values.verdicts!)) writeFileSync(values.verdicts!, VERDICT_HEADER + '\n');
    console.error(`judging ${todo.length} unlabelled top-${K} sessions with ${JUDGE_MODEL}`);
    let next = 0, done = 0;
    await Promise.all(Array.from({ length: Number(values.concurrency) }, async () => {
      while (next < todo.length) {
        const { q, s } = todo[next++];
        const lq = raw.get(q)!;
        const reply = await callJudge(judgePrompt(lq, renderSession(lq, s)), key);
        const v = parseVerdict(reply.text);
        const verdict: Verdict = { question: q, session: s, relevant: v.relevant, reason: v.reason, model: JUDGE_MODEL, cost: reply.cost };
        verdicts.set(`${q}\t${s}`, verdict);
        appendFileSync(values.verdicts!, [q, s, v.relevant ? 'relevant' : 'not', v.reason, JUDGE_MODEL, reply.cost].join('\t') + '\n');
        if (++done % 25 === 0) console.error(`${done}/${todo.length}`);
      }
    }));
  }

  // Label-based and judged P@K per run.
  const lines = [
    '# LongMemEval judged precision',
    '',
    `LongMemEval-S cleaned (xiaowu0162/longmemeval-cleaned @ 98d7416c, MIT). ${queries.length} queries from ${values.manifest}; each searches its own haystack. ` +
    `Every top-${K} session not labelled relevant was judged by ${JUDGE_MODEL} (src/judge.ts; verdicts in ${values.verdicts}). ` +
    `Judged P@${K} counts a session relevant when it is labelled or the judge finds evidence in it. 95% intervals from 2000 bootstrap resamples over queries.`,
    '',
    `| Run | Label P@${K} | Judged P@${K} | Unlabelled top-${K} | Judged relevant |`,
    '|---|---|---|---|---|',
  ];
  for (const [label, top] of runs) {
    const labelP: number[] = [], judgedP: number[] = [];
    let unlabelled = 0, yes = 0;
    for (const q of queries) {
      let l = 0, j = 0;
      for (const s of top.get(q.id)!) {
        if (q.relevant.has(s)) { l++; j++; continue; }
        unlabelled++;
        if (verdicts.get(`${q.id}\t${s}`)!.relevant) { j++; yes++; }
      }
      labelP.push(l / K); judgedP.push(j / K);
    }
    const fmt = (v: number[]) => { const [lo, hi] = interval(v); return `${mean(v).toFixed(3)} (${lo.toFixed(3)}–${hi.toFixed(3)})`; };
    lines.push(`| ${label} | ${fmt(labelP)} | ${fmt(judgedP)} | ${unlabelled} | ${yes} |`);
  }
  const all = [...verdicts.values()];
  const cost = all.reduce((a, v) => a + (Number.isFinite(v.cost) ? v.cost : 0), 0);
  lines.push('', `Judge spend: $${cost.toFixed(2)} over ${all.length} verdicts, as OpenRouter reported it.`, '');
  const name = values.manifest!.replace(/^.*\//, '').replace(/\.txt$/, '');
  writeFileSync(`${values.results}/longmemeval-s-judged-${name}.md`, lines.join('\n'));
  console.log(lines.join('\n'));
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
