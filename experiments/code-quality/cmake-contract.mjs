// Original, finite probes of CMake's public syntax contract. No project is built.
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runProcess } from '../../src/quality/process.js';
import { analyzeSource } from '../../src/quality/index.js';
import { cmakeFormalParameters } from '../../tests/fixtures/quality-cmake.js';

const cases = [
  [
    'formal-parameters',
    'function(example first second)\nendfunction()\n',
    true,
  ],
  [
    'bracket-parameter',
    'function([=[example]=] [=[first second]=])\nendfunction()\n',
    true,
  ],
  ['list-parameters', 'function(example first;second)\nendfunction()\n', true],
  [
    'quoted-parameters',
    'function("example" "first;second")\nendfunction()\n',
    true,
  ],
  ['legacy-arguments', 'message(-Dname="one two" $(BUILD))\n', true],
  ['bom-crlf', '\uFEFFfunction(example first)\r\nendfunction()\r\n', true],
  ['same-line', 'message(one) message(two)\n', false],
  ['name-newline', 'message\n(one)\n', false],
  ['invalid-escape', 'message("bad\\q")\n', false],
  ['empty-definition', 'function()\nendfunction()\n', false],
  ['mismatched-name', 'function(example)\nendfunction(other)\n', true],
  ['quoted-adjacent', 'message("one"two)\n', true],
  ['bracket-adjacent', 'message([=[one]=]two)\n', false],
  ['bracket-in-unquoted', 'message(prefix[=[value]=])\n', true],
  ['inline-bracket-comment', 'message(one) #[[comment]] message(two)\n', false],
  [
    'multiline-bracket-comment',
    'message(one) #[[comment\n]] message(two)\n',
    false,
  ],
  ['bracket-comment-prefix', '#[[comment]] message(one)\n', false],
  ['bracket-comment-newline', '#[[comment]]\nmessage(one)\n', true],
  ['bracket-before-parenthesis', 'message([=[one]=](two))\n', true],
  ['comment-after-name', 'message#[[comment]](one)\n', false],
];

const root = await mkdtemp(join(tmpdir(), 'quality-cmake-contract-'));
try {
  const version = await runProcess('cmake', ['--version'], {
    maxOutputBytes: 4096,
  });
  assert.equal(version.code, 0, version.stderr);
  const observations = [];
  for (const [name, content, expected] of cases) {
    const path = join(root, `${name}.cmake`);
    const prefix = 'cmake_minimum_required(VERSION 3.20)\n';
    await writeFile(
      path,
      content.startsWith('\uFEFF')
        ? `\uFEFF${prefix}${content.slice(1)}`
        : `${prefix}${content}`
    );
    const actual = await runProcess('cmake', ['-P', path], {
      maxOutputBytes: 16_384,
    });
    assert.equal(actual.code === 0, expected, `${name}: ${actual.stderr}`);
    const native = await analyzeSource({ path: `${name}.cmake`, content });
    assert.equal(
      !native.findings.some(({ ruleId }) => ruleId === 'syntax'),
      expected,
      name
    );
    observations.push({
      name,
      expected,
      cmakeCode: actual.code,
      cmakeDiagnostics: actual.stderr.trim().replaceAll(root, '$FIXTURE'),
      findings: native.findings,
      abstractions: native.abstractions.map(
        ({ name, parameters, complexity }) => ({ name, parameters, complexity })
      ),
    });
  }
  const formalParameters = [];
  for (const [header, name, parameters] of cmakeFormalParameters) {
    const content = `function(${header})\nendfunction()\n`;
    const path = join(root, 'arity.cmake');
    const calls = [];
    for (const count of [parameters, parameters - 1]) {
      await writeFile(
        path,
        `cmake_minimum_required(VERSION 3.20)\n${content}${name}(${Array(count).fill('value').join(' ')})\n`
      );
      const result = await runProcess('cmake', ['-P', path], {
        maxOutputBytes: 16_384,
      });
      assert.equal(
        result.code === 0,
        count === parameters,
        `${header}: ${result.stderr}`
      );
      calls.push({ arguments: count, accepted: result.code === 0 });
    }
    const native = await analyzeSource({ path: 'arity.cmake', content });
    assert.equal(native.abstractions[0].parameters, parameters, header);
    formalParameters.push({ header, parameters, calls });
  }
  console.log(
    JSON.stringify(
      {
        version: version.stdout.split('\n')[0],
        observations,
        formalParameters,
      },
      null,
      2
    )
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
