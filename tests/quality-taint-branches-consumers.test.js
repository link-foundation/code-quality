import { describe, it } from 'test-anywhere';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { URL, fileURLToPath } from 'node:url';
import { createQualityServer } from '../src/quality/index.js';
import { runQualityCli } from '../src/quality/cli.js';

const root = new URL(
  '../examples/code-quality/taint-branches/',
  import.meta.url
);

describe('native branch-join consumers', () => {
  it('retains the same example finding and methodology in CLI, HTTP and SARIF', async () => {
    let output = '';
    const errors = [];
    const args = [
      'check',
      fileURLToPath(root),
      '--config',
      fileURLToPath(new URL('quality.json', root)),
    ];
    const io = {
      stdout: (value) => {
        output += value;
      },
      stderr: (value) => errors.push(value),
    };
    assert.equal(await runQualityCli([...args, '--format', 'json'], io), 1);
    assert.deepEqual(errors, []);
    const cli = JSON.parse(output);
    assert.equal(cli.incomplete, false);
    assert.equal(cli.findings.length, 1);
    assert.equal(cli.findings[0].path, 'unsafe.js');
    assert.equal(cli.findings[0].ruleId, 'example/branch-flow');
    output = '';
    assert.equal(await runQualityCli([...args, '--format', 'sarif'], io), 1);
    const sarif = JSON.parse(output);
    assert.equal(
      sarif.runs[0].results[0].codeFlows[0].threadFlows[0].locations.length,
      cli.findings[0].dataFlow.length
    );
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
  it('keeps the linked contract ledger in step with the example files', async () => {
    const ledger = JSON.parse(
      await readFile(
        new URL(
          '../docs/case-studies/issue-1/data/taint-branch-contract.json',
          import.meta.url
        ),
        'utf8'
      )
    );
    assert.equal(ledger.nativePolicy.method, 'branch-join-call-models-v1');
    for (const name of ['safe.js', 'unsafe.js']) {
      const content = await readFile(new URL(name, root), 'utf8');
      const observation = ledger.observations.find(({ path }) => path === name);
      assert.equal(
        observation.sha256,
        createHash('sha256').update(content).digest('hex')
      );
    }
    for (const evidence of ledger.evidence) {
      await readFile(new URL(`../${evidence}`, import.meta.url));
    }
  });
});
