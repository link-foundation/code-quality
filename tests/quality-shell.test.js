import { describe, it } from 'test-anywhere';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { source, fixture, runner } from './helpers/quality-shell.js';
import {
  shellQuality,
  createBaseline,
  checkBaseline,
  parseKcov,
} from '../src/quality/index.js';

describe('complete shell measurement contract', () => {
  it('counts actual kcov line hits and refuses incomplete or malformed measurements', () => {
    assert.deepEqual(
      parseKcov('{"coverage":{"a.sh":{"3":2,"4":2,"6":0,"8":2}}}'),
      { total: 4, covered: 3, linePercent: 75, files: ['a.sh'] }
    );
    for (const input of [
      {},
      { coverage: {} },
      { coverage: { 'a.sh': {} } },
      { coverage: { 'a.sh': { 1: null } } },
      { coverage: { 'a.sh': { 0: 1 } } },
      { coverage: { 'a.sh': { 1: -1 } } },
      { coverage: { 'a.sh': { 1: 1.5 } } },
    ]) {
      assert.throws(() => parseKcov(input), /kcov/);
    }
  });
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
