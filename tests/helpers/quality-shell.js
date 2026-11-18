import { URL } from 'node:url';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export const source = await readFile(
  new URL('../../examples/code-quality/shell/choose.sh', import.meta.url),
  'utf8'
);
export const test = await readFile(
  new URL('../../examples/code-quality/shell/choose.bats', import.meta.url),
  'utf8'
);
export async function fixture(fn) {
  const root = await mkdtemp(join(tmpdir(), 'quality-shell-contract-'));
  try {
    await writeFile(join(root, 'choose.sh'), source);
    await writeFile(join(root, 'choose.bats'), test);
    return await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

export function runner(root, options = {}) {
  return async (command, args, { cwd } = {}) => {
    const ok = (stdout = '') => ({ code: 0, stdout, stderr: '' });
    if (args[0] === '--version') {
      return ok(
        command === 'bash'
          ? 'GNU bash, version 5.2.0'
          : `${command} fixture-version`
      );
    }
    if (command === 'bash') {
      return ok();
    }
    if (command === 'shellcheck') {
      return ok('[]');
    }
    if (command === 'kcov') {
      if (options.coverageError) {
        return { code: 2, stdout: '', stderr: 'fixture error' };
      }
      assert.equal(args[1], '--bash-dont-parse-binary-dir');
      await mkdir(join(args[2], 'bats'), { recursive: true });
      await writeFile(
        join(args[2], 'bats', 'codecov.json'),
        JSON.stringify({
          coverage: {
            [join(root, 'choose.sh')]: { 2: 1, 3: 1, 4: 1, 6: 0, 8: 0 },
          },
        })
      );
      return ok('1..1\nok 1 coverage\n');
    }
    assert.equal(command, 'bats');
    if (cwd === root) {
      if (options.controlError) {
        return { code: 1, stdout: '1..1\nnot ok 1 control\n', stderr: '' };
      }
      return ok('1..1\nok 1 control\n');
    }
    if (options.incompleteMutant) {
      return ok('1..2\nok 1 incomplete\n');
    }
    const changed = await readFile(join(cwd, 'choose.sh'), 'utf8');
    const killed = changed.includes('-ne') || changed.includes('-eq 0');
    return {
      code: killed ? 1 : 0,
      stdout: `1..1\n${killed ? 'not ok' : 'ok'} 1 mutant\n`,
      stderr: '',
    };
  };
}
