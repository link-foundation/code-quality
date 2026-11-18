import { describe, it } from 'test-anywhere';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import {
  shellQuality,
  createBaseline,
  parseTap,
} from '../src/quality/index.js';
import { fixture, runner, test } from './helpers/quality-shell.js';

describe('selected and independent shell measurements', () => {
  it('runs only the prerequisites and measurements for the requested stage', async () =>
    fixture(async (root) => {
      for (const [stage, required, metrics] of [
        ['lint', ['bash', 'shellcheck'], []],
        ['test', ['bash', 'bats'], []],
        ['coverage', ['bash', 'bats', 'kcov'], ['linePercent']],
        ['mutation', ['bash', 'bats'], ['mutationScore']],
      ]) {
        const calls = [];
        const native = runner(root);
        const report = await shellQuality(root, {
          stage,
          run: async (...args) => {
            calls.push(args[0]);
            return native(...args);
          },
        });
        assert.deepEqual([...new Set(calls)].sort(), required.sort());
        assert.equal(report.measurement.stage, stage);
        assert.deepEqual(Object.keys(report.metrics), metrics);
        assert.throws(() => createBaseline(report), /Independent shell stages/);
      }
      await writeFile(join(root, 'choose.bats'), '');
      assert.equal(
        (await shellQuality(root, { stage: 'lint', run: runner(root) })).passed,
        true
      );
      await assert.rejects(
        () => shellQuality(root, { stage: 'unknown', run: runner(root) }),
        /Unknown shell/
      );
    }));

  it('validates selected inventories, fingerprints test selection and detects changed tests', async () =>
    fixture(async (root) => {
      await writeFile(join(root, 'ignored.sh'), 'if broken; then\n');
      await writeFile(join(root, 'other.bats'), test);
      const options = {
        run: runner(root),
        scripts: ['choose.sh'],
        tests: ['choose.bats'],
      };
      const report = await shellQuality(root, options);
      assert.deepEqual(
        report.files.map((entry) => entry.path),
        ['choose.sh']
      );
      const changed = await shellQuality(root, {
        ...options,
        tests: ['other.bats'],
      });
      assert.notEqual(changed.method, report.method);
      for (const patch of [
        { scripts: [] },
        { scripts: ['choose.sh', 'choose.sh'] },
        { scripts: ['../choose.sh'] },
        { scripts: ['/choose.sh'] },
        { scripts: ['missing.sh'] },
        { tests: ['choose.sh'] },
      ]) {
        await assert.rejects(() =>
          shellQuality(root, { ...options, ...patch })
        );
      }
      const native = runner(root);
      await assert.rejects(
        () =>
          shellQuality(root, {
            ...options,
            run: async (...args) => {
              const result = await native(...args);
              if (args[0] === 'kcov') {
                await writeFile(join(root, 'choose.bats'), `${test}\n`);
              }
              return result;
            },
          }),
        /Source changed.*choose.bats/
      );
    }));
});

describe('bounded shell scheduling', () => {
  it('bounds workers, preserves deterministic results and excludes scheduling from the fingerprint', async () =>
    fixture(async (root) => {
      const serial = await shellQuality(root, { run: runner(root) });
      let active = 0;
      let maximum = 0;
      const native = runner(root);
      const parallel = await shellQuality(root, {
        jobs: 2,
        run: async (...args) => {
          if (
            args[0] !== 'bats' ||
            args[2]?.cwd === root ||
            args[1][0] === '--version'
          ) {
            return native(...args);
          }
          active++;
          maximum = Math.max(maximum, active);
          try {
            await setTimeout(25);
            return await native(...args);
          } finally {
            active--;
          }
        },
      });
      assert.equal(maximum, 2);
      assert.equal(active, 0);
      assert.equal(parallel.method, serial.method);
      assert.deepEqual(
        parallel.measurement.mutants,
        serial.measurement.mutants
      );
      assert.equal(
        (await shellQuality(root, { jobs: 'auto', run: runner(root) })).method,
        serial.method
      );
      for (const jobs of [0, 5, Infinity, 1.5, '2']) {
        await assert.rejects(
          () => shellQuality(root, { jobs, run: runner(root) }),
          /jobs/
        );
      }
    }));

  it('awaits active workers after a runner failure and never reports a partial score', async () =>
    fixture(async (root) => {
      const native = runner(root);
      let active = 0;
      let entered = 0;
      await assert.rejects(
        () =>
          shellQuality(root, {
            jobs: 2,
            run: async (...args) => {
              if (
                args[0] !== 'bats' ||
                args[2]?.cwd === root ||
                args[1][0] === '--version'
              ) {
                return native(...args);
              }
              active++;
              const index = entered++;
              try {
                await setTimeout(index === 0 ? 25 : 75);
                if (index === 0) {
                  throw new Error('original runner failure');
                }
                return await native(...args);
              } finally {
                active--;
              }
            },
          }),
        /original runner failure/
      );
      assert.equal(active, 0);
      assert.equal(entered, 2);
      assert.equal(await readFile(join(root, 'choose.bats'), 'utf8'), test);
    }));
});

describe('Bats early-stop assertion contract', () => {
  it('accepts only a sequential failure prefix with the exact original plan', () => {
    const prefix =
      // eslint-disable-next-line local/no-changelog-comments -- Exact Bats TAP diagnostic fixture.
      '1..3\nok 1 control\nnot ok 2 assertion\n# bats warning: Executed 2 instead of expected 3 tests\n';
    assert.deepEqual(parseTap(prefix, { allowAbort: true, expectedTotal: 3 }), {
      total: 3,
      failed: 1,
      executed: 2,
      aborted: true,
    });
    assert.throws(() => parseTap(prefix));
    for (const source of [
      '1..3\nok 1 only\n',
      '1..3\nnot ok 1\nok 2\n',
      '1..3\nnot ok 2\n',
      '1..3\nnot ok 1 # skip\n',
      '1..2\nnot ok 1\n',
      '1..3\nBail out!\nnot ok 1\n',
    ]) {
      assert.throws(() =>
        parseTap(source, { allowAbort: true, expectedTotal: 3 })
      );
    }
  });

  it('uses abort only for supported Bats mutants and rejects infrastructure exit codes', async () =>
    fixture(async (root) => {
      const native = runner(root);
      let mutantCalls = 0;
      let infrastructureError = false;
      const run = async (command, args, options = {}) => {
        if (command === 'bats' && args[0] === '--version') {
          return { code: 0, stdout: 'Bats 1.14.0\n', stderr: '' };
        }
        const result = await native(command, args, options);
        if (
          command === 'kcov' ||
          (command === 'bats' && options.cwd === root)
        ) {
          assert.ok(!args.includes('--abort'));
          result.stdout = `${result.stdout.replace('1..1', '1..2')}ok 2 second\n`;
        } else if (command === 'bats' && args[0] !== '--version') {
          mutantCalls++;
          assert.ok(args.includes('--abort'));
          result.stdout = result.stdout.replace('1..1', '1..2');
          if (!result.code) {
            result.stdout += 'ok 2 second\n';
          }
          if (infrastructureError) {
            result.code = 2;
          }
        }
        return result;
      };
      assert.equal(
        (await shellQuality(root, { run })).metrics.mutationScore,
        66.66
      );
      assert.equal(mutantCalls, 3);
      infrastructureError = true;
      await assert.rejects(() => shellQuality(root, { run }), /runner failed/);
    }));
});
