import { describe, it } from 'test-anywhere';
import assert from 'node:assert/strict';
import {
  analyzeFiles,
  createBaseline,
  checkBaseline,
  formatReport,
} from '../src/quality/index.js';
import { qualityFixtures } from './fixtures/quality-languages.js';

const first = {
  path: 'a.js',
  content:
    'const before = 7;\nfunction alpha(input) {\n  const adjusted = input + 2;\n  console.log(adjusted);\n  return adjusted;\n}\n',
};
const second = {
  path: 'b.js',
  content:
    'function beta(input) {\n  const adjusted = input + 2;\n  console.log(adjusted);\n  return adjusted;\n}\nconst after = 8;\n',
};
const options = {
  config: { clones: { minTokens: 12 }, rules: { 'duplicate-function': false } },
};

describe('bounded native token clones', () => {
  it('finds a maximal partial-function block with exact source locations', async () => {
    const report = await analyzeFiles([first, second], options);
    assert.equal(report.clones.length, 1);
    const [clone] = report.clones;
    assert.equal(clone.tokens, 22);
    assert.deepEqual(
      [
        clone.first.line,
        clone.first.column,
        clone.first.endLine,
        clone.first.endColumn,
      ],
      [2, 15, 6, 2]
    );
    assert.deepEqual(
      [
        clone.second.line,
        clone.second.column,
        clone.second.endLine,
        clone.second.endColumn,
      ],
      [1, 14, 5, 2]
    );
    assert.equal(
      first.content.slice(clone.first.start, clone.first.end),
      second.content.slice(clone.second.start, clone.second.end)
    );
    assert.equal(report.findings.length, 1);
    assert.equal(report.findings[0].ruleId, 'duplicate-tokens');
    assert.equal(report.passed, false);
    const reversed = await analyzeFiles([second, first], options);
    assert.deepEqual(reversed.clones, report.clones);
    assert.deepEqual(reversed.findings, report.findings);
    const sarif = JSON.parse(formatReport(report, 'sarif'));
    assert.equal(
      sarif.runs[0].results[0].locations[0].physicalLocation.region.startColumn,
      14
    );
    assert.deepEqual(
      sarif.runs[0].results[0].relatedLocations[0].physicalLocation.region,
      { startLine: 2, startColumn: 15, endLine: 6, endColumn: 2 }
    );
  });

  it('respects minimum boundaries and preserves the default report method', async () => {
    const plain = await analyzeFiles([first, second]);
    const disabled = await analyzeFiles([first, second], {
      config: { clones: false },
    });
    assert.deepEqual(disabled, plain);
    assert.equal(Object.hasOwn(plain, 'clones'), false);
    const exact = await analyzeFiles([first, second], {
      config: { ...options.config, clones: { minTokens: 22 } },
    });
    assert.equal(exact.clones.length, 1);
    const above = await analyzeFiles([first, second], {
      config: { ...options.config, clones: { minTokens: 23 } },
    });
    assert.deepEqual(above.clones, []);
    assert.notEqual(exact.method, above.method);
    assert.equal(checkBaseline(above, createBaseline(exact)).passed, false);
  });

  it('ignores comments and formatting while retaining significant literal text', async () => {
    const a = { path: 'a.js', content: 'consume("one two", value + 2);\n' };
    const b = {
      path: 'b.js',
      content:
        '// original comment\nconsume( "one two", /* note */ value+2 );\n',
    };
    const report = await analyzeFiles([a, b], {
      config: { clones: { minTokens: 9 } },
    });
    assert.equal(report.clones.length, 1);
    assert.equal(report.clones[0].tokens, 9);
    const changed = await analyzeFiles(
      [a, { ...b, content: b.content.replace('one two', 'one  two') }],
      { config: { clones: { minTokens: 9 } } }
    );
    assert.deepEqual(changed.clones, []);
  });

  it('keeps names and literals significant unless each normalization is explicit', async () => {
    const files = [
      { path: 'a.js', content: 'processValue(source + 2, "original");\n' },
      { path: 'b.js', content: 'processValue(other + 3, "different");\n' },
    ];
    for (const config of [
      {},
      { ignoreIdentifiers: true },
      { ignoreLiterals: true },
    ]) {
      const report = await analyzeFiles(files, {
        config: { clones: { minTokens: 9, ...config } },
      });
      assert.deepEqual(report.clones, []);
    }
    const normalized = await analyzeFiles(files, {
      config: {
        clones: { minTokens: 9, ignoreIdentifiers: true, ignoreLiterals: true },
      },
    });
    assert.equal(normalized.clones.length, 1);
    assert.equal(normalized.clones[0].tokens, 9);
    assert.ok(!JSON.stringify(normalized.clones).includes('original'));
  });

  it('does not erase interpolated expressions when literals are ignored', async () => {
    const files = [
      { path: 'a.py', content: 'emit(f"value {left + 2}")\n' },
      { path: 'b.py', content: 'emit(f"value {left - 2}")\n' },
    ];
    const report = await analyzeFiles(files, {
      config: { clones: { minTokens: 8, ignoreLiterals: true } },
    });
    assert.deepEqual(report.clones, []);
  });

  it('finds nonoverlapping repeats inside a function and keeps file boundaries', async () => {
    const report = await analyzeFiles(
      [
        {
          path: 'local.js',
          content:
            'function run(value) {\nconsume(value + 2);\nconsume(value + 2);\n}\n',
        },
      ],
      { config: { clones: { minTokens: 7 } } }
    );
    assert.equal(report.clones.length, 1);
    assert.equal(report.clones[0].tokens, 7);
    assert.ok(report.clones[0].first.end <= report.clones[0].second.start);
    const split = await analyzeFiles(
      [
        { path: 'x.js', content: 'left(1);\n' },
        { path: 'y.js', content: 'right(2);\n' },
      ],
      { config: { clones: { minTokens: 6 } } }
    );
    assert.deepEqual(split.clones, []);
  });
});

describe('token clone language domains and refusals', () => {
  it('keeps baseline findings stable when comments move both occurrences', async () => {
    const original = await analyzeFiles([first, second], options);
    const moved = await analyzeFiles(
      [first, second].map((file) => ({
        ...file,
        content: `// original comment\n${file.content}`,
      })),
      options
    );
    assert.notEqual(original.clones[0].first.line, moved.clones[0].first.line);
    assert.deepEqual(
      original.findings.map((x) => x.fingerprint),
      moved.findings.map((x) => x.fingerprint)
    );
    assert.equal(checkBaseline(moved, createBaseline(original)).passed, true);
  });
  it('rejects replacement blocks with equal token counts against an existing baseline', async () => {
    const original = await analyzeFiles([first, second], options);
    const changed = await analyzeFiles(
      [first, second].map((file) => ({
        ...file,
        content: file.content.replace('input + 2', 'input - 2'),
      })),
      options
    );
    assert.equal(changed.clones[0].tokens, original.clones[0].tokens);
    assert.equal(
      checkBaseline(changed, createBaseline(original)).passed,
      false
    );
  });
  it('retains shifted maximal pairs when extending them would overlap', async () => {
    const report = await analyzeFiles(
      [{ path: 'repeat.js', content: 'tick(value);\n'.repeat(3) }],
      { config: { clones: { minTokens: 5 } } }
    );
    assert.equal(report.clones.length, 7);
    assert.ok(
      report.clones.some(
        (clone) =>
          clone.first.start === 4 &&
          clone.second.start === 17 &&
          clone.tokens === 5
      )
    );
    assert.ok(
      report.clones.every((clone) => clone.first.end <= clone.second.start)
    );
  });
  for (const [language, fixture] of Object.entries(qualityFixtures)) {
    it(`${language}: compares independent files without crossing language domains`, async () => {
      const files = [fixture, { ...fixture, path: `copy/${fixture.path}` }];
      const report = await analyzeFiles(files, {
        config: { clones: { minTokens: 5 } },
      });
      assert.equal(report.incomplete, false);
      assert.equal(report.clones.length, 1);
      assert.equal(report.clones[0].language, language);
    });
  }

  it('refuses unresolved CMake definitions and invalid syntax as incomplete evidence', async () => {
    const cmake = await analyzeFiles(
      [
        {
          path: 'dynamic.cmake',
          content: 'function(${name} input)\nendfunction()\n',
        },
      ],
      { config: { clones: { minTokens: 5 } } }
    );
    assert.equal(cmake.incomplete, true);
    assert.throws(() => createBaseline(cmake), /Incomplete/);
    assert.ok(cmake.findings.some((x) => x.ruleId === 'unsupported-analysis'));
    const invalid = await analyzeFiles(
      [{ path: 'bad.js', content: 'function {' }],
      options
    );
    assert.equal(invalid.incomplete, true);
    assert.deepEqual(invalid.clones, []);
    const mixed = await analyzeFiles(
      [
        { path: 'x.js', content: 'compute(value + 1);\n' },
        { path: 'x.ts', content: 'compute(value + 1);\n' },
      ],
      { config: { clones: { minTokens: 5 } } }
    );
    assert.deepEqual(mixed.clones, []);
  });

  it('rejects malformed options and bounds a finite repetitive candidate probe', async () => {
    for (const clones of [
      true,
      [],
      { minTokens: 0 },
      { minTokens: 1001 },
      { ignoreIdentifiers: 1 },
      { ignoreLiterals: 'yes' },
      { unknown: true },
    ]) {
      await assert.rejects(
        analyzeFiles([first], { config: { clones } }),
        /clones|clone/i
      );
    }
    // 900 statements / 4,500 tokens; finite budgets stop quadratic work.
    const content = 'tick(value);\n'.repeat(900);
    await assert.rejects(
      analyzeFiles([{ path: 'repeat.js', content }], {
        config: { clones: { minTokens: 5 } },
      }),
      /Clone (candidate|comparison|result) budget/
    );
  });
});
