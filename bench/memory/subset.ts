// Draws the pilot subset (trove#52): 20 LongMemEval S questions of
// each of the 6 types, seed 52, written to manifests/memory-bench-pilot-120.txt.
//
//   node bench/memory/subset.ts [--per-type 20] [--seed 52]
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { drawSubset, loadS } from './common.ts';
import { LME_REVISION } from '../../src/longmemeval.ts';

const { values } = parseArgs({ options: { 'per-type': { type: 'string', default: '20' }, seed: { type: 'string', default: '52' } } });
const ids = drawSubset(await loadS(), Number(values['per-type']), Number(values.seed));
writeFileSync('manifests/memory-bench-pilot-120.txt',
  `# LongMemEval S cleaned @ ${LME_REVISION}, ${values['per-type']} per question type, seed ${values.seed} (bench/memory/subset.ts)\n${ids.join('\n')}\n`);
console.log(`${ids.length} ids`);
