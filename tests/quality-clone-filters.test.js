import { describe, it } from 'test-anywhere';
import assert from 'node:assert/strict';
import {
  analyzeFiles,
  createBaseline,
  checkBaseline,
} from '../src/quality/index.js';
import { withSyntax } from '../src/quality/syntax.js';
import { cloneContext, collectCloneTokens } from '../src/quality/clones.js';

const options = (extra = {}) => ({
  config: {
    clones: { minTokens: 17, ...extra },
    rules: { 'duplicate-function': false },
  },
});
const files = (extension, first, second = first) => [
  { path: `a.${extension}`, content: first },
  { path: `b.${extension}`, content: second },
];
const java = (name) =>
  `@acme.Trace(value = {"${name}", "audit"}) class Sample {\n  @${name} int read(@Named("${name}") int value) { return value + 2; }\n}\n`;
const csharp = (name) =>
  `[assembly: Origin("${name}")]\n[${name}(Name = "audit")] class Sample {\n  [return: ${name}] int Read([Named("${name}")] int value) { return value + 2; }\n}\n`;

describe('optional annotation clone filters', () => {
  for (const [extension, fixture] of [
    ['java', java],
    ['cs', csharp],
  ]) {
    it(`${extension}: omits whole annotations while preserving exact retained ranges and thresholds`, async () => {
      const input = files(extension, fixture('First'), fixture('Second'));
      const exact = await analyzeFiles(input, options());
      assert.equal(exact.incomplete, false);
      assert.deepEqual(exact.clones, []);
      const filtered = await analyzeFiles(
        input,
        options({ ignoreAnnotations: true })
      );
      assert.equal(filtered.incomplete, false);
      assert.equal(filtered.clones.length, 1);
      assert.equal(filtered.clones[0].tokens, 17);
      assert.equal(filtered.cloneGroups[0].occurrences.length, 2);
      for (const [index, key] of ['first', 'second'].entries()) {
        const location = filtered.clones[0][key];
        assert.equal(location.start, input[index].content.indexOf('class'));
        assert.equal(location.end, input[index].content.lastIndexOf('}') + 1);
        assert.equal(location.line, extension === 'java' ? 1 : 2);
        assert.equal(location.endLine, extension === 'java' ? 3 : 4);
      }
      const above = await analyzeFiles(
        input,
        options({ ignoreAnnotations: true, minTokens: 18 })
      );
      assert.deepEqual(above.clones, []);
      const reversed = await analyzeFiles(
        [...input].reverse(),
        options({ ignoreAnnotations: true })
      );
      assert.deepEqual(reversed.cloneGroups, filtered.cloneGroups);
      assert.deepEqual(reversed.findings, filtered.findings);
    });
  }

  it('preserves annotation type declarations and ordinary C# bracket expressions', async () => {
    for (const [extension, content, tokens] of [
      ['java', '@interface Flag { String value(); }\n', 9],
      [
        'cs',
        'class Sample { int Read(int[] values) { return values[0]; } }\n',
        20,
      ],
    ]) {
      const input = files(extension, content);
      const plain = await analyzeFiles(input, options({ minTokens: 1 }));
      const filtered = await analyzeFiles(
        input,
        options({ minTokens: 1, ignoreAnnotations: true })
      );
      assert.equal(filtered.incomplete, false);
      assert.equal(
        Math.max(...filtered.clones.map((clone) => clone.tokens)),
        tokens
      );
      assert.deepEqual(filtered.clones, plain.clones);
    }
  });

  it('keeps body names and literals significant unless separately normalized', async () => {
    const input = files(
      'java',
      java('First'),
      java('Second').replace('value + 2', 'other + 3')
    );
    const filtered = await analyzeFiles(
      input,
      options({ ignoreAnnotations: true })
    );
    assert.deepEqual(filtered.clones, []);
    const normalized = await analyzeFiles(
      input,
      options({
        ignoreAnnotations: true,
        ignoreIdentifiers: true,
        ignoreLiterals: true,
      })
    );
    assert.equal(normalized.clones[0].tokens, 17);
  });

  it('normalizes each Java numeric family while preserving distinct token kinds', async () => {
    const source = (value) =>
      `class Sample { double read(double value) { return value + ${value}; } }\n`;
    for (const [first, second] of [
      ['2', '3'],
      ['0x2', '0x3'],
      ['02', '03'],
      ['0b10', '0b11'],
      ['2.0', '3.5'],
      ['0x1.0p1', '0x1.8p1'],
    ]) {
      const input = files('java', source(first), source(second));
      const exact = await analyzeFiles(input, options());
      assert.deepEqual(exact.clones, []);
      const normalized = await analyzeFiles(
        input,
        options({ ignoreLiterals: true })
      );
      assert.equal(normalized.incomplete, false);
      assert.equal(normalized.clones[0].tokens, 17, `${first} / ${second}`);
      assert.notEqual(normalized.method, exact.method);
    }
    const differentKinds = await analyzeFiles(
      files('java', source('2'), source('2.0')),
      options({ ignoreLiterals: true })
    );
    assert.deepEqual(differentKinds.clones, []);
  });

  it('still processes suppression markers inside ignored annotation arguments', async () => {
    const content =
      '@Trace(/* CPD-OFF */ "audit" /* CPD-ON */) class Sample { int read(int value) { return value + 2; } }\n';
    const report = await analyzeFiles(
      files('java', content),
      options({ ignoreAnnotations: true, suppressionComments: true })
    );
    assert.equal(report.cloneSuppressions.length, 2);
    assert.equal(report.clones[0].tokens, 17);
    await assert.rejects(
      analyzeFiles(
        files('java', content.replace('CPD-ON', 'done')),
        options({ ignoreAnnotations: true, suppressionComments: true })
      ),
      /unterminated clone suppression/
    );
  });
});

describe('optional C# using-directive clone filter', () => {
  it('omits namespace, alias and static directives with exact retained ranges', async () => {
    const source = (name) =>
      `using ${name}.Text;\nusing Alias = ${name}.Text.Builder;\nusing static ${name}.Math;\nclass Sample { int Read(int value) { return value + 2; } }\n`;
    const input = files('cs', source('First'), source('Second'));
    const exact = await analyzeFiles(input, options());
    assert.ok(exact.clones[0].tokens > 17);
    const filtered = await analyzeFiles(input, options({ ignoreUsings: true }));
    assert.equal(filtered.clones.length, 1);
    assert.equal(filtered.clones[0].tokens, 17);
    assert.equal(filtered.clones[0].first.line, 4);
    assert.equal(
      filtered.clones[0].first.start,
      input[0].content.indexOf('class')
    );
    assert.equal(
      filtered.clones[0].first.end,
      input[0].content.lastIndexOf('}') + 1
    );
  });

  it('omits directives between declarations without treating them as comment regions', async () => {
    const source = (name) =>
      `namespace Outer { class First {} namespace Inner { using ${name}; class Second {} } }\n`;
    const report = await analyzeFiles(
      files('cs', source('One'), source('Two')),
      options({ minTokens: 16, ignoreUsings: true })
    );
    assert.equal(report.incomplete, false);
    assert.equal(report.clones.length, 1);
    assert.equal(report.clones[0].tokens, 16);
    assert.equal(report.clones[0].first.start, 0);
    assert.equal(report.clones[0].first.end, source('One').length - 1);
  });

  it('preserves using statements and local using declarations', async () => {
    for (const statement of [
      'using (var resource = Open()) { return value; }',
      'using var resource = Open(); return value;',
    ]) {
      const content = `class Sample { int Read(int value) { ${statement} } }\n`;
      const input = files('cs', content);
      const plain = await analyzeFiles(input, options());
      const filtered = await analyzeFiles(
        input,
        options({ ignoreUsings: true })
      );
      assert.equal(filtered.incomplete, false);
      assert.ok(filtered.clones.length);
      assert.deepEqual(filtered.clones, plain.clones);
    }
  });

  it('can combine directive and attribute filters without leaving delimiters', async () => {
    const source = (name) => `using ${name};\n${csharp(name)}`;
    const report = await analyzeFiles(
      files('cs', source('First'), source('Second')),
      options({ ignoreUsings: true, ignoreAnnotations: true })
    );
    assert.equal(report.incomplete, false);
    assert.equal(report.clones.length, 1);
    assert.equal(report.clones[0].tokens, 17);
  });
});

describe('clone filter contracts and refusal budgets', () => {
  it('preserves disabled reports and methods and versions each enabled policy', async () => {
    const input = files('java', java('First'));
    const plain = await analyzeFiles(input, options());
    const disabled = await analyzeFiles(
      input,
      options({ ignoreAnnotations: false, ignoreUsings: false })
    );
    assert.deepEqual(disabled, plain);
    for (const key of ['ignoreAnnotations', 'ignoreUsings']) {
      const enabled = await analyzeFiles(input, options({ [key]: true }));
      assert.notEqual(enabled.method, plain.method);
      assert.equal(checkBaseline(enabled, createBaseline(plain)).passed, false);
      for (const value of [null, 1, 'true']) {
        await assert.rejects(
          analyzeFiles(input, options({ [key]: value })),
          new RegExp(`${key}.*boolean`)
        );
      }
    }
  });

  for (const [extension, content] of [
    ['js', 'const usingValue = "@Named";\n'],
    ['ts', 'const usingValue: string = "@Named";\n'],
    ['py', '@decorator\ndef read(value):\n    return value + 2\n'],
    ['cpp', 'using Alias = int;\nint read(int value) { return value + 2; }\n'],
  ]) {
    it(`${extension}: preserves token behavior outside the selected language constructs`, async () => {
      const input = files(extension, content);
      const plain = await analyzeFiles(input, options({ minTokens: 5 }));
      const filtered = await analyzeFiles(
        input,
        options({ minTokens: 5, ignoreAnnotations: true, ignoreUsings: true })
      );
      assert.equal(filtered.incomplete, false);
      assert.deepEqual(filtered.clones, plain.clones);
    });
  }

  it('keeps syntax and custom rules active inside filtered constructs', async () => {
    for (const [extension, content, kind] of [
      ['java', java('First'), 'annotation'],
      ['cs', 'using First;\nclass Sample {}\n', 'using_directive'],
    ]) {
      const selected = options({ ignoreAnnotations: true, ignoreUsings: true });
      selected.config.customRules = [
        {
          id: 'review-metadata',
          message: 'Review metadata',
          pattern: { kind },
        },
      ];
      const report = await analyzeFiles(files(extension, content), selected);
      assert.ok(
        report.findings.some(({ ruleId }) => ruleId === 'review-metadata')
      );
      const invalid = await analyzeFiles(
        files(
          extension,
          extension === 'java'
            ? '@Trace( class Sample {}\n'
            : 'using = ;\nclass Sample {}\n'
        ),
        selected
      );
      assert.equal(invalid.incomplete, true);
      assert.throws(() => createBaseline(invalid), /Incomplete/);
    }
  });

  it('charges omitted syntax tokens to the shared work budget', async () => {
    for (const [language, content, settings] of [
      ['java', java('First'), { ignoreAnnotations: true }],
      ['csharp', csharp('First'), { ignoreAnnotations: true }],
      ['csharp', 'using First;\nclass Sample {}\n', { ignoreUsings: true }],
    ]) {
      const context = cloneContext();
      context.count = 100_000;
      await assert.rejects(
        withSyntax(language, content, ({ root }) =>
          collectCloneTokens(
            root,
            { path: language, language, content },
            options(settings).config.clones,
            context
          )
        ),
        /Clone token count budget exceeded/
      );
    }
  });
});
