import assert from 'node:assert/strict';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { URL } from 'node:url';
import { shellQuality } from '../../src/quality/index.js';
import { runQualityCli } from '../../src/quality/cli.js';

export async function verifyExpandedShell() {
  const root = await mkdtemp(join(tmpdir(), 'quality-expanded-'));
  try {
    await cp(
      new URL('../../examples/code-quality/shell-expanded/', import.meta.url),
      root,
      { recursive: true }
    );
    const standard = await shellQuality(root, { stage: 'mutation' });
    assert.equal(standard.measurement.mutants.length, 1);
    assert.equal(standard.measurement.mutants[0].status, 'survived');
    assert.equal(standard.metrics.mutationScore, 0);
    let output = '';
    let error = '';
    assert.equal(
      await runQualityCli(
        ['mutation', root, '--mutation-policy', 'expanded', '--format', 'json'],
        {
          stdout: (value) => {
            output += value;
          },
          stderr: (value) => {
            error += value;
          },
        }
      ),
      0,
      error
    );
    const expanded = JSON.parse(output);
    assert.equal(expanded.measurement.mutationPolicy, 'expanded');
    assert.equal(expanded.measurement.mutants.length, 6);
    assert.equal(
      expanded.measurement.mutants.filter(({ status }) => status === 'killed')
        .length,
      5
    );
    assert.equal(expanded.metrics.mutationScore, 83.33);
    assert.notEqual(expanded.method, standard.method);
    return {
      standard: {
        metrics: standard.metrics,
        mutants: standard.measurement.mutants,
      },
      expanded: {
        metrics: expanded.metrics,
        mutants: expanded.measurement.mutants,
      },
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
