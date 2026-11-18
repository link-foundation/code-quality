import { describe, it } from 'test-anywhere';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { URL, fileURLToPath } from 'node:url';
import { createQualityServer } from '../src/quality/index.js';
import { runQualityCli } from '../src/quality/cli.js';

const root = new URL('../examples/code-quality/taint/', import.meta.url);

describe('native taint consumer evidence', () => {
  it('keeps the original example identical through CLI and HTTP without executing source', async () => {
    let output = '';
    const errors = [];
    assert.equal(
      await runQualityCli(
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
      ),
      1
    );
    assert.deepEqual(errors, []);
    const cli = JSON.parse(output);
    assert.equal(cli.incomplete, false);
    assert.equal(cli.findings.length, 1);
    assert.equal(cli.findings[0].path, 'unsafe.js');
    assert.equal(cli.findings[0].ruleId, 'example/command-flow');
    const files = await Promise.all(
      ['safe.js', 'unsafe.js'].map(async (path) => ({
        path,
        content: await readFile(new URL(path, root), 'utf8'),
      }))
    );
    const config = JSON.parse(
      await readFile(new URL('quality.json', root), 'utf8')
    );
    const server = createQualityServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const response = await fetch(
        `http://127.0.0.1:${server.address().port}/v1/analyze`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ files, config }),
        }
      );
      assert.equal(response.status, 200);
      const http = await response.json();
      assert.deepEqual(http.findings, cli.findings);
      assert.equal(http.method, cli.method);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
