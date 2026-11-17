import { URL } from 'node:url';
import { describe, it } from 'test-anywhere';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  shellQuality,
  createBaseline,
  checkBaseline,
} from '../src/quality/index.js';

const source = await readFile(
  new URL('../examples/code-quality/shell/choose.sh', import.meta.url),
  'utf8'
);
const test = await readFile(
  new URL('../examples/code-quality/shell/choose.bats', import.meta.url),
  'utf8'
);
async function fixture(fn) {
  const root = await mkdtemp(join(tmpdir(), 'quality-shell-contract-'));
  try {
    await writeFile(join(root, 'choose.sh'), source);
    await writeFile(join(root, 'choose.bats'), test);
    return await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function runner(root, options = {}) {
  return async (command, args, { cwd } = {}) => {
    const ok = (stdout = '') => ({ code: 0, stdout, stderr: '' });
    if (args[0] === '--version') {
      return ok(`${command} fixture-version`);
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
      await mkdir(args[1], { recursive: true });
      await writeFile(
        join(args[1], 'coverage.info'),
        `SF:${join(root, 'choose.sh')}\nDA:2,1\nDA:3,1\nDA:4,1\nDA:6,0\nDA:8,0\nLF:5\nLH:3\nend_of_record\n`
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

describe('complete shell measurement contract', () => {
  it('measures fresh coverage and all mutants, fingerprints settings and enforces both floors', async () =>
    fixture(async (root) => {
      const report = await shellQuality(root, { run: runner(root) });
      assert.deepEqual(report.metrics, {
        linePercent: 60,
        mutationScore: 66.66,
      });
      assert.equal(report.measurement.mutants.length, 3);
      assert.equal(
        report.measurement.mutants.filter((entry) => entry.status === 'killed')
          .length,
        2
      );
      assert.equal(report.incomplete, false);
      const baseline = createBaseline(report);
      assert.equal(checkBaseline(report, baseline).passed, true);
      const lower = globalThis.structuredClone(report);
      lower.metrics.linePercent = 59.99;
      assert.equal(checkBaseline(lower, baseline).passed, false);
      const changed = await shellQuality(root, {
        run: runner(root),
        timeoutMs: 1000,
      });
      assert.notEqual(changed.method, report.method);
      assert.equal(checkBaseline(changed, baseline).passed, false);
      assert.equal(await readFile(join(root, 'choose.sh'), 'utf8'), source);
    }));
  it('rejects failed controls, coverage tools, incomplete tests and partial mutation budgets', async () =>
    fixture(async (root) => {
      for (const options of [
        { controlError: true },
        { coverageError: true },
        { incompleteMutant: true },
      ]) {
        await assert.rejects(() =>
          shellQuality(root, { run: runner(root, options) })
        );
      }
      await assert.rejects(
        () => shellQuality(root, { run: runner(root), maxMutants: 2 }),
        /Mutation budget/
      );
    }));
});
