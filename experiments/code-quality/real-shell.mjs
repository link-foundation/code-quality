import { URL } from 'node:url';
import assert from 'node:assert/strict';
import { mkdtemp, cp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  shellQuality,
  createBaseline,
  checkBaseline,
  updateBaseline,
} from '../../src/quality/index.js';
import { runQualityCli } from '../../src/quality/cli.js';
import { qualityAction } from '../../scripts/quality-action.mjs';
import { verifyBaselineImport } from './baseline-import.mjs';
import { verifyArithmeticShell } from './arithmetic-shell.mjs';
import { verifyWorkspaceFreshness } from './workspace-freshness.mjs';

const root = await mkdtemp(join(tmpdir(), 'code-quality-real-shell-'));
try {
  await cp(
    new URL('../../examples/code-quality/shell/', import.meta.url),
    root,
    { recursive: true }
  );
  const originalTests = await readFile(join(root, 'choose.bats'), 'utf8');
  await writeFile(
    join(root, 'choose.bats'),
    `${originalTests}\n@test "second succeeds" { true; }\n`
  );
  const statusReport = await shellQuality(root, { jobs: 2 });
  assert.equal(statusReport.passed, true);
  assert.equal(statusReport.measurement.mutants.length, 3);
  assert.equal(statusReport.metrics.mutationScore, 100);
  assert.equal(statusReport.measurement.controlTests, 2);
  // Preserve the stronger original fixture: assignment failure is an implicit
  // Bats assertion. A second original fixture deliberately inspects output only.
  await cp(
    new URL('../../examples/code-quality/shell-output-only/', import.meta.url),
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
  await verifyBaselineImport(root, report);
  const baseline = createBaseline(report);
  assert.equal(checkBaseline(report, baseline).passed, true);
  const lower = globalThis.structuredClone(report);
  lower.metrics.mutationScore = 0;
  assert.equal(checkBaseline(lower, baseline).passed, false);
  assert.throws(() => updateBaseline(lower, baseline));
  assert.equal(await readFile(join(root, 'choose.sh'), 'utf8'), source);
  let diagnostic = '';
  assert.equal(
    await runQualityCli(
      [
        'baseline-update',
        root,
        '--create',
        '--baseline-path',
        'quality-baseline.json',
        '--script',
        'choose.sh',
        '--test',
        'choose.bats',
        '--jobs',
        '2',
      ],
      {
        stdout: () => {},
        stderr: (value) => {
          diagnostic += value;
        },
      }
    ),
    0,
    diagnostic
  );
  const persisted = JSON.parse(
    await readFile(join(root, 'quality-baseline.json'), 'utf8')
  );
  assert.deepEqual(persisted.metrics, report.metrics);
  const manifest = JSON.parse(
    await readFile(join(root, 'quality-reports/latest.json'), 'utf8')
  );
  assert.equal(manifest.complete, true);
  assert.equal(manifest.passed, true);
  assert.ok(manifest.files.some((path) => path.endsWith('/index.html')));
  assert.ok(manifest.files.some((path) => path.endsWith('/cobertura.xml')));
  assert.ok(manifest.files.some((path) => path.endsWith('/codecov.json')));
  assert.deepEqual(
    JSON.parse(
      await readFile(
        join(root, 'quality-reports', manifest.run, 'report.json'),
        'utf8'
      )
    ).metrics,
    report.metrics
  );
  for (const command of [
    [
      'baseline-update',
      root,
      '--timeout-ms',
      '31000',
      '--migrate',
      'Reviewed the changed execution deadline',
    ],
    ['baseline', 'check', root, '--timeout-ms', '31000'],
  ]) {
    assert.equal(
      await runQualityCli(command, {
        stdout: () => {},
        stderr: (value) => {
          diagnostic += value;
        },
      }),
      0,
      diagnostic
    );
  }
  const migrated = JSON.parse(
    await readFile(join(root, 'quality-baseline.json'), 'utf8')
  );
  assert.deepEqual(migrated.metrics, persisted.metrics);
  assert.equal(
    migrated.migrations[0].reason,
    'Reviewed the changed execution deadline'
  );
  assert.equal(await readFile(join(root, 'choose.sh'), 'utf8'), source);
  assert.equal(
    await qualityAction(
      {
        GITHUB_WORKSPACE: root,
        QUALITY_COMMAND: 'qa',
        QUALITY_INSTALL_TOOLS: 'false',
        QUALITY_TIMEOUT_MS: '31000',
        QUALITY_JOBS: '2',
      },
      {
        cli: (args) =>
          runQualityCli(args, {
            stdout: () => {},
            stderr: (value) => {
              diagnostic += value;
            },
          }),
      }
    ),
    0,
    diagnostic
  );
  await writeFile(join(root, 'choose.sh'), `${source}\nunused_value=42\n`);
  diagnostic = '';
  assert.equal(
    await runQualityCli(
      [
        'baseline-update',
        root,
        '--baseline',
        join(root, 'refused-baseline.json'),
        '--create',
      ],
      {
        stdout: () => {},
        stderr: (value) => {
          diagnostic += value;
        },
      }
    ),
    2
  );
  assert.match(diagnostic, /must pass syntax and lint/);
  await assert.rejects(() => readFile(join(root, 'refused-baseline.json')), {
    code: 'ENOENT',
  });
  assert.deepEqual(
    JSON.parse(await readFile(join(root, 'quality-baseline.json'), 'utf8')),
    migrated
  );
  const failedManifest = JSON.parse(
    await readFile(join(root, 'quality-reports/latest.json'), 'utf8')
  );
  const failedReport = JSON.parse(
    await readFile(
      join(root, 'quality-reports', failedManifest.run, 'report.json'),
      'utf8'
    )
  );
  assert.equal(failedManifest.passed, false);
  assert.ok(
    failedReport.findings.some(
      (finding) => finding.ruleId === 'shellcheck/SC2034'
    )
  );
  // A manually edited baseline cannot turn a current lint failure green.
  const acceptedLint = createBaseline({ ...failedReport, incomplete: false });
  await writeFile(
    join(root, 'accepted-lint.json'),
    JSON.stringify(acceptedLint)
  );
  assert.equal(
    await runQualityCli(
      ['qa', root, '--baseline', join(root, 'accepted-lint.json')],
      {
        stdout: () => {},
        stderr: (value) => {
          diagnostic += value;
        },
      }
    ),
    1,
    diagnostic
  );
  console.log(
    JSON.stringify(
      {
        metrics: report.metrics,
        statusFixtureMetrics: statusReport.metrics,
        arithmeticFixtureMetrics: await verifyArithmeticShell(),
        workspaceFreshness: await verifyWorkspaceFreshness(),
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
