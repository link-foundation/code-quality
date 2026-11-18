import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { URL } from 'node:url';
import { shellQuality, createBaseline } from '../../src/quality/index.js';
import { runQualityCli } from '../../src/quality/cli.js';
import { qualityAction } from '../../scripts/quality-action.mjs';

export async function verifyArithmeticShell() {
  const root = await mkdtemp(join(tmpdir(), 'quality-arithmetic-'));
  try {
    await cp(
      new URL(
        '../../examples/code-quality/shell-measurement/arithmetic/',
        import.meta.url
      ),
      root,
      { recursive: true }
    );
    const results = {};
    for (const rounding of ['floor', 'half-up']) {
      const report = await shellQuality(root, { rounding });
      assert.equal(report.passed, true);
      assert.equal(report.measurement.coverage.covered, 3);
      assert.equal(report.measurement.coverage.total, 5);
      assert.equal(report.measurement.mutants.length, 3);
      assert.equal(
        report.measurement.mutants.filter(({ status }) => status === 'killed')
          .length,
        2
      );
      assert.equal(
        report.metrics.mutationScore,
        rounding === 'floor' ? 66.66 : 66.67
      );
      results[rounding] = report.metrics;
      if (rounding === 'half-up') {
        await writeFile(
          join(root, 'quality-baseline.json'),
          JSON.stringify(createBaseline(report))
        );
      }
    }
    let error = '';
    assert.equal(
      await qualityAction(
        {
          GITHUB_WORKSPACE: root,
          QUALITY_COMMAND: 'qa',
          QUALITY_INSTALL_TOOLS: 'false',
          QUALITY_ROUNDING: 'half-up',
        },
        {
          cli: (args) =>
            runQualityCli(args, {
              stdout: () => {},
              stderr: (value) => {
                error += value;
              },
            }),
        }
      ),
      0,
      error
    );
    const baseline = JSON.parse(
      await readFile(join(root, 'quality-baseline.json'), 'utf8')
    );
    assert.deepEqual(baseline.metrics, results['half-up']);
    return results;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
