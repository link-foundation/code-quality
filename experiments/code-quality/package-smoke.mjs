import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runProcess } from '../../src/quality/process.js';

const root = await mkdtemp(join(tmpdir(), 'code-quality-package-'));
try {
  const pack = await runProcess(
    'npm',
    ['pack', '--json', '--pack-destination', root],
    { cwd: resolve('.') }
  );
  assert.equal(pack.code, 0, pack.stderr);
  const [{ filename }] = JSON.parse(pack.stdout);
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({ private: true, type: 'module' })
  );
  const install = await runProcess(
    'npm',
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      join(root, filename),
    ],
    { cwd: root, timeoutMs: 300_000 }
  );
  assert.equal(install.code, 0, install.stderr);
  const result = await runProcess(
    'node',
    [
      'node_modules/@link-foundation/code-quality/bin/code-quality.js',
      '--version',
    ],
    { cwd: root }
  );
  assert.equal(result.code, 0, result.stderr);
  const help = await runProcess(
    'node',
    [
      'node_modules/@link-foundation/code-quality/bin/code-quality.js',
      'qa',
      '--help',
    ],
    { cwd: root }
  );
  assert.equal(help.code, 0, help.stderr);
  assert.match(help.stdout, /--rounding <floor\|half-up>/);
  assert.match(help.stdout, /--mutation-policy <standard\|expanded>/);
  await writeFile(
    join(root, 'smoke.mjs'),
    `import { add } from '@link-foundation/code-quality';
     import { analyzeFiles, parseKcov, shellMutants } from '@link-foundation/code-quality/quality';
import assert from 'node:assert/strict';
assert.equal(add(2, 3), 5);
const report = await analyzeFiles([{ path: 'a.js', content: 'export const value = 1;\\n' }]);
assert.equal(report.passed, true);
assert.equal(parseKcov({coverage:{'a.sh':{1:1,2:1,3:0}}}, {rounding:'half-up'}).linePercent, 66.67);
const mutants = await shellMutants({path:'math.sh',content:'printf "%s" "$((7 + 3))"\\n'});
assert.equal(mutants.length, 1);
assert.equal(mutants[0].replacement, '-');
const clones = await analyzeFiles([{path:'a.js',content:'emit(value + 2);\\n'},{path:'b.js',content:'emit(value + 2);\\n'}], {config:{clones:{minTokens:7}}});
assert.equal(clones.clones[0].tokens, 7);
assert.equal(clones.cloneGroups[0].occurrences.length, 2);
assert.equal(clones.findings[0].ruleId, 'duplicate-tokens');
const cmake = await analyzeFiles([{path:'a.cmake',content:'message("same")\\n'},{path:'b.cmake',content:'message("same")\\n'}], {config:{clones:{minTokens:4}}});
assert.equal(cmake.incomplete, false);
assert.equal(cmake.clones[0].tokens, 4);
assert.equal(cmake.cloneGroups[0].occurrences.length, 2);
const suppressed = await analyzeFiles(['a.js','b.js'].map(path => ({path,content:'// CPD-OFF\\nconst squares = [4, 9, 16, 25];\\n// CPD-ON\\n'})), {config:{clones:{minTokens:5,suppressionComments:true}}});
assert.equal(suppressed.passed, true);
assert.deepEqual(suppressed.clones, []);
assert.equal(suppressed.cloneSuppressions.length, 2);
const filtered = await analyzeFiles(['First','Second'].map((name,index) => ({path:index+'.cs',content:'using '+name+';\\n['+name+'] class Sample { int Read(int value) { return value + 2; } }\\n'})), {config:{clones:{minTokens:17,ignoreAnnotations:true,ignoreUsings:true},rules:{'duplicate-function':false}}});
assert.equal(filtered.incomplete, false);
assert.equal(filtered.clones[0].tokens, 17);
assert.equal(filtered.cloneGroups[0].occurrences.length, 2);
const structural = await analyzeFiles([{path:'rule.js',content:'publish(first, first);\\n'}], {config:{customRules:[{id:'local/tree',message:'Review',pattern:{tree:{kind:'call_expression',children:[{text:'publish'},{kind:'arguments',children:[{capture:'ARG'},{capture:'ARG'}]}]}}}]}});
assert.equal(structural.findings[0].ruleId, 'local/tree');
assert.equal(structural.incomplete, false);
const predicates = await analyzeFiles([{path:'rule.js',content:'dispatch(first);\\nforward(first);\\n'}], {config:{customRules:[{id:'local/filter',message:'Review',pattern:{tree:{all:[{kind:'call_expression'}],any:[{fields:{function:{text:'dispatch'}}},{fields:{function:{text:'forward'}}}],not:{fields:{function:{text:'forward'}}}}}}]}});
assert.deepEqual(predicates.findings.map(({ruleId,line}) => [ruleId,line]), [['local/filter',1]]);
assert.equal(predicates.incomplete, false);
const bash = await analyzeFiles([{path:'literal.sh',content:'choose() { [[ word == word ]]; }\\n'}]);
assert.equal(bash.incomplete, false);
assert.deepEqual(bash.findings, []);
assert.equal(bash.files[0].abstractions[0].name, 'choose');
assert.deepEqual((await shellMutants({path:'literal.sh',content:'[[ word == word ]]\\n'})).map(({original,replacement}) => [original,replacement]), [['==','!=']]);
assert.deepEqual((await shellMutants({path:'expanded.sh',content:'printf "%s" "$((5 * 2))" "$((7 < 3))"\\n'}, 100, {policy:'expanded'})).map(({original,replacement}) => [original,replacement]), [['*','/'],['*','+'],['<','>=']]);
assert.deepEqual(await shellMutants({path:'quoted.sh',content:'printf "%s" "&&" "||"\\n'}), []);
const traced = await analyzeFiles([{path:'flow.js',content:'const raw = readInput(); execute(raw);\\n'}], {config:{taintRules:[{id:'local/flow',message:'Untrusted command',languages:['javascript'],sources:['readInput'],sinks:[{call:'execute',argument:0}]}]}});
assert.equal(traced.incomplete, false);
assert.equal(traced.findings[0].ruleId, 'local/flow');
assert.deepEqual(traced.findings[0].dataFlow.map(({kind}) => kind), ['source','assignment','sink']);
const branched = await analyzeFiles([{path:'branch.js',content:'let raw = "safe"; if (true) raw = readInput(); execute(raw);\\n'}], {config:{taintRules:[{id:'local/flow',message:'Untrusted command',languages:['javascript'],sources:['readInput'],sinks:[{call:'execute',argument:0}],controlFlow:'branch-joins'}]}});
assert.equal(branched.incomplete, false);
assert.equal(branched.findings[0].ruleId, 'local/flow');
assert.notEqual(branched.method, traced.method);
console.log('Installed library and CLI passed');\n`
  );
  const smoke = await runProcess('node', ['smoke.mjs'], { cwd: root });
  assert.equal(smoke.code, 0, smoke.stderr);
  console.log(smoke.stdout);
} finally {
  await rm(root, { recursive: true, force: true });
}
