import { describe, it } from 'test-anywhere';
import assert from 'node:assert/strict';
import {
  analyzeFiles,
  analyzeSource,
  createBaseline,
  checkBaseline,
} from '../src/quality/index.js';
import { parseCmake } from '../src/quality/cmake.js';
import { cmakeFormalParameters } from './fixtures/quality-cmake.js';

describe('original CMake language contracts', () => {
  it('refuses invalid command separation, escapes and unnamed definitions', async () => {
    for (const content of [
      'message(one) message(two)\n',
      'message\n(one)\n',
      'message("bad\\q")\n',
      'message([=[one]=]two)\n',
      '#[[comment]] message(one)\n',
      'function()\nendfunction()\n',
      'macro()\nendmacro()\n',
      'else()\n',
      'if(TRUE)\nelse()\nelseif(FALSE)\nendif()\n',
      'if(TRUE)\nelse()\nelse()\nendif()\n',
    ]) {
      const report = await analyzeFiles([{ path: 'invalid.cmake', content }]);
      assert.equal(report.incomplete, true, content);
      assert.equal(report.passed, false, content);
      assert.ok(
        report.findings.some(({ ruleId }) => ruleId === 'syntax'),
        content
      );
      assert.throws(() => createBaseline(report), /Incomplete/);
    }
  });

  it('counts literal formal parameters with CMake quoting, escapes and list rules', async () => {
    for (const [header, name, parameters] of cmakeFormalParameters) {
      const result = await analyzeSource({
        path: 'parameters.cmake',
        content: `function(${header})\nendfunction()\n`,
      });
      assert.deepEqual(result.findings, [], header);
      assert.equal(result.abstractions[0].name, name, header);
      assert.equal(result.abstractions[0].parameters, parameters, header);
    }
  });

  it('counts structural decisions in each definition and keeps nested scopes separate', async () => {
    const content =
      '\uFEFFFUNCTION(outer first second)\r\n' +
      '  # if(TRUE)\r\n' +
      '  message([=[if(TRUE)]=] -Dname="one two" $(BUILD))\r\n' +
      '  if(first AND second)\r\n' +
      '  elseif(first OR second)\r\n' +
      '  else()\r\n' +
      '  endif()\r\n' +
      '  foreach(item IN ITEMS one two)\r\n' +
      '  endforeach()\r\n' +
      '  while(FALSE)\r\n' +
      '  endwhile()\r\n' +
      '  macro(inner one)\r\n' +
      '    if(one)\r\n' +
      '    endif()\r\n' +
      '  endmacro()\r\n' +
      'ENDFUNCTION(outer)\r\n';
    const report = await analyzeFiles([{ path: 'CMakeLists.txt', content }], {
      config: { rules: { parameters: 1, complexity: 4 } },
    });
    const [outer, inner] = [...report.files[0].abstractions].sort(
      (a, b) => a.start - b.start
    );
    assert.deepEqual(
      [outer.name, outer.parameters, outer.complexity],
      ['outer', 2, 5]
    );
    assert.deepEqual(
      [inner.qualifiedName, inner.parameters, inner.complexity],
      ['outer.inner', 1, 2]
    );
    assert.equal(outer.start, 1);
    assert.equal(outer.startLine, 1);
    assert.equal(inner.startLine, 12);
    assert.deepEqual(report.findings.map(({ ruleId }) => ruleId).sort(), [
      'complexity',
      'parameters',
    ]);
    assert.equal(report.incomplete, false);
  });

  it('accepts legacy arguments, comments, bracket contents and an optional end name warning', async () => {
    for (const content of [
      'message(-Dname="one two" $(BUILD))\n',
      '#[=[message(ignored)]=]\nmessage("first" #[[comment]] "second")\n',
      'message([=[one]=](two))\n',
      'message("one"two)\n',
      'function(example)\nendfunction(other)\n',
    ]) {
      const result = await analyzeSource({ path: 'valid.cmake', content });
      assert.deepEqual(result.findings, [], content);
    }
  });
});

describe('CMake incomplete-analysis refusals', () => {
  it('marks expanded formal arity unsupported and prevents a green baseline', async () => {
    for (const header of [
      'example ${arguments}',
      '${name} first',
      'example $ENV{ARGUMENTS}',
      'example $CACHE{ARGUMENTS}',
    ]) {
      const report = await analyzeFiles([
        {
          path: 'dynamic.cmake',
          content: `function(${header})\nendfunction()\n`,
        },
      ]);
      assert.equal(report.files[0].abstractions[0].parameters, null, header);
      assert.equal(report.incomplete, true, header);
      assert.equal(report.passed, false, header);
      assert.ok(
        report.findings.some(({ ruleId }) => ruleId === 'unsupported-analysis')
      );
      assert.ok(!report.findings.some(({ ruleId }) => ruleId === 'syntax'));
      assert.throws(() => createBaseline(report), /Incomplete/);
    }
    const literal = await analyzeFiles([
      {
        path: 'literal.cmake',
        content:
          'function(example [=[${arguments}]=] "${one}")\nendfunction()\n',
      },
    ]);
    assert.equal(literal.files[0].abstractions[0].parameters, 2);
    assert.equal(literal.incomplete, false);
    for (const header of ['"${name}" first', '; "${name}" first']) {
      const dynamicName = await analyzeFiles([
        {
          path: 'identity.cmake',
          content: `function(${header})\nendfunction()\n`,
        },
      ]);
      assert.equal(dynamicName.files[0].abstractions[0].parameters, 1);
      assert.equal(dynamicName.incomplete, true);
      assert.ok(
        dynamicName.findings.some(({ message }) =>
          message.includes('identity was not resolved')
        )
      );
    }
  });

  it('bounds nesting and command metadata without recursion or host exhaustion', () => {
    assert.throws(
      () => parseCmake(`message(${'('.repeat(513)}x${')'.repeat(513)})\n`),
      /depth budget/
    );
    assert.throws(
      () => parseCmake(`${'if(TRUE)\n'.repeat(513)}${'endif()\n'.repeat(513)}`),
      /depth budget/
    );
    assert.throws(
      () => parseCmake('message()\n'.repeat(50_001)),
      /command count budget/
    );
  });
  it('refuses applicable custom tree rules without a supported syntax tree', async () => {
    const file = { path: 'rules.cmake', content: 'message(example)\n' };
    const rule = {
      id: 'original-call',
      message: 'Inspect this call',
      pattern: { kind: 'command' },
    };
    const report = await analyzeFiles([file], {
      config: { customRules: [rule] },
    });
    assert.equal(report.incomplete, true);
    assert.ok(
      report.findings.some(
        ({ ruleId, message }) =>
          ruleId === 'unsupported-analysis' &&
          message.includes('custom tree rules')
      )
    );
    assert.throws(() => createBaseline(report), /Incomplete/);
    const excluded = await analyzeFiles([file], {
      config: { customRules: [{ ...rule, languages: ['javascript'] }] },
    });
    assert.equal(excluded.incomplete, false);
    assert.deepEqual(excluded.findings, []);
  });
  it('requires migration for a baseline with the v1 methodology', async () => {
    const report = await analyzeFiles([
      {
        path: 'baseline.cmake',
        content: 'function(example first)\nendfunction()\n',
      },
    ]);
    const previous = {
      ...createBaseline(report),
      method:
        '84fb3268ef7cea91c86f828f5f2f9aad600d9fd885828237a196828fa92f051b',
    };
    assert.notEqual(report.method, previous.method);
    assert.equal(checkBaseline(report, previous).passed, false);
  });
});
