import { describe, it } from 'test-anywhere';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import { createQualityServer } from '../src/quality/index.js';
import { runQualityCli } from '../src/quality/cli.js';
import { runProcess } from '../src/quality/process.js';

const root = new URL('../examples/code-quality/token-clones/', import.meta.url);

describe('token clones through consumer interfaces', () => {
  it('matches an independent finite all-pairs oracle within a bounded process', async () => {
    const result = await runProcess('node', [
      '--max-old-space-size=128',
      '--stack-size=512',
      'experiments/code-quality/clone-oracle.mjs',
    ]);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /300 finite/);
  });
  it('returns duplicate locations and a failing gate through the CLI', async () => {
    let output = '';
    const errors = [];
    const code = await runQualityCli(
      [
        'check',
        fileURLToPath(root),
        '--config',
        fileURLToPath(new URL('quality.json', root)),
        '--format',
        'json',
      ],
      {
        stdout: (value) => {
          output += value;
        },
        stderr: (value) => errors.push(value),
      }
    );
    assert.equal(code, 1);
    assert.deepEqual(errors, []);
    const report = JSON.parse(output);
    assert.equal(report.clones.length, 1);
    assert.equal(report.clones[0].tokens, 22);
    assert.equal(report.findings[0].path, 'second.js');
    assert.equal(report.findings[0].column, 29);
  });

  it('runs the same bounded native comparison through the HTTP API', async () => {
    const server = createQualityServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const files = await Promise.all(
        ['first.js', 'second.js'].map(async (path) => ({
          path,
          content: await readFile(new URL(path, root), 'utf8'),
        }))
      );
      const config = JSON.parse(
        await readFile(new URL('quality.json', root), 'utf8')
      );
      const response = await fetch(
        `http://127.0.0.1:${server.address().port}/v1/analyze`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ files, config }),
        }
      );
      assert.equal(response.status, 200);
      const report = await response.json();
      assert.equal(report.passed, false);
      assert.equal(report.incomplete, false);
      assert.equal(report.clones.length, 1);
      assert.equal(report.clones[0].tokens, 22);
      assert.equal(report.clones[0].second.path, 'second.js');
    } finally {
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
});
