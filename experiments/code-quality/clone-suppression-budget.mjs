import assert from 'node:assert/strict';
import { analyzeFiles } from '../../src/quality/index.js';

// Finite 100 KiB input; run with a 128 MiB heap and bounded stack.
const content = `${'# CPD-OFF CPD-ON\n'.repeat(5001)}message(value)\n`;
await assert.rejects(
  analyzeFiles([{ path: 'probe.cmake', content }], {
    config: { clones: { minTokens: 4, suppressionComments: true } },
  }),
  /Clone suppression marker budget exceeded/
);
console.log('Clone suppression refused the finite 10,002-marker probe');
