import { describe, it } from 'test-anywhere';
import assert from 'node:assert/strict';
import {
  analyzeFiles,
  formatReport,
  createBaseline,
  checkBaseline,
} from '../src/quality/index.js';

const model = {
  id: 'local/flow',
  message: 'Untrusted command',
  languages: ['javascript', 'typescript', 'tsx'],
  sources: ['input.read'],
  sinks: [{ call: 'execute', argument: 0 }],
  sanitizers: ['clean'],
  propagators: ['decorate'],
};
const config = { taintRules: [model] };
const analyze = (content, language = 'javascript', settings = config) =>
  analyzeFiles(
    [
      {
        path: `original.${language === 'javascript' ? 'js' : language === 'typescript' ? 'ts' : 'tsx'}`,
        content: `${content}\n`,
      },
    ],
    { config: settings }
  );
const flows = (report) =>
  report.findings.filter((entry) => entry.ruleId === model.id);

describe('native straight-line taint traces', () => {
  for (const language of ['javascript', 'typescript', 'tsx']) {
    it(`${language}: traces original call returns through assignments and operators`, async () => {
      const report = await analyze(
        'const raw = input.read();\nconst copy = decorate("run:" + raw);\nexecute(copy);',
        language
      );
      assert.equal(report.incomplete, false);
      const [entry] = flows(report);
      assert.equal(flows(report).length, 1);
      assert.equal(entry.line, 3);
      assert.equal(entry.severity, 'error');
      assert.deepEqual(
        entry.dataFlow.map(({ kind, name }) => [kind, name]),
        [
          ['source', 'input.read'],
          ['assignment', 'raw'],
          ['propagator', 'decorate'],
          ['assignment', 'copy'],
          ['sink', 'execute'],
        ]
      );
      for (const location of entry.dataFlow) {
        const source = report.files[0];
        assert.equal(location.path, source.path);
        assert.ok(location.start < location.end);
        assert.ok(location.line > 0 && location.column > 0);
      }
      assert.equal(report.passed, false);
    });
  }
  it('keeps source calls exact and evaluates nested sink arguments before sanitization', async () => {
    const report = await analyze(
      'clean(execute(input.read()));\nconst x = input.read();\nclean(x);\nexecute(x);'
    );
    assert.equal(flows(report).length, 2);
    assert.deepEqual(
      flows(report).map(({ line }) => line),
      [1, 4]
    );
    assert.equal((await analyze('execute(clean(input.read()));')).passed, true);
    assert.equal((await analyze('input.read(execute("safe"));')).passed, true);
  });
  it('removes overwritten taint while preserving previously copied values', async () => {
    const report = await analyze(
      'let raw = input.read();\nconst copy = raw;\nraw = "safe";\nexecute(raw);\nexecute(copy);'
    );
    assert.equal(report.incomplete, false);
    assert.deepEqual(
      flows(report).map(({ line }) => line),
      [5]
    );
    assert.equal(
      (await analyze('let raw = input.read(); raw = clean(raw); execute(raw);'))
        .passed,
      true
    );
  });
  it('retains distinct origins and exact sink argument models', async () => {
    const report = await analyze(
      'const first = input.read();\nconst second = input.read();\nexecute(first + second);'
    );
    assert.equal(flows(report).length, 2);
    assert.deepEqual(
      flows(report).map(({ dataFlow }) => dataFlow[0].line),
      [1, 2]
    );
    const secondArgument = {
      taintRules: [{ ...model, sinks: [{ call: 'execute', argument: 1 }] }],
    };
    assert.equal(
      (
        await analyze(
          'execute(input.read(), "safe");',
          'javascript',
          secondArgument
        )
      ).passed,
      true
    );
    assert.equal(
      flows(
        await analyze(
          'execute("safe", input.read());',
          'javascript',
          secondArgument
        )
      ).length,
      1
    );
  });
  it('retains assignment-expression steps and evaluates void arguments', async () => {
    const report = await analyze('let raw; execute(raw = input.read());');
    assert.equal(report.incomplete, false);
    assert.deepEqual(
      flows(report)[0].dataFlow.map(({ kind }) => kind),
      ['source', 'assignment', 'sink']
    );
    assert.equal((await analyze('execute(void input.read());')).passed, true);
    assert.equal(flows(await analyze('void execute(input.read());')).length, 1);
  });
  it('supports parameter-only sources and conservative sink returns', async () => {
    const settings = { taintRules: [{ ...model, sources: [] }] };
    const report = await analyze(
      'function route(value) { execute(execute(value)); }',
      'javascript',
      settings
    );
    assert.equal(report.incomplete, false);
    assert.equal(flows(report).length, 2);
    assert.equal(flows(report)[0].dataFlow[0].kind, 'parameter');
    assert.equal((await analyze('execute();')).passed, true);
  });
  it('propagates template substitutions and retains UTF-16 ranges', async () => {
    const content =
      'const emoji = "🪴"; const text = `prefix:${input.read()}`; execute(text);\n';
    const report = await analyzeFiles([{ path: 'unicode.js', content }], {
      config,
    });
    const trace = flows(report)[0].dataFlow;
    assert.equal(content.slice(trace[0].start, trace[0].end), 'input.read()');
    assert.equal(trace[0].column, content.indexOf('input.read()') + 1);
    assert.equal(
      content.slice(trace.at(-1).start, trace.at(-1).end),
      'execute(text)'
    );
  });
});

describe('isolated straight-line function scopes', () => {
  for (const language of ['javascript', 'typescript', 'tsx']) {
    it(`${language}: treats simple parameters as sources without leaking bindings between functions`, async () => {
      const parameter = language === 'javascript' ? 'value' : 'value: string';
      const report = await analyze(
        `export function unsafe(${parameter}) { const copy = value; execute(copy); }\nfunction safe() { const copy = "safe"; execute(copy); }`,
        language
      );
      assert.equal(report.incomplete, false);
      assert.equal(flows(report).length, 1);
      assert.equal(flows(report)[0].dataFlow[0].kind, 'parameter');
      assert.equal(flows(report)[0].dataFlow[0].name, 'value');
    });
  }
  it('erases type assertions without treating them as sanitizers', async () => {
    const report = await analyze(
      'export function route(value: string): void { const copy = value as string; execute(copy!); }',
      'typescript'
    );
    assert.equal(report.incomplete, false);
    assert.equal(flows(report).length, 1);
  });
  it('stops at return and refuses captured outer bindings and nested functions', async () => {
    const early = await analyze(
      'function route() { return "safe"; execute(input.read()); }'
    );
    assert.equal(early.incomplete, false);
    assert.equal(flows(early).length, 0);
    for (const content of [
      'const captured = input.read(); function route() { execute(captured); }',
      'function outer() { function inner() { execute(input.read()); } }',
      'function a() { const item = input.read(); } function b() { execute(item); }',
    ]) {
      const report = await analyze(content);
      assert.equal(report.incomplete, true);
      assert.equal(flows(report).length, 0);
    }
  });
});

describe('taint refusals, methods and evidence', () => {
  it('marks unsupported flow incomplete and discards partial paths', async () => {
    for (const content of [
      'execute(input.read()); if (true) execute("safe");',
      'while (false) execute(input.read());',
      'const raw = unknown(); execute(raw);',
      'const raw = input["read"](); execute(raw);',
      'execute?.(input.read());',
      'input?.read();',
      'const raw = input.read; execute(raw);',
      'const {raw} = input.read(); execute(raw);',
      'const raw = true && input.read(); execute(raw);',
      'const raw = () => input.read(); execute(raw());',
      'async function route() { execute(input.read()); }',
      'function route(value = input.read()) { execute(value); }',
      'let clean = "shadow"; execute(clean(input.read()));',
      'function route(input) { execute(input.read()); }',
      'execute(...input.read());',
      'missing = input.read();',
      'const raw = input.read(); raw = "safe"; execute(raw);',
      'function route() { execute(input.read()); return; var input; }',
      'function route() { execute(input.read()); return; const execute = "shadow"; }',
      'function route() { execute(input.read()); return; if (false) { var input; } }',
      'function route() { return; function clean() {} }',
      'execute(input.read()); function clean() {}',
      'let \\u0063lean = input.read(); execute(clean(input.read()));',
      'function route() { execute(clean(input.read())); return; var \\u0063lean; }',
    ]) {
      const report = await analyze(content);
      assert.equal(report.incomplete, true, content);
      assert.equal(flows(report).length, 0, content);
      assert.match(
        report.findings.find((entry) => entry.ruleId === 'unsupported-analysis')
          .message,
        /local\/flow: Taint analysis:/
      );
      assert.equal(report.passed, false);
      assert.throws(() => createBaseline(report), /Incomplete/);
    }
  });
  it('bounds depth, trace length, source unions, bindings and shared work', async () => {
    const probes = [
      `execute(${'('.repeat(140)}input.read()${')'.repeat(140)});`,
      `let raw = input.read(); ${'raw = decorate(raw);'.repeat(70)} execute(raw);`,
      `execute(${Array.from({ length: 65 }, () => 'input.read()').join(' + ')});`,
      Array.from(
        { length: 513 },
        (_, index) => `let item${index} = "safe";`
      ).join('\n'),
    ];
    for (const content of probes) {
      const report = await analyze(content);
      assert.equal(report.incomplete, true);
      assert.match(
        report.findings.find((entry) => entry.ruleId === 'unsupported-analysis')
          .message,
        /budget|exceeds/
      );
    }
    const manyRules = {
      taintRules: Array.from({ length: 10 }, (_, index) => ({
        ...model,
        id: `local/flow${index}`,
      })),
    };
    const report = await analyze(
      `let raw = "safe"; ${'raw = input.read();'.repeat(2500)}`,
      'javascript',
      manyRules
    );
    assert.equal(report.incomplete, true);
    assert.match(
      report.findings.find((entry) => entry.ruleId === 'unsupported-analysis')
        .message,
      /work or depth budget/
    );
  });
  it('keeps default methods and versions enabled models for baseline incompatibility', async () => {
    const source = 'execute("safe");';
    const baseline = await analyze(source, 'javascript', {});
    const disabled = await analyze(source, 'javascript', { taintRules: [] });
    assert.equal(baseline.method, disabled.method);
    const enabled = await analyze(source);
    assert.notEqual(enabled.method, baseline.method);
    assert.equal(
      checkBaseline(enabled, createBaseline(baseline)).passed,
      false
    );
    const changed = await analyze(source, 'javascript', {
      taintRules: [{ ...model, sources: ['reader'] }],
    });
    assert.notEqual(enabled.method, changed.method);
    const python = await analyzeFiles(
      [{ path: 'safe.py', content: 'print("safe")\n' }],
      { config }
    );
    assert.equal(python.incomplete, false);
    assert.equal(python.passed, true);
  });
  it('exports ordered native traces to text and SARIF codeFlows', async () => {
    const report = await analyze('const raw = input.read();\nexecute(raw);');
    const text = formatReport(report);
    assert.match(text, /source input.read at original.js:1/);
    assert.match(text, /sink execute at original.js:2/);
    const [result] = JSON.parse(formatReport(report, 'sarif')).runs[0].results;
    const locations = result.codeFlows[0].threadFlows[0].locations;
    assert.deepEqual(
      locations.map(({ executionOrder }) => executionOrder),
      [1, 2, 3]
    );
    assert.equal(locations[0].location.physicalLocation.region.startLine, 1);
    assert.equal(
      locations.at(-1).location.physicalLocation.region.startLine,
      2
    );
    assert.equal(locations[0].location.message.text, 'source: input.read');
  });
});

describe('taint configuration validation', () => {
  it('rejects malformed, ambiguous and unsupported models before analysis', async () => {
    const invalid = [
      null,
      {},
      Array.from({ length: 26 }, () => model),
      [{ ...model, id: 'syntax' }],
      [{ ...model, id: 'bad id' }],
      [model, model],
      [{ ...model, message: '' }],
      [{ ...model, severity: 'critical' }],
      [{ ...model, languages: [] }],
      [{ ...model, languages: ['python'] }],
      [{ ...model, sources: ['input.*'] }],
      [{ ...model, sources: ['input.read', 'input.read'] }],
      [{ ...model, sinks: [] }],
      [{ ...model, sinks: [{ call: 'execute', argument: -1 }] }],
      [{ ...model, sinks: [{ call: 'execute', argument: 0, exact: true }] }],
      [{ ...model, sources: ['clean'] }],
      [{ ...model, sanitizers: ['execute'] }],
      [{ ...model, interfile: true }],
    ];
    for (const taintRules of invalid) {
      await assert.rejects(
        analyze('execute("safe");', 'javascript', { taintRules }),
        /taint|Taint/
      );
    }
    await assert.rejects(
      analyze('execute("safe");', 'javascript', {
        customRules: [
          {
            id: model.id,
            message: 'Other rule',
            pattern: { kind: 'call_expression' },
          },
        ],
        taintRules: [model],
      }),
      /unique id/
    );
  });
});
