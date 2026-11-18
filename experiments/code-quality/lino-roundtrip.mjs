// Checks that a real check report survives a Links Notation round trip.
import { encode, decode } from 'lino-objects-codec';
import { analyzeProject } from '../../src/quality/index.js';
import { isDeepStrictEqual } from 'node:util';

const report = await analyzeProject(
  process.argv[2] || 'examples/code-quality/taint',
  {}
);
const text = encode({ obj: report });
console.log(text.split('\n').slice(0, 40).join('\n'));
const back = decode({ notation: text });
console.log(
  'round-trip equal:',
  isDeepStrictEqual(back, JSON.parse(JSON.stringify(report)))
);
