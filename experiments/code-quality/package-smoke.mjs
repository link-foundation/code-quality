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
assert.equal(clones.findings[0].ruleId, 'duplicate-tokens');
console.log('Installed library and CLI passed');\n`
  );
  const smoke = await runProcess('node', ['smoke.mjs'], { cwd: root });
  assert.equal(smoke.code, 0, smoke.stderr);
  console.log(smoke.stdout);
} finally {
  await rm(root, { recursive: true, force: true });
}
