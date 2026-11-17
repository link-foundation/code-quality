import { describe, it } from 'test-anywhere';
import assert from 'node:assert/strict';
import {
  analyzeSource,
  analyzeFiles,
  languages,
  detectLanguage,
  formatReport,
  createBaseline,
  checkBaseline,
  updateBaseline,
} from '../src/quality/index.js';
import { qualityFixtures } from './fixtures/quality-languages.js';

describe('native multi-language quality contracts', () => {
  for (const [language, fixture] of Object.entries(qualityFixtures)) {
    it(`${language}: parses valid syntax, extracts a function and refuses incomplete syntax`, async () => {
      const result = await analyzeSource(fixture);
      assert.equal(result.language, language);
      assert.deepEqual(result.findings, []);
      assert.ok(result.abstractions.some((entry) => entry.kind === 'function'));
      assert.ok(
        result.abstractions.every(
          (entry) => entry.hash.length === 64 && entry.shape.length === 64
        )
      );
      const invalid = await analyzeSource({
        ...fixture,
        content: fixture.invalid,
      });
      assert.ok(
        invalid.findings.some(
          (entry) => entry.ruleId === 'syntax' && entry.severity === 'error'
        )
      );
    });
  }

  it('covers the complete language inventory and extension mapping', () => {
    assert.deepEqual(
      languages.map((entry) => entry.id).sort(),
      Object.keys(qualityFixtures).sort()
    );
    assert.equal(detectLanguage('include/api.hpp'), 'cpp');
    assert.equal(detectLanguage('configure.cmake'), 'cmake');
    assert.equal(detectLanguage('run', '#!/usr/bin/env bash\n'), 'bash');
    assert.equal(detectLanguage('data.json'), null);
  });
});

describe('native rules and configuration', () => {
  it('reports boundaries, structural duplication and safe security locations deterministically', async () => {
    const content =
      'export function first(a, b) {\n  if (a) { return b; }\n  return 0;\n}\nexport function second(x, y) {\n  if (x) { return y; }\n  return 0;\n}\nconst password = "fixture-value-only";  \neval("1 + 1");';
    const options = {
      config: {
        rules: {
          complexity: 1,
          parameters: 1,
          'function-lines': 3,
          'file-lines': 5,
        },
      },
    };
    const first = await analyzeFiles([{ path: 'a.js', content }], options);
    const second = await analyzeFiles([{ path: 'a.js', content }], options);
    assert.deepEqual(first, second);
    assert.equal(first.passed, false);
    for (const id of [
      'complexity',
      'parameters',
      'function-lines',
      'file-lines',
      'duplicate-function',
      'hardcoded-secret',
      'unsafe-eval',
      'trailing-whitespace',
      'final-newline',
    ]) {
      assert.ok(
        first.findings.some((entry) => entry.ruleId === id),
        id
      );
    }
    assert.ok(!JSON.stringify(first).includes('fixture-value-only'));
    const sarif = JSON.parse(formatReport(first, 'sarif'));
    assert.equal(sarif.version, '2.1.0');
    assert.equal(sarif.runs[0].results.length, first.findings.length);
    assert.equal(JSON.parse(formatReport(first, 'json')).passed, false);
    assert.match(formatReport(first), /failed/);
    assert.throws(() => formatReport(first, 'unknown'), /format/);
  });

  it('avoids eval matches in comments/strings and runs original custom AST rules', async () => {
    const file = {
      path: 'a.js',
      content:
        '// eval("bad")\nconst message = "eval(1)";\nconsole.log(message);\n',
    };
    const report = await analyzeFiles([file], {
      config: {
        customRules: [
          {
            id: 'no-log',
            message: 'Use structured logging',
            pattern: { kind: 'call_expression', text: 'console.log' },
          },
        ],
      },
    });
    assert.deepEqual(
      report.findings.map((entry) => entry.ruleId),
      ['no-log']
    );
    const plugin = await analyzeFiles([file], {
      plugins: [
        {
          id: 'local/plugin',
          version: '1',
          analyze: ({ path }) => [{ message: path, severity: 'note' }],
        },
      ],
    });
    assert.equal(plugin.findings[0].ruleId, 'local/plugin');
    assert.equal(plugin.passed, true);
    await assert.rejects(
      () =>
        analyzeFiles([file], {
          plugins: [
            {
              id: 'broken',
              analyze() {
                throw new Error('plugin failed');
              },
            },
          ],
        }),
      /plugin failed/
    );
  });
});

describe('input validation and locations', () => {
  it('validates paths, budgets, configuration, duplicate inputs and unsupported languages', async () => {
    for (const path of ['../a.js', '/a.js', 'C:\\a.js', 'a/../b.js']) {
      await assert.rejects(() => analyzeFiles([{ path, content: '' }]), /path/);
    }
    await assert.rejects(() => analyzeFiles([]), /Expected/);
    await assert.rejects(
      () => analyzeFiles([{ path: 'a.xyz', content: '' }]),
      /unsupported/
    );
    await assert.rejects(
      () => analyzeFiles([{ path: 'a.js', content: '\0' }]),
      /NUL/
    );
    await assert.rejects(
      () =>
        analyzeFiles([qualityFixtures.javascript, qualityFixtures.javascript]),
      /duplicate/
    );
    await assert.rejects(
      () =>
        analyzeFiles([qualityFixtures.javascript], {
          config: { limits: { maxFileBytes: 10 } },
        }),
      /budget/
    );
    await assert.rejects(
      () =>
        analyzeFiles([qualityFixtures.javascript], {
          config: { unknown: true },
        }),
      /Unknown/
    );
    await assert.rejects(
      () =>
        analyzeFiles([qualityFixtures.javascript], {
          config: { rules: { complexity: 0 } },
        }),
      /integer/
    );
    await assert.rejects(
      () =>
        analyzeFiles([qualityFixtures.javascript], {
          config: {
            customRules: [{ id: 'x', message: 'x', pattern: { text: '' } }],
          },
        }),
      /Empty/
    );
  });

  it('keeps Unicode locations, method boundaries and class scopes', async () => {
    const report = await analyzeFiles([
      {
        path: 'space dir/é.js',
        content:
          'class Sample {\n  method(x) { const text = "é😀"; return x ? text : ""; }\n}\n',
      },
    ]);
    const method = report.files[0].abstractions.find(
      (entry) => entry.kind === 'function'
    );
    assert.equal(method.qualifiedName, 'Sample.method');
    assert.equal(method.startLine, 2);
    assert.equal(method.complexity, 2);
    assert.ok(
      report.files[0].abstractions.some((entry) => entry.kind === 'class')
    );
  });
});

describe('strict monotonic quality baselines', () => {
  it('refuses to baseline incomplete syntax and rejects invalid plugin locations', async () => {
    const report = await analyzeFiles([
      { path: 'bad.js', content: 'function {' },
    ]);
    assert.equal(report.incomplete, true);
    assert.throws(() => createBaseline(report), /Incomplete/);
    await assert.rejects(
      () =>
        analyzeFiles([{ path: 'a.js', content: 'let x = 1;\n' }], {
          plugins: [
            {
              id: 'bad-location',
              version: '1',
              analyze: () => [{ message: 'bad location', line: 0 }],
            },
          ],
        }),
      /invalid finding/
    );
  });
  it('detects unclosed CMake arguments and command-less parentheses', async () => {
    for (const content of [
      '()\n',
      'message("unterminated)\n',
      'message([=[unterminated)\n',
      '"orphan argument"\n',
      '[=[orphan bracket argument]=]\n',
    ]) {
      const report = await analyzeFiles([{ path: 'CMakeLists.txt', content }]);
      assert.equal(report.passed, false);
      assert.equal(report.incomplete, true);
    }
  });

  it('accepts existing issues, rejects new ones and allows only improving updates', async () => {
    const report = await analyzeFiles([
      { path: 'a.js', content: 'let a = 1;  \n' },
    ]);
    report.metrics = { linePercent: 60, mutationScore: 66.66 };
    const baseline = createBaseline(report);
    assert.equal(checkBaseline(report, baseline).passed, true);
    assert.equal(
      checkBaseline(
        { ...report, metrics: { linePercent: 59.99, mutationScore: 66.66 } },
        baseline
      ).passed,
      false
    );
    assert.equal(
      checkBaseline({ ...report, method: 'different' }, baseline).passed,
      false
    );
    assert.throws(
      () => checkBaseline({ ...report, files: [] }, baseline),
      /nonempty/
    );
    assert.throws(
      () => updateBaseline({ ...report, metrics: {} }, baseline),
      /weakened/
    );
    const improved = {
      ...report,
      findings: [],
      metrics: { linePercent: 100, mutationScore: 100 },
    };
    const raised = updateBaseline(improved, baseline);
    assert.equal(raised.findings.length, 0);
    assert.equal(checkBaseline(report, raised).passed, false);
    assert.throws(
      () => createBaseline({ ...report, incomplete: true }),
      /Incomplete/
    );
    assert.throws(
      () => createBaseline({ ...report, metrics: { linePercent: NaN } }),
      /finite/
    );
  });
});
