import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { runProcess } from '../../src/quality/process.js';

// Keep pathological regex execution outside the test process with finite input,
// a small V8 heap/stack and a process-group deadline.
const require = createRequire(import.meta.url);
if (process.argv[2] === '--worker') {
  const match = require(process.argv[3]);
  const result = match(process.argv[4])(process.argv[5]);
  process.stdout.write(JSON.stringify(result));
} else {
  const target = process.argv[2]
    ? resolve(process.argv[2])
    : require.resolve('picomatch');
  const cases = [
    ['+(*a)', `${'a'.repeat(32)}!`, false],
    ['+(*)b', 'a'.repeat(32), false],
    ['+(*a)', 'abaca', true],
    ['+(*)b', 'ab', true],
    ['src/**/*.{js,mjs}', 'src/quality/core.js', true],
    ['src/**/*.{js,mjs}', 'src/quality/core.ts', false],
    ['*.{js,mjs,cjs}', 'entry.mjs', true],
    ['**/node_modules/**', 'app/node_modules/a/index.js', true],
    ['.changeset/*.md', '.changeset/quality.md', true],
    ['tests/quality-*.test.js', 'tests/quality-shell.test.js', true],
    ['**/*.js', '.hidden/file.js', false],
    ['@(src|tests)/**', 'src/quality/core.js', true],
  ];
  for (const [pattern, input, expected] of cases) {
    const result = await runProcess(
      process.env.QUALITY_NODE || 'node',
      [
        '--max-old-space-size=64',
        '--stack-size=512',
        fileURLToPath(import.meta.url),
        '--worker',
        target,
        pattern,
        input,
      ],
      { timeoutMs: 5000, maxOutputBytes: 65_536 }
    );
    assert.equal(result.code, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout), expected, pattern);
  }
  console.log(
    `Verified ${cases.length} bounded glob security/compatibility cases`
  );
}
