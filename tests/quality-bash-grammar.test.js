import { describe, it } from 'test-anywhere';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL, fileURLToPath, URL } from 'node:url';
import {
  analyzeFiles,
  createBaseline,
  checkBaseline,
  createQualityServer,
  shellMutants,
} from '../src/quality/index.js';
import { runQualityCli } from '../src/quality/cli.js';

const cases = [
  ['literal comparison', 'choose() { [[ word == word ]]; }\n'],
  ['literal inequality', 'choose() { [[ word != other ]]; }\n'],
  ['variable pattern', 'choose() { [[ "$1" == pre* ]]; }\n'],
  [
    'case pattern',
    'choose() { case "$1" in word|other) printf match;; esac; }\n',
  ],
  ['Unicode pattern', 'choose() { [[ "$1" == café* ]]; }\n'],
  ['heredoc', "choose() { cat <<'MARKER'\nbody\nMARKER\n}\n"],
  ['indented heredoc', 'choose() { cat <<-MARKER\n\tbody\n\tMARKER\n}\n'],
  ['here string', 'choose() { cat <<< "$1"; }\n'],
];

describe('independent Bash grammar/runtime regressions', () => {
  for (const [name, content] of cases) {
    it(`parses ${name} and preserves function extraction`, async () => {
      const report = await analyzeFiles([{ path: 'sample.sh', content }]);
      assert.equal(report.incomplete, false);
      assert.deepEqual(report.findings, []);
      assert.deepEqual(
        report.files[0].abstractions.map(({ kind, name }) => [kind, name]),
        [['function', 'choose']]
      );
    });
  }

  it('keeps syntax refusals active and the parser usable afterward', async () => {
    for (const content of [
      'choose() { [[ word == word ]\n',
      'cat <<END\nmissing\n',
    ]) {
      const report = await analyzeFiles([{ path: 'sample.sh', content }]);
      assert.equal(report.incomplete, true);
      assert.ok(report.findings.some(({ ruleId }) => ruleId === 'syntax'));
    }
    const report = await analyzeFiles([
      { path: 'sample.sh', content: cases[0][1] },
    ]);
    assert.equal(report.incomplete, false);
    assert.deepEqual(report.findings, []);
  });
});

describe('Bash syntax consumers and method boundaries', () => {
  it('keeps comparison slices exact after non-ASCII and astral text', async () => {
    const content = '# café 🐚\nchoose() { [[ "café 🐚" == "café 🐚" ]]; }\n';
    const [mutant] = await shellMutants({ path: 'unicode.sh', content });
    assert.equal(content.slice(mutant.start, mutant.end), '==');
    assert.equal(mutant.line, 2);
    assert.equal(mutant.start, content.indexOf('=='));
    const changed =
      content.slice(0, mutant.start) +
      mutant.replacement +
      content.slice(mutant.end);
    const report = await analyzeFiles([
      { path: 'unicode.sh', content: changed },
    ]);
    assert.equal(report.incomplete, false);
    assert.deepEqual(report.findings, []);
  });

  it('retains concrete operator ranges, tree predicates and token clones', async () => {
    const content = cases[0][1];
    const mutants = await shellMutants({ path: 'sample.sh', content });
    assert.deepEqual(
      mutants.map(({ original, replacement, start, end }) => [
        content.slice(start, end),
        original,
        replacement,
      ]),
      [['==', '==', '!=']]
    );
    const report = await analyzeFiles(
      [
        { path: 'a.sh', content },
        { path: 'b.sh', content },
      ],
      {
        config: {
          rules: { 'duplicate-function': false },
          clones: { minTokens: 8 },
          customRules: [
            {
              id: 'local/literal',
              message: 'Review literal comparison',
              languages: ['bash'],
              pattern: {
                tree: {
                  kind: 'binary_expression',
                  fields: { operator: { text: '==' } },
                  all: [{ children: [{ text: 'word' }, { text: 'word' }] }],
                },
              },
            },
          ],
        },
      }
    );
    assert.equal(report.incomplete, false);
    assert.equal(report.clones.length, 1);
    assert.equal(
      report.findings.filter(({ ruleId }) => ruleId === 'local/literal').length,
      2
    );
  });

  it('versions Bash baselines while preserving the preceding JavaScript method', async () => {
    const report = await analyzeFiles([
      { path: 'sample.sh', content: 'choose() { printf "%s\\n" "$1"; }\n' },
    ]);
    const baseline = createBaseline(report);
    baseline.method =
      'fdfb187ec8c6261a340304b66c90151b15c61b3ae8e4cee66773f1d0fdb1487d';
    const result = checkBaseline(report, baseline);
    assert.equal(result.passed, false);
    assert.match(JSON.stringify(result), /method/i);
    const js = await analyzeFiles([
      { path: 'sample.js', content: 'dispatch(first);\n' },
    ]);
    assert.equal(js.method, baseline.method);
  });

  it('refuses a corrupted shipped grammar before parsing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'quality-bash-grammar-'));
    try {
      const source = await readFile(
        new URL('../src/quality/bash-syntax.js', import.meta.url),
        'utf8'
      );
      await writeFile(join(root, 'package.json'), '{"type":"module"}');
      await mkdir(join(root, 'grammars'));
      await writeFile(
        join(root, 'grammars/tree-sitter-bash.wasm'),
        'invalid original probe'
      );
      await writeFile(
        join(root, 'bash-syntax.js'),
        source.replace(
          "'web-tree-sitter-bash-runtime'",
          JSON.stringify(import.meta.resolve('web-tree-sitter-bash-runtime'))
        )
      );
      const { withBashSyntax } = await import(
        pathToFileURL(join(root, 'bash-syntax.js')).href
      );
      await assert.rejects(
        withBashSyntax('[[ word == word ]]\n', () =>
          assert.fail('corrupted grammar reached callback')
        ),
        /Bash grammar checksum mismatch/
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('Bash grammar distribution consumers', () => {
  it('uses the same installed grammar through CLI and HTTP consumers', async () => {
    const root = new URL(
      '../examples/code-quality/shell-syntax/',
      import.meta.url
    );
    let output = '';
    const errors = [];
    const code = await runQualityCli(
      ['check', fileURLToPath(root), '--format', 'json'],
      {
        stdout: (value) => {
          output += value;
        },
        stderr: (value) => errors.push(value),
      }
    );
    assert.equal(code, 0);
    assert.deepEqual(errors, []);
    const cli = JSON.parse(output);
    assert.equal(cli.incomplete, false);
    const server = createQualityServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const response = await fetch(
        `http://127.0.0.1:${server.address().port}/v1/analyze`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            files: [
              {
                path: 'describe.sh',
                content: await readFile(new URL('describe.sh', root), 'utf8'),
              },
            ],
          }),
        }
      );
      assert.equal(response.status, 200);
      const http = await response.json();
      assert.equal(http.incomplete, false);
      assert.equal(http.method, cli.method);
      assert.deepEqual(http.findings, cli.findings);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
