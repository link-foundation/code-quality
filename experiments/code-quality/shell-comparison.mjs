// Original finite black-box comparison; no upstream source or tests are read.
import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { URL } from 'node:url';
import { join, resolve } from 'node:path';
import {
  shellQuality,
  importQualityBashBaseline,
} from '../../src/quality/index.js';
import { runQualityCli } from '../../src/quality/cli.js';
import { runProcess } from '../../src/quality/process.js';
import { hash } from '../../src/quality/syntax.js';

const binary = process.argv[2];
assert.ok(
  binary,
  'Supply the independently checksum-verified alpha.5 Linux amd64 CLI'
);
const executable = resolve(binary);
const executableHash = hash(await readFile(executable));
assert.equal(
  executableHash,
  '6ef1bba6219909713ee6a068d3f9c437c93c701f5271092c8fb4816d6aec627d'
);
const releasedDoctor = await runProcess(executable, ['doctor'], {
  env: { ...process.env, GOMAXPROCS: '1', GOMEMLIMIT: '128MiB' },
  timeoutMs: 30_000,
  maxOutputBytes: 65_536,
});
assert.equal(releasedDoctor.code, 0, releasedDoctor.stderr);
const cases = [];
for (const name of ['numeric-condition', 'arithmetic']) {
  const root = await mkdtemp(join(tmpdir(), 'quality-shell-comparison-'));
  try {
    const source = new URL(
      `../../examples/code-quality/shell-measurement/${name}/`,
      import.meta.url
    );
    await cp(source, root, { recursive: true });
    const run = (command) =>
      runProcess(
        executable,
        [
          command,
          '--root',
          root,
          '--jobs',
          '1',
          '--timeout',
          '30s',
          ...(command === 'baseline-update' ? ['--create'] : []),
        ],
        {
          env: { ...process.env, GOMAXPROCS: '1', GOMEMLIMIT: '128MiB' },
          timeoutMs: 120_000,
          maxOutputBytes: 65_536,
        }
      );
    const noMeasurement = await run('baseline-update');
    assert.equal(noMeasurement.code, 1);
    assert.match(noMeasurement.stderr, /measurement\.json/);
    const qa = await run('qa');
    assert.equal(qa.code, 1, `${qa.stdout}\n${qa.stderr}`);
    assert.match(qa.stderr, /quality-baseline\.json/);
    const readReport = async (file) =>
      JSON.parse(await readFile(join(root, 'quality-reports', file), 'utf8'));
    const measurement = await readReport('measurement.json');
    const test = await readFile(join(root, 'choose.bats'), 'utf8');
    await writeFile(
      join(root, 'choose.bats'),
      `${test}\n# Original freshness probe.\n`
    );
    const staleMeasurement = await run('baseline-update');
    assert.equal(staleMeasurement.code, 1, JSON.stringify(staleMeasurement));
    await writeFile(join(root, 'choose.bats'), test);
    const update = await run('baseline-update');
    assert.equal(update.code, 0, `${update.stdout}\n${update.stderr}`);
    const baseline = JSON.parse(
      await readFile(join(root, 'quality-baseline.json'), 'utf8')
    );
    const original = {};
    const reports = {};
    for (const rounding of ['floor', 'half-up']) {
      const native = await shellQuality(root, { jobs: 1, rounding });
      assert.equal(native.passed, true);
      assert.equal(native.measurement.coverage.covered, 3);
      assert.equal(native.measurement.coverage.total, 5);
      assert.equal(native.measurement.mutants.length, 3);
      assert.equal(
        native.measurement.mutants.filter(({ status }) => status === 'killed')
          .length,
        2
      );
      reports[rounding] = native;
      original[rounding] = {
        method: native.method,
        coverage: native.measurement.coverage,
        metrics: native.metrics,
        mutants: native.measurement.mutants,
      };
    }
    assert.deepEqual(measurement.coverageCounts, {
      numerator: 3,
      denominator: 5,
    });
    assert.deepEqual(
      measurement.mutationCounts,
      name === 'arithmetic'
        ? { numerator: 2, denominator: 3 }
        : { numerator: 1, denominator: 2 }
    );
    assert.equal(baseline.mutation.score, name === 'arithmetic' ? 66.67 : 50);
    let migration;
    if (name === 'arithmetic') {
      assert.throws(
        () =>
          importQualityBashBaseline(reports.floor, baseline, {
            reason: 'Original finite comparison',
          }),
        /floor/
      );
      let output = '';
      let error = '';
      const code = await runQualityCli(
        [
          'baseline-update',
          root,
          '--create',
          '--baseline-path',
          'native-baseline.json',
          '--import-quality-bash',
          join(root, 'quality-baseline.json'),
          '--migrate',
          'Reviewed original arithmetic comparison, independent parsers and operators',
          '--rounding',
          'half-up',
          '--reports',
          'native-reports',
        ],
        {
          stdout: (value) => {
            output += value;
          },
          stderr: (value) => {
            error += value;
          },
        }
      );
      assert.equal(code, 0, error);
      const imported = JSON.parse(
        await readFile(join(root, 'native-baseline.json'), 'utf8')
      );
      assert.deepEqual(imported.metrics, {
        linePercent: 60,
        mutationScore: 66.67,
      });
      assert.deepEqual(
        JSON.parse(await readFile(join(root, 'quality-baseline.json'), 'utf8')),
        baseline
      );
      migration = {
        code,
        output,
        error,
        importedMetrics: imported.metrics,
        sourcePreserved: true,
      };
    }
    const observation = {
      name,
      inputs: {
        sourceSha256: hash(await readFile(join(root, 'choose.sh'))),
        testSha256: hash(test),
      },
      original,
      tools: reports.floor.measurement.tools,
      migration,
      upstream: {
        noMeasurement,
        qa,
        staleMeasurement,
        update,
        measurement,
        coverage: await readReport('coverage.json'),
        mutation: await readReport('mutation.json'),
        baseline,
      },
    };
    cases.push(
      JSON.parse(JSON.stringify(observation).replaceAll(root, '$FIXTURE'))
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
console.log(
  JSON.stringify(
    {
      release: 'v1.0.0-alpha.5',
      archiveSha256:
        '66349fa3434ee12ee64afe3fb78a1634ca7332eefa87102c6071fe7536399450',
      executableSha256: executableHash,
      releasedDoctor,
      method:
        'Original fixtures; released tools install; both engines use that same installed tool cache; one worker, 30-second process budgets',
      cases,
    },
    null,
    2
  )
);
