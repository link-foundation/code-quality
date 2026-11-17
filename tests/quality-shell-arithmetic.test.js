import { describe, it } from 'test-anywhere';
import assert from 'node:assert/strict';
import {
  shellMutants,
  parseKcov,
  shellQuality,
  createBaseline,
  checkBaseline,
} from '../src/quality/index.js';
import { fixture, runner } from './helpers/quality-shell.js';
import { runQualityCli } from '../src/quality/cli.js';

describe('independent shell arithmetic and rounding contracts', () => {
  it('refuses a shell rounding policy on source-only commands', async () => {
    let error = '';
    assert.equal(
      await runQualityCli(['check', '--rounding', 'half-up'], {
        stdout: () => {},
        stderr: (value) => {
          error += value;
        },
      }),
      2
    );
    assert.match(error, /shell measurement command/);
  });
  it('mutates arithmetic operators without treating ordinary command text as arithmetic', async () => {
    const mutants = await shellMutants({
      path: 'math.sh',
      content:
        'printf "%s" "$((7 + 3))" "$((7 - 3))" "$((7 * 3))" "$((7 / 3))"\nprintf + - \\* /\n',
    });
    assert.deepEqual(
      mutants.map(({ original, replacement }) => [original, replacement]),
      [
        ['+', '-'],
        ['-', '+'],
        ['*', '/'],
        ['/', '*'],
      ]
    );
    const variable = await shellMutants({
      path: 'variables.sh',
      content: 'printf "%s" "$((constructor + toString))"\n',
    });
    assert.deepEqual(
      variable.map(({ original, replacement }) => [original, replacement]),
      [['+', '-']]
    );
  });

  it('keeps conservative defaults and offers explicit half-up coverage rounding', () => {
    const source = { coverage: { 'math.sh': { 1: 1, 2: 1, 3: 0 } } };
    assert.equal(parseKcov(source).linePercent, 66.66);
    assert.equal(parseKcov(source, { rounding: 'half-up' }).linePercent, 66.67);
    const tie = {
      coverage: {
        'math.sh': Object.fromEntries(
          Array.from({ length: 32 }, (_, index) => [
            index + 1,
            index === 0 ? 1 : 0,
          ])
        ),
      },
    };
    assert.equal(parseKcov(tie).linePercent, 3.12);
    assert.equal(parseKcov(tie, { rounding: 'half-up' }).linePercent, 3.13);
    const exact = {
      coverage: {
        'math.sh': Object.fromEntries(
          Array.from({ length: 100 }, (_, index) => [
            index + 1,
            index < 29 ? 1 : 0,
          ])
        ),
      },
    };
    assert.equal(parseKcov(exact).linePercent, 29);
    assert.throws(() => parseKcov(source, { rounding: 'nearest' }), /rounding/);
  });

  it('fingerprints rounding and rejects incompatible baselines without altering raw outcomes', async () => {
    await fixture(async (root) => {
      const conservative = await shellQuality(root, { run: runner(root) });
      const rounded = await shellQuality(root, {
        rounding: 'half-up',
        run: runner(root),
      });
      assert.equal(conservative.metrics.mutationScore, 66.66);
      assert.equal(rounded.metrics.mutationScore, 66.67);
      assert.deepEqual(
        conservative.measurement.mutants,
        rounded.measurement.mutants
      );
      assert.equal(rounded.metrics.linePercent, 60);
      assert.equal(
        checkBaseline(rounded, createBaseline(conservative)).passed,
        false
      );
      let calls = 0;
      await assert.rejects(
        shellQuality(root, {
          rounding: 'nearest',
          run: async () => {
            calls++;
          },
        }),
        /rounding/
      );
      assert.equal(calls, 0);
    });
  });
});
