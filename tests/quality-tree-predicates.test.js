import { describe, it } from 'test-anywhere';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import {
  analyzeFiles,
  checkBaseline,
  createBaseline,
  createQualityServer,
  formatReport,
} from '../src/quality/index.js';
import { runQualityCli } from '../src/quality/cli.js';
import { runProcess } from '../src/quality/process.js';
import { qualityFixtures } from './fixtures/quality-languages.js';

const rule = (tree) => ({
  id: 'local/filter',
  message: 'Review selected operation',
  pattern: { tree },
});
const analyze = (content, tree) =>
  analyzeFiles([{ path: 'sample.js', content }], {
    config: { customRules: [rule(tree)] },
  });
const lines = (report) =>
  report.findings
    .filter((finding) => finding.ruleId === 'local/filter')
    .map((finding) => finding.line);

describe('candidate-local tree predicates', () => {
  it('intersects same-node conditions and excludes one operation', async () => {
    const report = await analyze(
      'dispatch(first);\nforward(first);\narchive(first);\n"dispatch(first)";\n',
      {
        all: [
          { kind: 'call_expression' },
          {
            fields: {
              function: { any: [{ text: 'dispatch' }, { text: 'forward' }] },
            },
          },
        ],
        not: { fields: { function: { text: 'forward' } } },
      }
    );
    assert.deepEqual(lines(report), [1]);
    assert.equal(report.incomplete, false);
    assert.equal(report.passed, false);
    assert.equal(
      JSON.parse(formatReport(report, 'sarif')).runs[0].results[0].ruleId,
      'local/filter'
    );
  });

  it('applies nesting, conjunction and negation to one candidate without descendant search', async () => {
    const source = 'dispatch(first);\nforward(second);\narchive(third);\n';
    const tree = {
      kind: 'call_expression',
      fields: {
        function: {
          not: { not: { any: [{ text: 'dispatch' }, { text: 'forward' }] } },
        },
      },
    };
    assert.deepEqual(lines(await analyze(source, tree)), [1, 2]);
    assert.deepEqual(
      lines(
        await analyze(source, {
          kind: 'program',
          all: [{ kind: 'call_expression' }],
        })
      ),
      []
    );
    assert.deepEqual(
      lines(
        await analyze(source, {
          kind: 'call_expression',
          any: [{ kind: 'program' }, { text: 'never' }],
        })
      ),
      []
    );
  });

  it('matches anonymous grammar-field operators inside predicates', async () => {
    const report = await analyze(
      'left + right;\nleft - right;\nleft * right;\n',
      {
        kind: 'binary_expression',
        fields: {
          operator: { any: [{ text: '+' }, { text: '-' }], not: { text: '-' } },
        },
      }
    );
    assert.deepEqual(lines(report), [1]);
  });
});

describe('tree predicate capture scope', () => {
  it('inherits parent bindings in every filter and keeps temporary sibling bindings isolated', async () => {
    const report = await analyze(
      'dispatch(first, first);\ndispatch(first, second);\n',
      {
        kind: 'call_expression',
        fields: {
          arguments: { children: [{ capture: 'FIRST' }, { rest: true }] },
        },
        all: [
          {
            fields: {
              arguments: { children: [{ rest: true }, { capture: 'FIRST' }] },
            },
          },
        ],
      }
    );
    assert.deepEqual(lines(report), [1]);
    const isolated = await analyze('dispatch(first, second);\n', {
      kind: 'call_expression',
      all: [
        {
          fields: {
            arguments: { children: [{ capture: 'LOCAL' }, { rest: true }] },
          },
        },
        {
          fields: {
            arguments: { children: [{ rest: true }, { capture: 'LOCAL' }] },
          },
        },
      ],
    });
    assert.deepEqual(lines(isolated), [1]);
  });

  it('discards captures from failed alternatives, successful alternatives and negation', async () => {
    const first = {
      fields: {
        arguments: { children: [{ capture: 'TEMP' }, { rest: true }] },
      },
    };
    const last = {
      fields: {
        arguments: { children: [{ rest: true }, { capture: 'TEMP' }] },
      },
    };
    const source = 'dispatch(first, second);\n';
    for (const tree of [
      { any: [first], not: last },
      {
        any: [{ ...first, not: { kind: 'call_expression' } }, last],
        all: [first],
      },
      {
        all: [first, last],
        not: { ...first, fields: { missing: { capture: 'TEMP' } } },
      },
    ]) {
      const report = await analyze(source, {
        kind: 'call_expression',
        ...tree,
      });
      assert.deepEqual(lines(report), tree.not === last ? [] : [1]);
    }
  });

  it('keeps all/any truth values independent of clause order', async () => {
    const source = 'dispatch(first, second);\n';
    const first = { fields: { function: { text: 'dispatch' } } };
    const last = {
      fields: {
        arguments: { children: [{ rest: true }, { capture: 'LOCAL' }] },
      },
    };
    for (const key of ['all', 'any']) {
      const before = await analyze(source, {
        kind: 'call_expression',
        [key]: [first, last],
      });
      const after = await analyze(source, {
        kind: 'call_expression',
        [key]: [last, first],
      });
      assert.deepEqual(lines(before), [1]);
      assert.deepEqual(after.findings, before.findings);
    }
  });
});

describe('tree predicate language and baseline boundaries', () => {
  for (const language of [
    'javascript',
    'typescript',
    'tsx',
    'rust',
    'python',
    'go',
    'csharp',
    'java',
    'c',
    'cpp',
    'php',
    'bash',
  ]) {
    it(`${language}: composes original node rules and retains negative boundaries`, async () => {
      const report = await analyzeFiles([qualityFixtures[language]], {
        config: {
          customRules: [
            rule({
              any: [{ kind: 'identifier' }, { kind: 'variable_name' }],
              not: { text: 'unused-native-test-name' },
            }),
          ],
        },
      });
      assert.equal(report.incomplete, false);
      assert.ok(lines(report).length > 0);
    });
  }

  it('preserves old methods and requires migration when predicate syntax is introduced', async () => {
    const files = [{ path: 'sample.js', content: 'dispatch(first);\n' }];
    const original = rule({ kind: 'call_expression' });
    const before = await analyzeFiles(files, {
      config: { customRules: [original] },
    });
    // Recorded independently from the preceding structural candidate, 37bbe25.
    assert.equal(
      before.method,
      '3ba748a7e87da59f617b6d4ee194b8dc23aaf5655e6af2790977fa3d3422cfd6'
    );
    assert.equal(
      before.findings[0].fingerprint,
      'c98ef0bf2fd325054e977b9db7b3b5ea2d4e67db9fe8400c7fcf4264e0bbd149'
    );
    const plainAgain = await analyzeFiles(files, {
      config: { customRules: [original] },
    });
    assert.deepEqual(plainAgain, before);
    const filtered = await analyzeFiles(files, {
      config: { customRules: [rule({ all: [{ kind: 'call_expression' }] })] },
    });
    assert.deepEqual(filtered.findings, before.findings);
    assert.notEqual(filtered.method, before.method);
    assert.equal(checkBaseline(filtered, createBaseline(before)).passed, false);
    const cmake = await analyzeFiles([qualityFixtures.cmake], {
      config: { customRules: [rule({ not: { kind: 'command' } })] },
    });
    assert.equal(cmake.incomplete, true);
    assert.throws(() => createBaseline(cmake), /Incomplete/);
  });
});

describe('tree predicate validation and bounded execution', () => {
  it('rejects malformed, over-broad, cyclic and deep Boolean configuration', async () => {
    const bad = [
      { all: [] },
      { any: [] },
      { all: null },
      { any: {} },
      { not: [] },
      { not: null },
      { all: [{ rest: true }] },
      { not: { rest: true } },
      { any: [{}, { kind: 'identifier' }] },
      { all: Array(129).fill({ kind: 'identifier' }) },
      { any: Array(129).fill({ kind: 'identifier' }) },
    ];
    const cycle = { not: null };
    cycle.not = cycle;
    let deep = { kind: 'identifier' };
    for (let index = 0; index < 33; index++) {
      deep = { not: deep };
    }
    bad.push(cycle, deep, {
      all: Array.from({ length: 128 }, () => ({
        any: Array(4).fill({ capture: 'A' }),
      })),
    });
    for (const tree of bad) {
      await assert.rejects(
        () => analyze('dispatch(first);\n', tree),
        /Tree pattern|tree pattern/
      );
    }
  });

  it('bounds predicate visits, inherited bindings and a finite shared-budget refusal', async () => {
    const result = await runProcess('node', [
      '--max-old-space-size=128',
      '--stack-size=512',
      'experiments/code-quality/tree-predicate-budget.mjs',
    ]);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /finite predicate/);
  });
});

describe('tree predicate consumers', () => {
  it('keeps the original CLI example and HTTP results identical', async () => {
    const root = new URL(
      '../examples/code-quality/tree-predicates/',
      import.meta.url
    );
    const config = JSON.parse(
      await readFile(new URL('quality.json', root), 'utf8')
    );
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
    const cli = JSON.parse(output);
    assert.deepEqual(
      cli.findings.map(({ ruleId, line }) => [ruleId, line]),
      [['local/filter', 2]]
    );
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
                path: 'dispatch.js',
                content: await readFile(new URL('dispatch.js', root), 'utf8'),
              },
            ],
            config,
          }),
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
