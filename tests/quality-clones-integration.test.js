import { describe, it } from 'test-anywhere';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import { createQualityServer } from '../src/quality/index.js';
import { runQualityCli } from '../src/quality/cli.js';
import { runProcess } from '../src/quality/process.js';

const root = new URL('../examples/code-quality/token-clones/', import.meta.url);
const cmakeRoot = new URL(
  '../examples/code-quality/cmake-clones/',
  import.meta.url
);

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
  it('refuses a finite CMake token inventory within a bounded process', async () => {
    const result = await runProcess('node', [
      '--max-old-space-size=128',
      '--stack-size=512',
      'experiments/code-quality/cmake-token-budget.mjs',
    ]);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /100,002-token probe/);
  });
});

describe('token clone examples through CLI and HTTP', () => {
  for (const example of [
    {
      name: 'CMake',
      root: cmakeRoot,
      passed: false,
      files: ['first.cmake', 'second.cmake'],
      tokens: 9,
    },
    {
      name: 'suppressed JavaScript',
      root: new URL(
        '../examples/code-quality/clone-suppression/',
        import.meta.url
      ),
      passed: true,
      files: ['generated.js', 'copied.js'],
    },
    {
      name: 'filtered Java annotations',
      root: new URL('../examples/code-quality/clone-filters/', import.meta.url),
      passed: false,
      files: ['first.java', 'second.java'],
      tokens: 17,
    },
  ]) {
    it(`keeps ${example.name} evidence identical through the CLI and HTTP API`, async () => {
      let output = '';
      const errors = [];
      const code = await runQualityCli(
        [
          'check',
          fileURLToPath(example.root),
          '--config',
          fileURLToPath(new URL('quality.json', example.root)),
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
      assert.equal(code, example.passed ? 0 : 1);
      assert.deepEqual(errors, []);
      const cli = JSON.parse(output);
      assert.equal(cli.incomplete, false);
      assert.equal(cli.passed, example.passed);
      assert.equal(cli.clones.length, example.passed ? 0 : 1);
      if (example.tokens) {
        assert.equal(cli.clones[0].tokens, example.tokens);
      } else {
        assert.equal(cli.cloneSuppressions.length, 2);
      }
      const files = await Promise.all(
        example.files.map(async (path) => ({
          path,
          content: await readFile(new URL(path, example.root), 'utf8'),
        }))
      );
      const config = JSON.parse(
        await readFile(new URL('quality.json', example.root), 'utf8')
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
        assert.equal(http.passed, example.passed);
        assert.deepEqual(http.clones, cli.clones);
        assert.deepEqual(http.cloneGroups, cli.cloneGroups);
        assert.equal(cli.cloneGroups.length, example.passed ? 0 : 1);
        assert.deepEqual(http.findings, cli.findings);
        assert.equal(http.method, cli.method);
        assert.deepEqual(http.cloneSuppressions, cli.cloneSuppressions);
      } finally {
        await new Promise((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve()))
        );
      }
    });
  }
});

describe('token-block consumer gates', () => {
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
    assert.equal(report.cloneGroups[0].occurrences.length, 2);
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
      assert.equal(report.cloneGroups[0].occurrences.length, 2);
      assert.equal(report.clones[0].second.path, 'second.js');
    } finally {
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
});
