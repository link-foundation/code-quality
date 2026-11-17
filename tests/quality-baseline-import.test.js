import { describe, it } from 'test-anywhere';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  checkBaseline,
  importQualityBashBaseline,
  validateQualityBashBaseline,
  shellQuality,
} from '../src/quality/index.js';
import { hash } from '../src/quality/syntax.js';
import { fixture, runner } from './helpers/quality-shell.js';
import { runQualityCli } from '../src/quality/cli.js';

function foreign() {
  return {
    $schema:
      'https://raw.githubusercontent.com/ever-guild/quality-bash/v1.0.0-alpha.3/baseline.schema.json',
    files: ['choose.sh'],
    method: {
      coverage: { algorithm: 'original-independent-coverage-contract' },
      mutation: {
        algorithm: 'original-independent-mutation-contract',
        operators: ['comparison'],
        parser: { name: 'documented-parser', version: 'original-version' },
      },
      tools: { bash: '5.2', bats: '1.14', shellcheck: '0.11', kcov: '43' },
    },
    coverage: { linePercent: 60 },
    mutation: { score: 66.66 },
  };
}

describe('quality-bash published baseline schema', () => {
  it('validates the published schema independently and refuses ambiguous or unsupported data', () => {
    assert.deepEqual(validateQualityBashBaseline(foreign()), foreign());
    const changes = [
      (v) => {
        v.$schema = 'unknown';
      },
      (v) => {
        v.extra = true;
      },
      (v) => {
        delete v.method.tools.bats;
      },
      (v) => {
        v.files = ['../escape.sh'];
      },
      (v) => {
        v.files.push(v.files[0]);
      },
      (v) => {
        v.method.coverage.extra = true;
      },
      (v) => {
        v.method.mutation.operators = [];
      },
      (v) => {
        v.method.mutation.parser.version = '';
      },
      (v) => {
        v.coverage.linePercent = 60.001;
      },
      (v) => {
        v.mutation.score = Number.NaN;
      },
      (v) => {
        v.mutation.score = 100.01;
      },
      (v) => {
        v.mutation.score = '66.66';
      },
    ];
    for (const change of changes) {
      const value = foreign();
      change(value);
      assert.throws(() => validateQualityBashBaseline(value));
    }
  });
});

describe('quality-bash baseline interchange', () => {
  it('requires fresh independent QA and preserves both source floors and the import audit', async () =>
    fixture(async (root) => {
      const report = await shellQuality(root, { run: runner(root) });
      const source = foreign();
      const before = JSON.stringify(source);
      const baseline = importQualityBashBaseline(report, source, {
        reason:
          'Reviewed the independent operators, parser and rounding policy',
      });
      assert.equal(checkBaseline(report, baseline).passed, true);
      assert.equal(baseline.method, report.method);
      assert.deepEqual(baseline.metrics, {
        linePercent: 60,
        mutationScore: 66.66,
      });
      assert.equal(baseline.migrations[0].previous, hash(before));
      assert.match(baseline.migrations[0].reason, /quality-bash schema import/);
      assert.equal(JSON.stringify(source), before);
      for (const patch of [
        { metrics: { ...report.metrics, linePercent: 59.99 } },
        { metrics: { ...report.metrics, mutationScore: 66.65 } },
        { metrics: {} },
        { files: [] },
        { files: [{ path: 'other.sh' }] },
        { passed: false },
        { incomplete: true },
        { measurement: { stage: 'coverage' } },
      ]) {
        assert.throws(() =>
          importQualityBashBaseline({ ...report, ...patch }, source, {
            reason: 'Reviewed',
          })
        );
      }
      for (const reason of [undefined, '', ' ', true, 'x'.repeat(901)]) {
        assert.throws(
          () => importQualityBashBaseline(report, source, { reason }),
          /reason/
        );
      }
    }));

  it('retains higher fresh floors and refuses foreign file drift', async () =>
    fixture(async (root) => {
      const report = await shellQuality(root, { run: runner(root) });
      const source = foreign();
      source.coverage.linePercent = 0;
      source.mutation.score = 0;
      const baseline = importQualityBashBaseline(report, source, {
        reason: 'Fresh independent QA is stronger',
      });
      assert.equal(baseline.metrics.linePercent, 60);
      assert.equal(baseline.metrics.mutationScore, 66.66);
      source.files.push('missing.sh');
      assert.throws(
        () => importQualityBashBaseline(report, source, { reason: 'Reviewed' }),
        /inventory/
      );
    }));

  it('rejects unsupported CLI imports before project execution and writes fresh incomplete evidence', async () =>
    fixture(async (root) => {
      const path = join(root, 'foreign.json');
      await writeFile(
        path,
        JSON.stringify({ ...foreign(), $schema: 'unknown' })
      );
      let error = '';
      const io = {
        stdout: () => {},
        stderr: (v) => {
          error += v;
        },
      };
      assert.equal(
        await runQualityCli(
          [
            'baseline-update',
            root,
            '--create',
            '--import-quality-bash',
            path,
            '--migrate',
            'Reviewed',
          ],
          io
        ),
        2
      );
      assert.match(error, /Unsupported quality-bash baseline schema/);
      const manifest = JSON.parse(
        await readFile(join(root, 'quality-reports/latest.json'), 'utf8')
      );
      assert.equal(manifest.complete, false);
      assert.equal(manifest.passed, false);
      assert.equal(
        await readFile(path, 'utf8'),
        JSON.stringify({ ...foreign(), $schema: 'unknown' })
      );
      assert.equal(
        await runQualityCli(['check', root, '--import-quality-bash', path], io),
        2
      );
      assert.match(error, /supported only by baseline-update/);
    }));
});
