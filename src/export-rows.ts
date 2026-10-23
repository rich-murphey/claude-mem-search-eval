// A dataset's rows and query scopes as JSON lines, for searches run outside
// this repo (chroma-mem's `bench`) that read the release vectors but not the
// datasets themselves.
//
//   node src/export-rows.ts --dataset longmemeval-s [--out out]
//
// out/<dataset>/rows.jsonl: {doc, part, project, text} per row, in the order
// of rows.tsv and the vector files (checked against rows.tsv's text hashes).
// out/<dataset>/scope.jsonl: {id, project, candidates, text} per query, in the
// order of queries.f16.bin; candidates is the haystack searched, or null when
// the query searches its project; text is the query, unprefixed.
import { closeSync, openSync, readFileSync, writeFileSync, writeSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { contentHash, loadDataset, rowsOf } from './datasets.ts';

const { values } = parseArgs({
  options: {
    dataset: { type: 'string', default: 'longmemeval-s' },
    out: { type: 'string', default: 'out' },
  },
});

const dataset = await loadDataset(values.dataset!);
const dir = `${values.out}/${dataset.key}`;
const project = new Map(dataset.docs.map(d => [d.id, d.project]));
const tsv = readFileSync(`${dir}/rows.tsv`, 'utf8').trim().split('\n').slice(1).map(l => l.split('\t'));
const rows = rowsOf(dataset);
if (tsv.length !== rows.length) throw new Error(`rows.tsv has ${tsv.length} rows, dataset ${rows.length}`);
rows.forEach((r, i) => {
  const [doc, part, sha] = tsv[i];
  if (doc !== r.doc || Number(part) !== r.part || sha !== contentHash(r.text)) {
    throw new Error(`row ${i} (${r.doc} ${r.part}) does not match rows.tsv`);
  }
});
// Streamed: LongMemEval's rows hold about 200 MB of text.
const fd = openSync(`${dir}/rows.jsonl`, 'w');
for (const r of rows) writeSync(fd, JSON.stringify({ doc: r.doc, part: r.part, project: project.get(r.doc), text: r.text }) + '\n');
closeSync(fd);
writeFileSync(`${dir}/scope.jsonl`, dataset.queries.map(q =>
  JSON.stringify({ id: q.id, project: q.project, candidates: q.candidates, text: q.text }) + '\n').join(''));
console.log(`${dir}: ${rows.length} rows, ${dataset.queries.length} queries`);
