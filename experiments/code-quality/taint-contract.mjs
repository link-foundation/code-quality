// Original finite contract observations; no project execution or upstream cases.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';
import { analyzeFiles } from '../../src/quality/index.js';

const example = new URL('../../examples/code-quality/taint/', import.meta.url);
const config = JSON.parse(
  await readFile(new URL('quality.json', example), 'utf8')
);
const observations = [];
for (const [name, content, expected] of [
  ['safe.js', await readFile(new URL('safe.js', example), 'utf8'), 'clean'],
  ['unsafe.js', await readFile(new URL('unsafe.js', example), 'utf8'), 'flow'],
  [
    'parameter.ts',
    'function route(value: string) { execute(value); }\n',
    'flow',
  ],
  [
    'overwrite.js',
    'let raw = input.read(); raw = "safe"; execute(raw);\n',
    'clean',
  ],
  [
    'shadow.js',
    'function route() { execute(input.read()); return; var input; }\n',
    'incomplete',
  ],
  ['branch.js', 'if (true) execute(input.read());\n', 'incomplete'],
  [
    'escaped.js',
    'let \\u0076alidateCommand = input.read(); execute(validateCommand(input.read()));\n',
    'incomplete',
  ],
]) {
  const report = await analyzeFiles([{ path: name, content }], { config });
  const paths = report.findings.filter(({ dataFlow }) => dataFlow);
  assert.equal(report.incomplete, expected === 'incomplete', name);
  assert.equal(paths.length, expected === 'flow' ? 1 : 0, name);
  assert.equal(report.passed, expected === 'clean', name);
  observations.push({
    path: name,
    sha256: createHash('sha256').update(content).digest('hex'),
    expected,
    incomplete: report.incomplete,
    paths: paths.map(({ dataFlow }) => dataFlow),
    refusals: report.findings
      .filter(({ ruleId }) => ruleId === 'unsupported-analysis')
      .map(({ message }) => message),
  });
}
console.log(JSON.stringify({ observations }, null, 2));
