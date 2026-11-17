import { describe, it } from 'test-anywhere';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import {
  analyzeFiles,
  createBaseline,
  checkBaseline,
  createQualityServer,
  formatReport,
} from '../src/quality/index.js';
import { runQualityCli } from '../src/quality/cli.js';
import { runProcess } from '../src/quality/process.js';
import { qualityFixtures } from './fixtures/quality-languages.js';

const rule = (tree, extra = {}) => ({
  id: 'local/structure',
  message: 'Review the matching structure',
  pattern: { tree },
  ...extra,
});
const check = (content, tree, extra = {}) =>
  analyzeFiles([{ path: 'sample.js', content }], {
    config: { customRules: [rule(tree, extra)] },
  });
const call = (children) => ({
  kind: 'call_expression',
  children: [
    { kind: 'identifier', text: 'publish' },
    { kind: 'arguments', children },
  ],
});
const locations = (report) =>
  report.findings.filter((entry) => entry.ruleId === 'local/structure');

const functionKinds = {
  javascript: 'function_declaration',
  typescript: 'function_declaration',
  tsx: 'function_declaration',
  rust: 'function_item',
  python: 'function_definition',
  go: 'function_declaration',
  csharp: 'method_declaration',
  java: 'method_declaration',
  c: 'function_definition',
  cpp: 'function_definition',
  php: 'function_definition',
  bash: 'function_definition',
};

describe('native structural tree rules across grammars', () => {
  for (const [language, kind] of Object.entries(functionKinds)) {
    it(`${language}: matches native named children without language template translation`, async () => {
      const report = await analyzeFiles([qualityFixtures[language]], {
        config: {
          customRules: [
            rule(
              { kind, capture: 'FUNCTION', children: [{ rest: true }] },
              { languages: [language] }
            ),
          ],
        },
      });
      assert.equal(report.incomplete, false);
      assert.equal(locations(report).length, 1);
      assert.equal(report.passed, false);
    });
  }
});

describe('native structural tree rules and captures', () => {
  it('matches nested calls and ignores comments/strings containing the source pattern', async () => {
    const report = await check(
      '// publish(a, a)\nconst note = "publish(a, a)";\nwrap(publish(item, item));\npublish(item, other);\n',
      call([{ capture: 'ITEM' }, { capture: 'ITEM' }])
    );
    assert.deepEqual(
      locations(report).map(({ line, column }) => [line, column]),
      [[3, 6]]
    );
    assert.ok(!JSON.stringify(report).includes('publish(item'));
    const sarif = JSON.parse(formatReport(report, 'sarif'));
    assert.equal(
      sarif.runs[0].results[0].locations[0].physicalLocation.region.startColumn,
      6
    );
  });

  it('compares repeated captures structurally while preserving operators and literal spelling', async () => {
    const source = `${[
      'publish(build(left + 1), build( left /* spacing */ + 1 ));',
      'publish(build(left + 1), build(left - 1));',
      'publish(build(left + 1), build(right + 1));',
      'publish("plain", \'plain\');',
      'publish(item, item, item);',
    ].join('\n')}\n`;
    const report = await check(
      source,
      call([{ capture: 'VALUE' }, { capture: 'VALUE' }])
    );
    assert.deepEqual(
      locations(report).map(({ line }) => line),
      [1]
    );
  });

  it('scopes captures to one candidate and rule, and permits distinct capture names', async () => {
    const report = await check(
      'publish(first, first);\npublish(second, second);\npublish(first, second);\n',
      call([{ capture: 'A' }, { capture: 'A' }])
    );
    assert.deepEqual(
      locations(report).map(({ line }) => line),
      [1, 2]
    );
    const distinct = await check(
      'publish(first, second);\n',
      call([{ capture: 'A' }, { capture: 'B' }])
    );
    assert.equal(locations(distinct).length, 1);
    const independent = await analyzeFiles(
      [{ path: 'a.js', content: 'publish(item, item);\n' }],
      {
        config: {
          customRules: [
            rule(call([{ capture: 'VALUE' }, { capture: 'VALUE' }]), {
              id: 'local/first',
            }),
            rule(
              {
                kind: 'call_expression',
                children: [{ capture: 'VALUE' }, { kind: 'arguments' }],
              },
              { id: 'local/second' }
            ),
          ],
        },
      }
    );
    assert.deepEqual(
      independent.findings.map(({ ruleId }) => ruleId),
      ['local/first', 'local/second']
    );
  });

  it('supports one zero-or-more named-child wildcard at either end or in the middle', async () => {
    const source =
      'publish();\npublish(first);\npublish(first, middle, last);\npublish(last);\n';
    const first = await check(
      source,
      call([{ text: 'first' }, { rest: true }])
    );
    assert.deepEqual(
      locations(first).map(({ line }) => line),
      [2, 3]
    );
    const last = await check(source, call([{ rest: true }, { text: 'last' }]));
    assert.deepEqual(
      locations(last).map(({ line }) => line),
      [3, 4]
    );
    const middle = await check(
      source,
      call([{ text: 'first' }, { rest: true }, { text: 'last' }])
    );
    assert.deepEqual(
      locations(middle).map(({ line }) => line),
      [3]
    );
    assert.equal(
      locations(await check(source, call([{ rest: true }]))).length,
      4
    );
    assert.equal(locations(await check(source, call([]))).length, 1);
  });

  it('binds the same subtree on both sides of a wildcard without joining unrelated scopes', async () => {
    const source =
      'publish(first, middle, first);\npublish(first, middle, last);\npublish(first);\npublish(first, first);\n';
    const report = await check(
      source,
      call([{ capture: 'EDGE' }, { rest: true }, { capture: 'EDGE' }])
    );
    assert.deepEqual(
      locations(report).map(({ line }) => line),
      [1, 4]
    );
  });

  it('uses exact text constraints, optional child constraints and named nodes only', async () => {
    const source = 'publish(first);\npublish( first );\npublish(second);\n';
    assert.equal(
      locations(await check(source, { kind: 'arguments' })).length,
      3
    );
    const exact = await check(source, { kind: 'arguments', text: '(first)' });
    assert.deepEqual(
      locations(exact).map(({ line }) => line),
      [1]
    );
    assert.equal(
      locations(await check('publish(/* comment */);\n', call([]))).length,
      1
    );
    assert.equal(
      locations(await check(source, { kind: 'identifier', text: '+' })).length,
      0
    );
    assert.equal(
      locations(await check('', { kind: 'program', text: '' })).length,
      1
    );
  });
});

describe('native structural tree rules and configuration', () => {
  it('selects named fields and operator tokens without literal source templates', async () => {
    const source =
      'publish(left + left);\npublish(left - left);\npublish(left + right);\n';
    const selected = await check(source, {
      kind: 'binary_expression',
      fields: {
        operator: { text: '+' },
        left: { capture: 'VALUE' },
        right: { capture: 'VALUE' },
      },
    });
    assert.deepEqual(
      locations(selected).map(({ line }) => line),
      [1]
    );
    const named = await check(source, {
      kind: 'call_expression',
      fields: {
        function: { text: 'publish' },
        arguments: { kind: 'arguments', children: [{ rest: true }] },
      },
    });
    assert.equal(locations(named).length, 3);
    assert.equal(
      locations(
        await check(source, {
          kind: 'call_expression',
          fields: { missing: { capture: 'X' } },
        })
      ).length,
      0
    );
  });

  it('preserves language selection, severity, legacy results and default methodology', async () => {
    const content = 'publish(item, item);\n';
    assert.equal(
      locations(
        await check(content, call([{ rest: true }]), { languages: ['python'] })
      ).length,
      0
    );
    const note = await check(content, call([{ rest: true }]), {
      severity: 'note',
    });
    assert.equal(note.passed, true);
    const files = [{ path: 'sample.js', content }];
    const legacy = {
      id: 'legacy',
      message: 'legacy',
      pattern: { kind: 'call_expression', text: 'publish' },
    };
    const before = await analyzeFiles(files, {
      config: { customRules: [legacy] },
    });
    const mixed = await analyzeFiles(files, {
      config: { customRules: [legacy, rule(call([{ rest: true }]))] },
    });
    assert.deepEqual(
      mixed.findings.filter((entry) => entry.ruleId === 'legacy'),
      before.findings
    );
    // Recorded from the unchanged legacy contract at 76a904f.
    assert.equal(
      before.method,
      'f4ac73b57d0ed1897c04ceccc1ddcad35057d2e56a8fe2309cbb54a0baa97faf'
    );
    assert.equal(
      before.findings[0].fingerprint,
      '61a5cb4c245902ffd69a71eee5e0d0ef7be8e8379f0322fa9faef8615f7e0ac3'
    );
    const baseline = createBaseline(before);
    assert.equal(checkBaseline(mixed, baseline).passed, false);
    assert.notEqual(mixed.method, before.method);
    assert.deepEqual(
      before,
      await analyzeFiles(files, { config: { customRules: [legacy] } })
    );
  });

  it('refuses applicable CMake tree rules and baselines incomplete syntax', async () => {
    const tree = { kind: 'command' };
    const report = await analyzeFiles([qualityFixtures.cmake], {
      config: { customRules: [rule(tree)] },
    });
    assert.equal(report.incomplete, true);
    assert.ok(
      report.findings.some((entry) => entry.ruleId === 'unsupported-analysis')
    );
    assert.throws(() => createBaseline(report), /Incomplete/);
    const ignored = await analyzeFiles([qualityFixtures.cmake], {
      config: { customRules: [rule(tree, { languages: ['javascript'] })] },
    });
    assert.equal(ignored.incomplete, false);
    const invalid = await check('function broken( {\n', { kind: 'identifier' });
    assert.equal(invalid.incomplete, true);
    assert.throws(() => createBaseline(invalid), /Incomplete/);
  });
});

describe('native structural tree rules validation', () => {
  it('rejects malformed/ambiguous/oversized tree configuration before analysis', async () => {
    const invalid = [
      null,
      [],
      {},
      { unknown: true },
      { kind: '' },
      { kind: '+' },
      { kind: 1 },
      { kind: undefined },
      Object.create({ kind: 'identifier' }),
      { text: false },
      { text: 'x'.repeat(4097) },
      { capture: 'lower' },
      { capture: '$VALUE' },
      { capture: '' },
      { children: null },
      { children: [null] },
      { children: Array(129).fill({ kind: 'identifier' }) },
      { fields: null },
      { fields: [] },
      { fields: { 'bad-field': { capture: 'A' } } },
      { fields: { operator: { rest: true } } },
      {
        fields: Object.fromEntries(
          Array.from({ length: 33 }, (_, index) => [
            `f${index}`,
            { capture: 'A' },
          ])
        ),
      },
      { rest: true },
      { children: [{ rest: false }] },
      { children: [{ rest: true, capture: 'X' }] },
      { children: [{ rest: true }, { rest: true }] },
    ];
    let deep = { kind: 'identifier' };
    for (let index = 0; index < 33; index++) {
      deep = { children: [deep] };
    }
    invalid.push(deep);
    const broad = {
      children: Array.from({ length: 128 }, () => ({
        children: Array(4).fill({ capture: 'A' }),
      })),
    };
    invalid.push(broad);
    for (const tree of invalid) {
      await assert.rejects(
        () => check('publish(value);\n', tree),
        /Tree pattern|tree pattern/
      );
    }
    const cyclic = { children: [] };
    cyclic.children.push(cyclic);
    await assert.rejects(() => check('publish(value);\n', cyclic), /budget/);
    await assert.rejects(
      () =>
        analyzeFiles([qualityFixtures.javascript], {
          config: {
            customRules: [
              {
                ...rule({ kind: 'identifier' }),
                pattern: { tree: { kind: 'identifier' }, text: 'x' },
              },
            ],
          },
        }),
      /cannot combine/
    );
    const many = Array.from({ length: 20 }, (_, index) =>
      rule(
        {
          children: Array.from({ length: 4 }, () => ({
            children: Array.from({ length: 124 }, () => ({ capture: 'A' })),
          })),
        },
        { id: `local/n${index}` }
      )
    );
    await assert.rejects(
      () =>
        analyzeFiles([qualityFixtures.javascript], {
          config: { customRules: many },
        }),
      /size\/depth budget/
    );
    const huge = Array.from({ length: 20 }, (_, index) =>
      rule({ text: 'a'.repeat(4096) }, { id: `local/r${index}` })
    );
    await assert.rejects(
      () =>
        analyzeFiles([qualityFixtures.javascript], {
          config: { customRules: huge },
        }),
      /metadata budget/
    );
  });
});

describe('structural rule consumers and work bounds', () => {
  it('shares comparison work across candidates and bounds captures in a small process', async () => {
    const result = await runProcess('node', [
      '--max-old-space-size=128',
      '--stack-size=512',
      'experiments/code-quality/tree-pattern-budget.mjs',
    ]);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /Shared structural comparison budget/);
  });

  it('keeps example CLI and HTTP findings/method identical', async () => {
    const root = new URL(
      '../examples/code-quality/tree-patterns/',
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
    assert.equal(cli.incomplete, false);
    assert.deepEqual(
      cli.findings.map(({ ruleId, line }) => [ruleId, line]),
      [['local/repeated-target', 2]]
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
