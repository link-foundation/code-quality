import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runProcess } from '../../src/quality/process.js';

const root = await mkdtemp(join(tmpdir(), 'quality-bats-abort-'));
try {
  for (const [name, setup, body] of [
    ['assertion', '', 'false'],
    ['setup', 'setup() { false; }', 'true'],
    ['teardown', 'teardown() { false; }', 'true'],
    ['setup-file', 'setup_file() { false; }', 'true'],
  ]) {
    const file = join(root, `${name}.bats`);
    await writeFile(
      file,
      `${setup}\n@test "first" { ${body}; }\n@test "second" { true; }\n`
    );
    const result = await runProcess(
      process.argv[2] || 'bats',
      ['--tap', '--abort', file],
      { timeoutMs: 5000, maxOutputBytes: 65_536 }
    );
    assert.equal(result.code, 1, result.stderr);
    assert.match(result.stdout, /not ok 1/);
    assert.doesNotMatch(result.stdout, /^ok 2/m);
    console.log(JSON.stringify({ name, ...result }));
  }
} finally {
  await rm(root, { recursive: true, force: true });
}
