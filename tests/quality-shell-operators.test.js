import { describe, it } from 'test-anywhere';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  shellMutants,
  shellQuality,
  createBaseline,
  checkBaseline,
} from '../src/quality/index.js';
import { runQualityCli } from '../src/quality/cli.js';
import { fixture, runner } from './helpers/quality-shell.js';

const pairs = (mutants) =>
  mutants.map(({ original, replacement }) => [original, replacement]);
const file = (content) => ({ path: 'operators.sh', content });

describe('shell mutation policies and operator boundaries', () => {
  it('leaves ordinary quoted logical text and comparison operands intact', async () => {
    assert.deepEqual(await shellMutants(file('printf "%s" "&&" "||"\n')), []);
    assert.deepEqual(pairs(await shellMutants(file('[[ / == / ]]\n'))), [
      ['==', '!='],
    ]);
    assert.deepEqual(pairs(await shellMutants(file('[[ "$1" == "&&" ]]\n'))), [
      ['==', '!='],
    ]);
    assert.deepEqual(
      pairs(await shellMutants(file('first && second || third\n'))),
      [
        ['&&', '||'],
        ['||', '&&'],
      ]
    );
  });

  it('adds ordering complements only in arithmetic contexts under the expanded policy', async () => {
    const source = file(
      'printf "%s" "$((7 < 3))" "$((7 <= 3))" "$((7 > 3))" "$((7 >= 3))"\n'
    );
    assert.deepEqual(await shellMutants(source), []);
    const mutants = await shellMutants(source, 100, { policy: 'expanded' });
    assert.deepEqual(pairs(mutants), [
      ['<', '>='],
      ['<=', '>'],
      ['>', '<='],
      ['>=', '<'],
    ]);
    for (const mutant of mutants) {
      assert.equal(
        source.content.slice(mutant.start, mutant.end),
        mutant.original
      );
      assert.equal(mutant.line, 1);
    }
    assert.deepEqual(
      await shellMutants(file('[[ left < right ]]\n'), 100, {
        policy: 'expanded',
      }),
      []
    );
    assert.deepEqual(
      pairs(
        await shellMutants(
          file('for ((count=2; count < 7; count++)); do printf tick; done\n'),
          100,
          { policy: 'expanded' }
        )
      ),
      [['<', '>=']]
    );
    assert.deepEqual(
      pairs(
        await shellMutants(file('((7 < 3))\n'), 100, { policy: 'expanded' })
      ),
      [['<', '>=']]
    );
  });

  it('preserves standard arithmetic replacements and adds an independent multiplication fault model', async () => {
    const source = file('printf "%s" "$((5 * 2))"\n');
    assert.deepEqual(pairs(await shellMutants(source)), [['*', '/']]);
    assert.deepEqual(
      pairs(await shellMutants(source, 100, { policy: 'expanded' })),
      [
        ['*', '/'],
        ['*', '+'],
      ]
    );
    assert.deepEqual(
      pairs(await shellMutants(source, 1, { policy: 'expanded' })),
      [['*', '/']]
    );
    await assert.rejects(
      shellMutants(source, 100, { policy: 'constructor' }),
      /mutation policy/
    );
  });

  it('retains logical operators and nested arithmetic boundaries', async () => {
    assert.deepEqual(
      pairs(await shellMutants(file('[[ -n word && -n other ]]\n'))),
      [['&&', '||']]
    );
    assert.deepEqual(
      pairs(await shellMutants(file('printf "%s" "$((7 && 3 || 2))"\n'))),
      [
        ['&&', '||'],
        ['||', '&&'],
      ]
    );
    const nested = file(
      'printf "%s" "$(((7 < 3) + 2))" "$((-(7 < 3)))" "$((4 ? 7 < 3 : 2))"\n'
    );
    assert.deepEqual(
      pairs(await shellMutants(nested, 100, { policy: 'expanded' })),
      [
        ['<', '>='],
        ['+', '-'],
        ['<', '>='],
        ['<', '>='],
      ]
    );
  });
});

describe('shell mutation policy measurements and consumers', () => {
  it('fingerprints the selected policy and refuses invalid policies before running project tools', async () =>
    fixture(async (root) => {
      const standard = await shellQuality(root, { run: runner(root) });
      const expanded = await shellQuality(root, {
        run: runner(root),
        mutationPolicy: 'expanded',
      });
      assert.equal(standard.measurement.mutationPolicy, 'standard');
      assert.equal(expanded.measurement.mutationPolicy, 'expanded');
      assert.deepEqual(
        standard.measurement.mutants,
        expanded.measurement.mutants
      );
      assert.notEqual(standard.method, expanded.method);
      assert.equal(
        checkBaseline(expanded, createBaseline(standard)).passed,
        false
      );
      let calls = 0;
      await assert.rejects(
        shellQuality(root, {
          mutationPolicy: 'missing',
          run: async () => {
            calls++;
          },
        }),
        /mutation policy/
      );
      assert.equal(calls, 0);
    }));

  it('refuses an expanded candidate count above the measurement budget', async () =>
    fixture(async (root) => {
      await writeFile(join(root, 'choose.sh'), 'printf "%s" "$((5 * 2))"\n');
      await assert.rejects(
        shellQuality(root, {
          stage: 'mutation',
          run: runner(root),
          mutationPolicy: 'expanded',
          maxMutants: 1,
        }),
        /Mutation budget exceeded/
      );
    }));

  it('refuses mutation-policy flags outside mutation measurements and documents supported commands', async () => {
    for (const command of ['check', 'lint', 'test', 'coverage', 'evolution']) {
      let error = '';
      assert.equal(
        await runQualityCli([command, '--mutation-policy', 'expanded'], {
          stdout: () => {},
          stderr: (value) => {
            error += value;
          },
        }),
        2
      );
      assert.match(error, /requires a shell mutation command/);
    }
    let help = '';
    assert.equal(
      await runQualityCli(['mutation', '--help'], {
        stdout: (value) => {
          help += value;
        },
        stderr: () => {},
      }),
      0
    );
    assert.match(help, /--mutation-policy <standard\|expanded>/);
  });
});
