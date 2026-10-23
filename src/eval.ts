// Vector-only retrieval accuracy from precomputed vectors, computed exactly.
//
//   node src/eval.ts --dataset longmemeval-s [--models a,b] [--manifest manifests/x.txt] [--min-relevant 5]
//   node src/eval.ts --dataset longmemeval-s --models minilm-l6 --rankings chroma-mem=x.tsv [--rankings b=y.tsv] [--name chroma-mem] [--note text]
//
// --rankings scores a search run elsewhere: each line of the file is a query
// id and its top 10 document ids in order, tab-separated. Each ranking is
// paired against the first model, and each after the first against the first.
//
// Each query searches its documents: LongMemEval's own haystack, or the
// query's project. A document scores as its best part, as claude-mem scores
// an observation by its nearest part.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { loadDataset, rowsOf, searchedDocs } from './datasets.ts';
import { MODELS, modelByKey } from './models.ts';
import { BOOTSTRAP, loadVectors, metricsFor, readManifest, renderTables, resultsHeader, type Metrics } from './metrics.ts';

const { values } = parseArgs({
  options: {
    dataset: { type: 'string', default: 'longmemeval-s' },
    models: { type: 'string', default: MODELS.map(m => m.key).join(',') },
    manifest: { type: 'string' },
    'min-relevant': { type: 'string', default: '1' },
    out: { type: 'string', default: 'out' },
    results: { type: 'string', default: 'results' },
    rankings: { type: 'string', multiple: true, default: [] },
    name: { type: 'string' },
    note: { type: 'string' },
  },
});

const dataset = await loadDataset(values.dataset!);
const manifest = values.manifest ? readManifest(values.manifest) : null;
// --min-relevant 5 keeps queries with at least five relevant documents, where
// a perfect top 5 scores P@5 = 1 (with one, P@5 cannot exceed 0.2).
const minRelevant = Number(values['min-relevant']);
const evaluated = dataset.queries.filter(q => (!manifest || manifest.has(q.id)) && q.relevant.size >= minRelevant);
const queryIndex = new Map(dataset.queries.map((q, i) => [q.id, i]));
const docRows = new Map<string, number[]>();
const allRows = rowsOf(dataset);
const rowCount = allRows.length;
allRows.forEach((r, i) => {
  if (!docRows.has(r.doc)) docRows.set(r.doc, []);
  docRows.get(r.doc)!.push(i);
});
const searched = searchedDocs(dataset);
const dir = `${values.out}/${dataset.key}`;

const perModel = new Map<string, Metrics[]>();
for (const key of values.models!.split(',')) {
  const model = modelByKey(key);
  const rows = loadVectors(`${dir}/${key}/rows.f16.bin`, model.dims);
  const queries = loadVectors(`${dir}/${key}/queries.f16.bin`, model.dims);
  if (rows.length !== rowCount * model.dims) {
    throw new Error(`${key}: rows.f16.bin has ${rows.length / model.dims} rows, expected ${rowCount}`);
  }
  const results: Metrics[] = [];
  for (const q of evaluated) {
    const qi = queryIndex.get(q.id)!;
    const qv = queries.subarray(qi * model.dims, (qi + 1) * model.dims);
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
    results.push(metricsFor(scored.slice(0, 10).map(s => s.doc), q.relevant, q.judged));
  }
  perModel.set(key, results);
}

const keys = [...perModel.keys()];
const labels: string[] = [];
for (const spec of values.rankings!) {
  const [label, path] = spec.split(/=(.*)/);
  const ranked = new Map(readFileSync(path, 'utf8').trim().split('\n').map(l => {
    const [id, ...docs] = l.split('\t');
    return [id, docs];
  }));
  perModel.set(label, evaluated.map(q => {
    const docs = ranked.get(q.id);
    if (!docs) throw new Error(`${path}: no ranking for query ${q.id}`);
    return metricsFor(docs.slice(0, 10), q.relevant, q.judged);
  }));
  labels.push(label);
}
const scope = dataset.queries[0].candidates ? 'each searches its own haystack' : 'each searches its project';
const md = resultsHeader(`${dataset.key}, vector only (exact${labels.length ? `, and ${labels.join(', ')}` : ''})`, dataset,
  `${evaluated.length} queries` +
  (values.manifest ? ` from ${values.manifest}` : '') +
  (minRelevant > 1 ? ` with at least ${minRelevant} relevant documents` : '') +
  `; ${scope}; a document scores as its best part; ` +
  `95% intervals from ${BOOTSTRAP} bootstrap resamples over queries.` +
  (values.note ? ` ${values.note}` : '')) +
  renderTables(perModel, evaluated, [
    ...keys.slice(1).map((k): [string, string] => [k, keys[0]]),
    // granite against the best of the others, and against itself cut at 512.
    ...(['granite-97m-r2', 'granite-97m-r2-512'] as const)
      .filter(k => perModel.has(k) && perModel.has('multilingual-e5-small'))
      .map((k): [string, string] => [k, 'multilingual-e5-small']),
    ...(perModel.has('granite-97m-r2') && perModel.has('granite-97m-r2-512')
      ? [['granite-97m-r2', 'granite-97m-r2-512'] as [string, string]] : []),
    ...labels.map((l): [string, string] => [l, keys[0]]),
    ...labels.slice(1).map((l): [string, string] => [l, labels[0]]),
  ]);
mkdirSync(values.results!, { recursive: true });
const name = (values.manifest ? values.manifest.replace(/^.*\//, '').replace(/\.txt$/, '') : 'all') +
  (minRelevant > 1 ? `-min${minRelevant}` : '');
writeFileSync(`${values.results}/${dataset.key}-${labels.length ? (values.name ?? labels[0]) + '-' : 'vector-'}${name}.md`, md);
console.log(md);
