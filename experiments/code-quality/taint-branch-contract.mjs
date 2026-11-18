// Original finite branch observations; no source execution or upstream cases.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';
import { analyzeFiles } from '../../src/quality/index.js';

const root = new URL('../../examples/code-quality/taint-branches/', import.meta.url);
const config = JSON.parse(await readFile(new URL('quality.json', root), 'utf8'));
const observations = [];
for (const [name, content, expected] of [
  ['safe.js', await readFile(new URL('safe.js', root), 'utf8'), 'clean'],
  ['unsafe.js', await readFile(new URL('unsafe.js', root), 'utf8'), 'flow'],
  ['return.js', 'function route(flag) { let value = input.read(); if (flag) return; else value = validateCommand(value); execute(value); }\n', 'clean'],
  ['ternary.js', 'execute(true ? input.read() : "safe");\n', 'flow'],
  ['unreachable.js', 'if (false) execute(input.read());\n', 'flow'],
  ['unknown.js', 'if (false) unknown();\n', 'incomplete'],
  ['hoisted.js', 'function route(flag) { execute(input.read()); return; if (flag) { var validateCommand; } }\n', 'incomplete'],
]) {
  const report = await analyzeFiles([{path: name, content}], {config});
  const findings = report.findings.filter(({dataFlow}) => dataFlow);
  assert.equal(report.incomplete, expected === 'incomplete', name);
  assert.equal(findings.length, expected === 'flow' ? 1 : 0, name);
  assert.equal(report.passed, expected === 'clean', name);
  observations.push({
    path: name, sha256: createHash('sha256').update(content).digest('hex'), expected,
    incomplete: report.incomplete, paths: findings.map(({dataFlow}) => dataFlow),
    refusals: report.findings.filter(({ruleId}) => ruleId === 'unsupported-analysis').map(({message}) => message),
  });
}
console.log(JSON.stringify({observations}, null, 2));
