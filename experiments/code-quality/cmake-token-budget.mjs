import assert from 'node:assert/strict';
import { parseCmake } from '../../src/quality/cmake.js';

// Finite 333,340-byte source: three tokens per command exceed 100,000.
// Run with --max-old-space-size=128 --stack-size=512; no CMake/build process.
const content = 'message()\n'.repeat(33_334);
assert.throws(
  () => parseCmake(content, { tokens: true }),
  /CMake token count budget exceeded/
);
console.log('CMake refused the finite 100,002-token probe');
