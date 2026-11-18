import { describe, it } from 'test-anywhere';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { URL, fileURLToPath } from 'node:url';
import { decode } from 'lino-objects-codec';
import {
  createQualityServer,
  formatLino,
  formatReport,
  linoMediaType,
  parseCanonicalLino,
  saveReport,
} from '../src/quality/index.js';
import { runQualityCli } from '../src/quality/cli.js';

const root = new URL('../examples/code-quality/taint/', import.meta.url);

async function check(config, format) {
  let output = '';
  const errors = [];
  const code = await runQualityCli(
    ['check', fileURLToPath(root), '--config', config, '--format', format],
    {
      stdout: (value) => {
        output += value;
      },
      stderr: (value) => errors.push(value),
    }
  );
  return { code, output, errors };
}

describe('Links Notation interchange', () => {
  it('round-trips nested values, including single-key objects in lists', () => {
    const value = {
      rules: [{ call: 'x' }, { kind: 'a', x: 1 }],
      text: 'two\nlines "quoted"',
      flags: [true, null, 0],
    };
    assert.deepEqual(parseCanonicalLino(formatLino(value)), value);
  });

  it('refuses repeated keys that the codec would silently collapse', () => {
    const text = '(\n  severity "error"\n  severity "warning"\n)\n';
    assert.deepEqual(decode({ notation: text }), { severity: 'warning' });
    assert.throws(() => parseCanonicalLino(text), /not canonical/);
    assert.throws(() => parseCanonicalLino('(\n  a (\n'), /Invalid Links/);
  });

  it('loads .lino config with the same findings as JSON and emits lino reports', async () => {
    const json = await check(
      fileURLToPath(new URL('quality.json', root)),
      'json'
    );
    const lino = await check(
      fileURLToPath(new URL('quality.lino', root)),
      'lino'
    );
    assert.equal(json.code, 1);
    assert.equal(lino.code, 1);
    assert.deepEqual(lino.errors, []);
    const report = JSON.parse(json.output);
    assert.equal(report.findings[0].ruleId, 'example/command-flow');
    assert.deepEqual(parseCanonicalLino(lino.output), report);
    assert.equal(formatReport(report, 'lino'), lino.output);
  });

  it('fails closed on a repeated config key', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cq-lino-'));
    try {
      const path = join(directory, 'quality.lino');
      await writeFile(path, '(\n  rules (\n  )\n  rules (\n  )\n)\n');
      const result = await check(path, 'json');
      assert.equal(result.code, 2);
      assert.match(result.errors.join(''), /not canonical/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('saves report.lino in report bundles', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cq-lino-'));
    try {
      const report = JSON.parse(
        (await check(fileURLToPath(new URL('quality.json', root)), 'json'))
          .output
      );
      const reports = join(directory, 'reports');
      const saved = await saveReport(report, reports);
      assert.ok(saved.files.includes('report.lino'));
      assert.deepEqual(
        parseCanonicalLino(
          await readFile(join(reports, saved.run, 'report.lino'), 'utf8')
        ),
        report
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('negotiates Links Notation request and response bodies over HTTP', async () => {
    const server = createQualityServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const url = `http://127.0.0.1:${server.address().port}`;
      const body = {
        files: [{ path: 'a.js', content: 'eval(input);\n' }],
      };
      const json = await (
        await fetch(`${url}/v1/analyze`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
      ).json();
      const response = await fetch(`${url}/v1/analyze`, {
        method: 'POST',
        headers: { 'content-type': linoMediaType, accept: linoMediaType },
        body: formatLino(body),
      });
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /^text\/x-lino/);
      assert.deepEqual(parseCanonicalLino(await response.text()), json);
      const refused = await fetch(`${url}/v1/analyze`, {
        method: 'POST',
        headers: { 'content-type': linoMediaType },
        body: '(\n  files (\n  )\n  files (\n  )\n)\n',
      });
      assert.equal(refused.status, 400);
      assert.match((await refused.json()).error, /not canonical/);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
