// Vector-only retrieval accuracy on LongMemEval-S, from precomputed vectors.
//
//   node src/eval.ts [--models minilm-l6,multilingual-e5-small] [--manifest manifests/x.txt]
//
// Each question searches its own haystack (LongMemEval's definition): the
// turns of its ~47 sessions. A session scores as its best turn, as claude-mem
// scores an observation by its nearest part. Relevant = answer_session_ids.
// Abstention questions (*_abs) have no relevant session and are skipped.
import { writeFileSync, mkdirSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { distinctTurns, loadLongMemEvalS, LME_REVISION } from './longmemeval.ts';
import { MODELS, modelByKey } from './models.ts';
import { BOOTSTRAP, loadVectors, metricsFor, readManifest, RELATIVE_ACCURACY_NOTE, renderTables, type Metrics } from './metrics.ts';

const { values } = parseArgs({
  options: {
    models: { type: 'string', default: MODELS.map(m => m.key).join(',') },
    manifest: { type: 'string' },
    out: { type: 'string', default: 'out' },
    results: { type: 'string', default: 'results' },
  },
});

const questions = (await loadLongMemEvalS()).filter(q => !q.question_id.endsWith('_abs'));
const manifest = values.manifest ? readManifest(values.manifest) : null;
const evaluated = manifest ? questions.filter(q => manifest.has(q.question_id)) : questions;

const allQuestions = await loadLongMemEvalS();
const rows = distinctTurns(allQuestions);
const sessionRows = new Map<string, number[]>();
rows.forEach((r, i) => {
  let list = sessionRows.get(r.sessionId);
  if (!list) sessionRows.set(r.sessionId, list = []);
  list.push(i);
});
const queryIndex = new Map(allQuestions.map((q, i) => [q.question_id, i]));

const perModel = new Map<string, Metrics[]>();
for (const key of values.models!.split(',')) {
  const model = modelByKey(key);
  const turns = loadVectors(`${values.out}/${key}/turns.f16.bin`, model.dims);
  const queries = loadVectors(`${values.out}/${key}/queries.f16.bin`, model.dims);
  if (turns.length !== rows.length * model.dims) throw new Error(`${key}: turns.f16.bin has ${turns.length / model.dims} rows, expected ${rows.length}`);
  const results: Metrics[] = [];
  for (const q of evaluated) {
    const qi = queryIndex.get(q.question_id)!;
    const qv = queries.subarray(qi * model.dims, (qi + 1) * model.dims);
    // A haystack can list a session twice (README, Data); it counts once.
    const scored = [...new Set(q.haystack_session_ids)].map(sessionId => {
      let best = -Infinity;
      for (const row of sessionRows.get(sessionId)!) {
        let dot = 0;
        const base = row * model.dims;
        for (let d = 0; d < model.dims; d++) dot += qv[d] * turns[base + d];
        if (dot > best) best = dot;
      }
      return { sessionId, best };
    });
    scored.sort((a, b) => b.best - a.best || (a.sessionId < b.sessionId ? -1 : 1));
    results.push(metricsFor(scored.map(s => s.sessionId), new Set(q.answer_session_ids)));
  }
  perModel.set(key, results);
}

const keys = [...perModel.keys()];
const md = `# LongMemEval-S, vector only\n\n` +
  `Dataset revision ${LME_REVISION}; ${evaluated.length} questions` +
  (values.manifest ? ` from ${values.manifest}` : ' (all answerable)') +
  `; each searches its own haystack; a session scores as its best turn; ` +
  `95% intervals from ${BOOTSTRAP} bootstrap resamples over questions.\n\n` +
  `${RELATIVE_ACCURACY_NOTE}\n\n` +
  renderTables(perModel, evaluated, keys.slice(1).map(k => [k, keys[0]]));
mkdirSync(values.results!, { recursive: true });
const name = values.manifest ? values.manifest.replace(/^.*\//, '').replace(/\.txt$/, '') : 'all';
writeFileSync(`${values.results}/longmemeval-s-vector-${name}.md`, md);
console.log(md);
