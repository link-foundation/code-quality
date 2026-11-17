import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { URL } from 'node:url';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { runProcess } from '../../src/quality/process.js';

const root = await mkdtemp(join(tmpdir(), 'quality-glob-provenance-'));
try {
  const manifest = JSON.parse(
    await readFile(new URL('../../package.json', import.meta.url), 'utf8')
  );
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({
      name: 'quality-glob-provenance',
      private: true,
      dependencies: { picomatch: manifest.overrides.picomatch },
    })
  );
  for (const args of [
    ['install', '--ignore-scripts', '--no-audit', '--no-fund'],
    ['audit', 'signatures', '--json'],
  ]) {
    const result = await runProcess('npm', args, {
      cwd: root,
      timeoutMs: 120_000,
    });
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    assert.equal(result.code, 0, result.stderr);
  }
} finally {
  await rm(root, { recursive: true, force: true });
}
