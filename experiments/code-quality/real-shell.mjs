import { URL } from 'node:url';
import assert from 'node:assert/strict';
import { mkdtemp, cp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  shellQuality,
  createBaseline,
  checkBaseline,
  updateBaseline,
} from '../../src/quality/index.js';

const root = await mkdtemp(join(tmpdir(), 'code-quality-real-shell-'));
try {
  await cp(
    new URL('../../examples/code-quality/shell/', import.meta.url),
    root,
    { recursive: true }
  );
  const source = await readFile(join(root, 'choose.sh'), 'utf8');
  const report = await shellQuality(root);
  assert.equal(report.passed, true);
  assert.equal(report.measurement.controlTests, 1);
  assert.equal(report.measurement.mutants.length, 3);
  assert.equal(report.metrics.mutationScore, 66.66);
  assert.ok(report.metrics.linePercent > 0 && report.metrics.linePercent < 100);
  assert.equal(report.incomplete, false);
  const baseline = createBaseline(report);
  assert.equal(checkBaseline(report, baseline).passed, true);
  const lower = globalThis.structuredClone(report);
  lower.metrics.mutationScore = 0;
  assert.equal(checkBaseline(lower, baseline).passed, false);
  assert.throws(() => updateBaseline(lower, baseline));
  assert.equal(await readFile(join(root, 'choose.sh'), 'utf8'), source);
  console.log(
    JSON.stringify(
      {
        metrics: report.metrics,
        tools: report.measurement.tools,
        mutants: report.measurement.mutants,
      },
      null,
      2
    )
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
