// A second, independent check of the judge's verdicts (src/judge.ts): Claude,
// run as `claude -p` on Rich's subscription (his ruling, 2026-11-06), reads the
// same prompt blind to the first verdict, for every session the judge marked
// relevant up to 30 and a seeded random sample of the rest, up to --n.
//
//   node src/judge-check.ts --rankings results/judge/rankings-....tsv \
//     [--manifest manifests/lme-s-100-v1.txt] [--n 40] [--model sonnet]
//
// Writes results/judge/check.tsv (question, session, first verdict, second
// verdict, second reason, second model) and prints the agreement.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { parseArgs } from 'node:util';
import { loadDataset } from './datasets.ts';
import { judgePrompt, parseVerdict, readVerdicts, renderSession } from './judge.ts';
import { loadLongMemEvalS } from './longmemeval.ts';
import { K, readManifest } from './metrics.ts';

const { values } = parseArgs({
  options: {
    manifest: { type: 'string', default: 'manifests/lme-s-100-v1.txt' },
    rankings: { type: 'string' },
    verdicts: { type: 'string', default: 'results/judge/verdicts.tsv' },
    check: { type: 'string', default: 'results/judge/check.tsv' },
    n: { type: 'string', default: '40' },
    model: { type: 'string', default: 'sonnet' },
    seed: { type: 'string', default: '20261106' },
  },
});

const dataset = await loadDataset('longmemeval-s');
const raw = new Map((await loadLongMemEvalS()).map(q => [q.question_id, q]));
const manifest = readManifest(values.manifest!);
const queries = dataset.queries.filter(q => manifest.has(q.id));
const verdicts = readVerdicts(values.verdicts!);
const ranked = new Map(readFileSync(values.rankings!, 'utf8').trim().split('\n').map(l => {
  const [id, ...docs] = l.split('\t');
  return [id, docs.slice(0, K)];
}));

// The run's unlabelled top-K verdicts, in ranking order.
const pool = queries.flatMap(q => ranked.get(q.id)!.filter(s => !q.relevant.has(s)).map(s => verdicts.get(`${q.id}\t${s}`)!));
const yes = pool.filter(v => v.relevant).slice(0, 30);
const no = pool.filter(v => !v.relevant);
let a = Number(values.seed) >>> 0;
const rand = () => {
  a = (a + 0x6d2b79f5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
for (let i = no.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [no[i], no[j]] = [no[j], no[i]];
}
const sample = [...yes, ...no.slice(0, Math.max(0, Number(values.n) - yes.length))];

const lines = ['question_id\tsession_id\tjudge\tcheck\tcheck_reason\tcheck_model'];
let agree = 0, model = '';
for (const v of sample) {
  const q = raw.get(v.question)!;
  // Isolated: no tools, hooks, MCP servers, settings or saved session.
  const out = execFileSync('claude', [
    '-p', '--model', values.model!, '--output-format', 'json', '--tools', '', '--strict-mcp-config',
    '--no-session-persistence', '--settings', '{"disableAllHooks":true}', '--setting-sources', '',
  ], { input: judgePrompt(q, renderSession(q, v.session)), cwd: tmpdir(), encoding: 'utf8', maxBuffer: 1 << 24 });
  const j = JSON.parse(out);
  model = Object.keys(j.modelUsage ?? {})[0] ?? values.model!;
  const c = parseVerdict(j.result);
  if (c.relevant === v.relevant) agree++;
  lines.push([v.question, v.session, v.relevant ? 'relevant' : 'not', c.relevant ? 'relevant' : 'not', c.reason, model].join('\t'));
  console.error(`${lines.length - 1}/${sample.length} ${v.question} ${v.session} judge=${v.relevant} check=${c.relevant}`);
}
writeFileSync(values.check!, lines.join('\n') + '\n');
const flipped = (from: string, to: string) => lines.slice(1).filter(l => { const f = l.split('\t'); return f[2] === from && f[3] === to; }).length;
console.log(`${sample.length} verdicts checked by ${model}: ${agree} agree (${(agree / sample.length * 100).toFixed(1)}%); ` +
  `judge relevant, check not: ${flipped('relevant', 'not')} of ${yes.length}; judge not, check relevant: ${flipped('not', 'relevant')} of ${sample.length - yes.length}`);
