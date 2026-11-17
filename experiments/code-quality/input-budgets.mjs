// Finite adversarial inputs for the two CodeQL polynomial-regex regressions.
// Run in a child with --max-old-space-size=128 --stack-size=512 and a 5s budget.
import assert from 'node:assert/strict';
import { parseCmake } from '../../src/quality/cmake.js';
import { analyzeFiles } from '../../src/quality/index.js';

if (process.argv[2] === 'cmake') {
  const content = `message("${'\\"'.repeat(131_072)}x)\n`;
  const report = parseCmake(content);
  assert.ok(
    report.errors.some((error) => /Unclosed quoted/.test(error.message))
  );
} else if (process.argv[2] === 'whitespace') {
  const content = `//${'\t'.repeat(262_144)}x\n// trailing \t\r\n`;
  const report = await analyzeFiles([{ path: 'a.js', content }]);
  assert.equal(report.incomplete, false);
  assert.deepEqual(
    report.findings
      .filter((entry) => entry.ruleId === 'trailing-whitespace')
      .map((entry) => entry.line),
    [2]
  );
} else {
  throw new Error('Choose cmake or whitespace');
}
