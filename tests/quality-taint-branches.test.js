import { describe, it } from 'test-anywhere';
import assert from 'node:assert/strict';
import { analyzeFiles, createBaseline, checkBaseline, formatReport } from '../src/quality/index.js';

const model = {
  id: 'local/branch-flow', message: 'Untrusted command',
  languages: ['javascript', 'typescript', 'tsx'],
  sources: ['input.read'], sinks: [{ call: 'execute', argument: 0 }],
  sanitizers: ['clean'], propagators: ['decorate'], controlFlow: 'branch-joins',
};
const config = { taintRules: [model] };
const analyze = (content, language = 'javascript', settings = config) => analyzeFiles([
  { path: `original.${language === 'javascript' ? 'js' : language === 'typescript' ? 'ts' : 'tsx'}`, content: `${content}\n` },
], { config: settings });
const flows = (report) => report.findings.filter(({ ruleId }) => ruleId === model.id);

describe('native conservative branch joins', () => {
  for (const language of model.languages) {
    it(`${language}: joins both possible arms without executing project code`, async () => {
      const report = await analyze('function route(flag) { let value = "safe"; if (flag) { value = input.read(); } else { value = "safe"; } execute(value); }', language);
      assert.equal(report.incomplete, false);
      assert.equal(flows(report).length, 1);
      assert.deepEqual(flows(report)[0].dataFlow.map(({kind, name}) => [kind, name]), [['source', 'input.read'], ['assignment', 'value'], ['sink', 'execute']]);
      assert.equal(report.passed, false);
    });
  }
  it('requires both continuing arms to sanitize and retains original copies', async () => {
    const prefix = 'function route(flag) { let value = input.read(); const copy = value; ';
    const clean = await analyze(`${prefix}if (flag) value = clean(value); else value = clean(value); execute(value); }`);
    assert.equal(clean.passed, true);
    const partial = await analyze(`${prefix}if (flag) value = clean(value); execute(value); }`);
    assert.equal(partial.incomplete, false);
    assert.equal(flows(partial).length, 1);
    const copied = await analyze(`${prefix}if (flag) value = clean(value); else value = clean(value); execute(copy); }`);
    assert.equal(flows(copied).length, 1);
  });
  it('retains distinct origins from opposite arms in deterministic order', async () => {
    const report = await analyze('let value; if (true) value = input.read(); else value = input.read(); execute(value);');
    assert.equal(report.incomplete, false);
    assert.equal(flows(report).length, 2);
    const offsets = flows(report).map(({dataFlow}) => dataFlow[0].start);
    assert.ok(offsets[0] < offsets[1]);
    assert.equal(new Set(offsets).size, 2);
  });
  it('evaluates condition side effects once before forking and retains nested sinks', async () => {
    const safe = await analyze('let value = input.read(); if (value = clean(value)) {} execute(value);');
    assert.equal(safe.passed, true);
    const report = await analyze('if (clean(execute(input.read()))) execute("safe");');
    assert.equal(report.incomplete, false);
    assert.equal(flows(report).length, 1);
  });
  it('joins only continuing arms after an early return', async () => {
    const safe = await analyze('function route(flag) { let value = input.read(); if (flag) return; else value = clean(value); execute(value); }');
    assert.equal(safe.passed, true);
    const unsafe = await analyze('function route(flag) { let value = input.read(); if (flag) { value = clean(value); return; } execute(value); }');
    assert.equal(unsafe.incomplete, false);
    assert.equal(flows(unsafe).length, 1);
    const ended = await analyze('function route(flag) { if (flag) { execute(input.read()); return; } else return; execute(input.read()); }');
    assert.equal(ended.incomplete, false);
    assert.equal(flows(ended).length, 1);
  });
  it('handles else-if and lexical block locals without leaking them', async () => {
    const report = await analyze('function route(flag) { let value = "safe"; if (flag) { const local = input.read(); value = local; } else if (flag) { const local = "safe"; value = local; } else { value = "safe"; } execute(value); }');
    assert.equal(report.incomplete, false);
    assert.equal(flows(report).length, 1);
    assert.equal((await analyze('let value = "safe"; { const local = input.read(); value = local; } execute(value);')).incomplete, false);
    const leaked = await analyze('if (true) { const local = input.read(); } execute(local);');
    assert.equal(leaked.incomplete, true);
    assert.equal(flows(leaked).length, 0);
  });
  it('joins ternary results and assignment effects without implicit control taint', async () => {
    assert.equal(flows(await analyze('execute(true ? input.read() : "safe");')).length, 1);
    assert.equal((await analyze('execute(input.read() ? "yes" : "no");')).passed, true);
    const report = await analyze('let value = input.read(); true ? value = clean(value) : value = clean(value); execute(value);');
    assert.equal(report.passed, true);
    const partial = await analyze('let value = input.read(); true ? value = clean(value) : "safe"; execute(value);');
    assert.equal(partial.incomplete, false);
    assert.equal(flows(partial).length, 1);
  });
  for (const operator of ['&&', '||', '??']) {
    it(`${operator}: retains the skipped arm and right-side effects conservatively`, async () => {
      const report = await analyze(`let value = "safe"; true ${operator} (value = input.read()); execute(value);`);
      assert.equal(report.incomplete, false);
      assert.equal(flows(report).length, 1);
      const unsafe = await analyze(`let value = input.read(); true ${operator} (value = clean(value)); execute(value);`);
      assert.equal(unsafe.incomplete, false);
      assert.equal(flows(unsafe).length, 1);
      assert.equal(flows(await analyze(`execute(input.read() ${operator} "safe");`)).length, 1);
      assert.equal(flows(await analyze(`true ${operator} execute(input.read());`)).length, 1);
    });
  }
  it('does not claim predicate feasibility or constant-branch pruning', async () => {
    const report = await analyze('if (false) execute(input.read());');
    assert.equal(report.incomplete, false);
    assert.equal(flows(report).length, 1);
    const correlated = await analyze('function route(flag) { let value = "safe"; if (flag) value = input.read(); if (flag) return; execute(value); }');
    assert.equal(flows(correlated).length, 1);
  });
});

describe('branch scope, budgets and method boundaries', () => {
  it('refuses unsupported, shadowed and hoisted scopes even after returns', async () => {
    for (const content of [
      'let value = input.read(); if (true) { var hidden = "safe"; } execute(value);',
      'if (true) { let clean = "shadow"; execute(clean(input.read())); }',
      'let value = input.read(); { let value = "shadow"; } execute(value);',
      'function route(flag) { if (flag) return; else return; { var input; } }',
      'function route(flag) { if (flag) return; else return; { const \\u0063lean = "shadow"; } }',
      'if (true) { function clean() {} }',
      'if (true) { while (false) execute(input.read()); }',
      'if (false) unknown();',
      'const value = input.read(); if (true) value = "safe";',
      'let value = true ? input.read() : unknown(); execute(value);',
    ]) {
      const report = await analyze(content);
      assert.equal(report.incomplete, true, content);
      assert.equal(report.passed, false, content);
      assert.equal(flows(report).length, 0, content);
      assert.throws(() => createBaseline(report), /Incomplete/);
    }
  });
  it('bounds nested and total branches and charges binding copies', async () => {
    for (const content of [
      `${'if (true) {'.repeat(34)} execute(input.read()); ${'}'.repeat(34)}`,
      'if (true) execute("safe");'.repeat(257),
      `let value = "safe"; execute(${ 'true ? "safe" : ('.repeat(34) }"safe"${')'.repeat(34)});`,
      `${Array.from({length: 400}, (_, index) => `let value${index} = "safe";`).join('')} ${'if (true) {}'.repeat(100)}`,
    ]) {
      const report = await analyze(content);
      assert.equal(report.incomplete, true);
      assert.equal(flows(report).length, 0);
      assert.match(report.findings.find(({ruleId}) => ruleId === 'unsupported-analysis').message, /budget/);
    }
  });
  it('preserves explicit/default straight-line methods and versions branch joins', async () => {
    const {controlFlow: ignored, ...straight} = model;
    void ignored;
    const defaultReport = await analyze('execute("safe");', 'javascript', {taintRules: [straight]});
    const explicit = await analyze('execute("safe");', 'javascript', {taintRules: [{...straight, controlFlow: 'straight-line'}]});
    const branches = await analyze('execute("safe");');
    assert.equal(defaultReport.method, explicit.method);
    assert.notEqual(branches.method, defaultReport.method);
    assert.equal(checkBaseline(branches, createBaseline(defaultReport)).passed, false);
    assert.equal((await analyze('if (true) execute(input.read());', 'javascript', {taintRules: [straight]})).incomplete, true);
    for (const controlFlow of [true, null, '', 'loops', 1]) {
      await assert.rejects(analyze('execute("safe");', 'javascript', {taintRules: [{...model, controlFlow}]}), /controlFlow/);
    }
  });
  it('keeps ordered text and SARIF source locations for joined evidence', async () => {
    const report = await analyze('let value; if (true) value = input.read(); else value = "safe"; execute(value);');
    const [flow] = flows(report);
    assert.match(formatReport(report, 'text'), /source input.read/);
    const sarif = JSON.parse(formatReport(report, 'sarif'));
    const entry = sarif.runs[0].results.find(({ruleId}) => ruleId === model.id);
    assert.equal(entry.codeFlows[0].threadFlows[0].locations.length, flow.dataFlow.length);
    for (const step of flow.dataFlow) assert.ok(step.start < step.end);
  });
});
