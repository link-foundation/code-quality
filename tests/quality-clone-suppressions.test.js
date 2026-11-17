import { describe, it } from 'test-anywhere';
import assert from 'node:assert/strict';
import {
  analyzeFiles,
  createBaseline,
  checkBaseline,
  formatReport,
} from '../src/quality/index.js';
import { runProcess } from '../src/quality/process.js';
import { qualityFixtures } from './fixtures/quality-languages.js';
import { withSyntax } from '../src/quality/syntax.js';
import {
  cloneContext,
  collectCloneTokens,
  collectCmakeCloneTokens,
} from '../src/quality/clones.js';

const config = (extra = {}) => ({
  clones: { minTokens: 5, suppressionComments: true, ...extra },
  rules: { 'duplicate-function': false },
});
const pair = (content) => ['a.js', 'b.js'].map((path) => ({ path, content }));

describe('native comment suppression contracts', () => {
  it('requires explicit opt-in and preserves disabled reports and methods', async () => {
    const files = pair('// CPD-OFF\nemit(value + 2);\n// CPD-ON\n');
    const plain = await analyzeFiles(files, {
      config: { clones: { minTokens: 5 } },
    });
    const disabled = await analyzeFiles(files, {
      config: { clones: { minTokens: 5, suppressionComments: false } },
    });
    assert.deepEqual(disabled, plain);
    assert.equal(plain.clones.length, 1);
    assert.equal(Object.hasOwn(plain, 'cloneSuppressions'), false);
    const suppressed = await analyzeFiles(files, { config: config() });
    assert.equal(suppressed.passed, true);
    assert.deepEqual(suppressed.clones, []);
    assert.notEqual(suppressed.method, plain.method);
    assert.equal(
      checkBaseline(suppressed, createBaseline(plain)).passed,
      false
    );
    for (const suppressionComments of [1, 'true', null]) {
      await assert.rejects(
        analyzeFiles(files, { config: config({ suppressionComments }) }),
        /suppressionComments.*boolean/
      );
    }
  });

  it('records exact regions in JSON, text and SARIF without storing source text', async () => {
    const content = '// CPD-OFF\nemit(value + 2);\n// CPD-ON\n';
    const report = await analyzeFiles(pair(content), { config: config() });
    assert.deepEqual(report.cloneSuppressions[0], {
      path: 'a.js',
      start: 10,
      end: 31,
      line: 1,
      column: 11,
      endLine: 3,
      endColumn: 4,
    });
    assert.equal(report.cloneSuppressions.length, 2);
    assert.equal(
      JSON.stringify(report.cloneSuppressions).includes('emit'),
      false
    );
    assert.deepEqual(
      JSON.parse(formatReport(report, 'json')).cloneSuppressions,
      report.cloneSuppressions
    );
    assert.match(formatReport(report), /2 clone suppression regions/);
    assert.deepEqual(
      JSON.parse(formatReport(report, 'sarif')).runs[0].properties
        .cloneSuppressions,
      report.cloneSuppressions
    );
    const reversed = await analyzeFiles(pair(content).reverse(), {
      config: config(),
    });
    assert.deepEqual(reversed.cloneSuppressions, report.cloneSuppressions);
  });

  it('keeps match boundaries around excluded regions', async () => {
    const report = await analyzeFiles(
      [
        {
          path: 'a.js',
          content: 'left();\n// CPD-OFF\nhidden();\n// CPD-ON\nright();\n',
        },
        { path: 'b.js', content: 'left();\nright();\n' },
      ],
      { config: config({ minTokens: 8 }) }
    );
    assert.deepEqual(report.clones, []);
    assert.equal(report.cloneSuppressions.length, 1);
    const local = await analyzeFiles(
      [
        {
          path: 'local.js',
          content: 'emit();\n/* CPD-OFF */ hidden(); /* CPD-ON */\nemit();\n',
        },
      ],
      { config: config({ minTokens: 4 }) }
    );
    assert.equal(local.clones.length, 1);
    assert.ok(local.clones[0].first.end <= local.clones[0].second.start);
    assert.equal(local.clones[0].tokens, 4);
  });

  it('reads marker words only in actual comments and supports paired markers in one comment', async () => {
    const report = await analyzeFiles(
      pair('const text = "CPD-OFF";\n// XCPD-OFFSET cpd-off\nemit(value);\n'),
      { config: config() }
    );
    assert.equal(report.clones.length, 1);
    assert.deepEqual(report.cloneSuppressions, []);
    const same = await analyzeFiles(
      pair('/* CPD-OFF CPD-ON */\nemit(value);\n'),
      { config: config() }
    );
    assert.equal(same.clones.length, 1);
    assert.equal(same.cloneSuppressions.length, 2);
    assert.ok(
      same.cloneSuppressions.every((region) => region.end >= region.start)
    );
  });
});

describe('comment token kinds and work limits', () => {
  it('distinguishes CMake arguments and Rust strings from bracket/nested comments', async () => {
    for (const [path, literal, suppressed] of [
      [
        'a.cmake',
        'message("CPD-OFF" [=[CPD-ON]=])\n',
        '#[=[CPD-OFF]=]\nmessage("hidden")\n#[[CPD-ON]]\n',
      ],
      [
        'a.rs',
        'fn main() { let text = r#"CPD-OFF CPD-ON"#; }\n',
        '/* outer /* CPD-OFF */ */\nfn main() {}\n/* CPD-ON */\n',
      ],
    ]) {
      const analyze = (content) =>
        analyzeFiles(
          [
            { path, content },
            { path: `copy/${path}`, content },
          ],
          { config: config({ minTokens: 4 }) }
        );
      const visible = await analyze(literal);
      assert.equal(visible.incomplete, false);
      assert.ok(visible.clones.length);
      assert.deepEqual(visible.cloneSuppressions, []);
      const hidden = await analyze(suppressed);
      assert.equal(hidden.incomplete, false);
      assert.deepEqual(hidden.clones, []);
      assert.equal(hidden.cloneSuppressions.length, 2);
    }
  });

  it('charges suppressed tokens to the shared token budget', async () => {
    for (const language of ['javascript', 'cmake']) {
      const content =
        language === 'cmake'
          ? '# CPD-OFF\nmessage(hidden)\n# CPD-ON\n'
          : '// CPD-OFF\nemit(hidden);\n// CPD-ON\n';
      const file = { path: language, content, language };
      const context = cloneContext();
      context.count = 100_000;
      await assert.rejects(
        withSyntax(
          language,
          content,
          (syntax) => {
            if (syntax.cmake) {
              collectCmakeCloneTokens(
                syntax.cmake,
                file,
                config().clones,
                context
              );
            } else {
              collectCloneTokens(syntax.root, file, config().clones, context);
            }
          },
          { tokens: true, comments: true }
        ),
        /Clone token count budget exceeded/
      );
    }
  });
});

describe('comment suppression language domains and refusals', () => {
  for (const [language, fixture] of Object.entries(qualityFixtures)) {
    it(`${language}: omits the selected region without suppressing syntax validation`, async () => {
      const comment = ['python', 'bash', 'cmake'].includes(language)
        ? '#'
        : '//';
      const wrap = (content) =>
        language === 'php'
          ? `${content.replace('<?php ', '<?php\n// CPD-OFF\n')}// CPD-ON\n`
          : `${comment} CPD-OFF\n${content}${comment} CPD-ON\n`;
      const files = [fixture, { ...fixture, path: `copy/${fixture.path}` }].map(
        (file) => ({ ...file, content: wrap(file.content) })
      );
      const report = await analyzeFiles(files, { config: config() });
      assert.equal(report.incomplete, false);
      assert.equal(report.passed, true);
      assert.deepEqual(report.clones, []);
      assert.equal(report.cloneSuppressions.length, 2);
      const invalid = await analyzeFiles(
        [{ ...fixture, content: wrap(fixture.invalid) }],
        { config: config() }
      );
      assert.equal(invalid.incomplete, true);
      assert.throws(() => createBaseline(invalid), /Incomplete/);
    });
  }

  it('refuses unmatched, nested and unterminated marker sequences', async () => {
    for (const content of [
      '// CPD-ON\nemit(value);\n',
      '// CPD-OFF\nemit(value);\n',
      '// CPD-OFF CPD-OFF CPD-ON\nemit(value);\n',
    ]) {
      await assert.rejects(
        analyzeFiles(pair(content), { config: config() }),
        /: (?:nested|unmatched|unterminated) clone suppression\b/
      );
    }
  });

  it('keeps structural rules active inside clone-suppressed regions', async () => {
    const report = await analyzeFiles(
      pair(
        '// CPD-OFF\nfunction same(value) {\n  const adjusted = value + 2;\n  return adjusted;\n}\n// CPD-ON\n'
      ),
      { config: { clones: config().clones } }
    );
    assert.deepEqual(report.clones, []);
    assert.ok(
      report.findings.some((finding) => finding.ruleId === 'duplicate-function')
    );
    assert.equal(report.passed, false);
  });

  it('preserves UTF-16 positions for multiline marker comments', async () => {
    const content =
      '\uFEFF/* 🦊 CPD-OFF\r\ncomment */\r\nemit(value);\r\n/* CPD-ON */\r\n';
    const report = await analyzeFiles(pair(content), { config: config() });
    const [region] = report.cloneSuppressions;
    assert.equal(region.start, content.indexOf('CPD-OFF') + 7);
    assert.equal(region.end, content.indexOf('CPD-ON'));
    assert.equal(region.line, 1);
    assert.equal(region.column, 15);
    assert.equal(region.endLine, 4);
    assert.equal(region.endColumn, 4);
  });

  it('bounds a finite marker inventory within a bounded process', async () => {
    const result = await runProcess('node', [
      '--max-old-space-size=128',
      '--stack-size=512',
      'experiments/code-quality/clone-suppression-budget.mjs',
    ]);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /10,002-marker probe/);
  });
});
