import { describe, it } from 'test-anywhere';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { qualityAction } from '../scripts/quality-action.mjs';
import { runQualityCli } from '../src/quality/cli.js';
import { saveReport } from '../src/quality/report.js';

async function fixture(fn) {
  const root = await mkdtemp(join(tmpdir(), 'quality-action-'));
  try {
    await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe('consumer Action failure evidence', () => {
  it('preserves old evidence and publishes an incomplete run when tool installation fails', async () =>
    fixture(async (root) => {
      const reportDirectory = join(root, 'quality-reports');
      const old = await saveReport(
        { passed: true, files: [], findings: [], summary: {} },
        reportDirectory
      );
      const beforePath = process.env.PATH;
      await assert.rejects(
        qualityAction(
          { GITHUB_WORKSPACE: root, RUNNER_TEMP: root, QUALITY_COMMAND: 'qa' },
          {
            install: async () => {
              throw new Error('Original checksum refusal');
            },
            cli: () => {
              throw new Error('Unexpected project execution');
            },
          }
        ),
        /Original checksum refusal/
      );
      const current = JSON.parse(
        await readFile(join(reportDirectory, 'latest.json'), 'utf8')
      );
      assert.equal(current.complete, false);
      assert.equal(current.passed, false);
      assert.notEqual(current.run, old.run);
      assert.equal(
        JSON.parse(
          await readFile(
            join(reportDirectory, old.run, 'manifest.json'),
            'utf8'
          )
        ).passed,
        true
      );
      assert.equal(process.env.PATH, beforePath);
    }));
});

describe('consumer Action contract', () => {
  it('runs actual analysis and writes fresh evidence without executing project code', async () =>
    fixture(async (root) => {
      await mkdir(join(root, 'project'));
      await writeFile(join(root, 'project/a.js'), 'eval("untrusted");\n');
      const output = join(root, 'outputs');
      const code = await qualityAction(
        {
          GITHUB_WORKSPACE: root,
          QUALITY_ROOT: 'project',
          GITHUB_OUTPUT: output,
        },
        {
          cli: (args) =>
            runQualityCli(args, { stdout: () => {}, stderr: () => {} }),
          install: () => {
            throw new Error('Source analysis cannot install tools');
          },
        }
      );
      assert.equal(code, 1);
      const manifest = JSON.parse(
        await readFile(
          join(root, 'project/quality-reports/latest.json'),
          'utf8'
        )
      );
      assert.equal(manifest.passed, false);
      assert.match(await readFile(output, 'utf8'), /manifest=.*latest.json\n/);
    }));

  it('enforces the literal PR base commit and preserves a failing CLI result', async () =>
    fixture(async (root) => {
      const eventPath = join(root, 'event.json');
      const sha = 'a'.repeat(40);
      await writeFile(
        eventPath,
        JSON.stringify({ pull_request: { base: { sha } } })
      );
      const code = await qualityAction(
        {
          GITHUB_WORKSPACE: root,
          GITHUB_EVENT_NAME: 'pull_request',
          GITHUB_EVENT_PATH: eventPath,
          QUALITY_COMMAND: 'qa',
          QUALITY_INSTALL_TOOLS: 'false',
          QUALITY_JOBS: '2',
          QUALITY_BASELINE: 'floor ; literal.json',
        },
        {
          cli: async (args) => {
            assert.deepEqual(args.slice(-8), [
              '--baseline-path',
              'floor ; literal.json',
              '--jobs',
              '2',
              '--timeout-ms',
              '30000',
              '--baseline-ref',
              sha,
            ]);
            return 1;
          },
        }
      );
      assert.equal(code, 1);
    }));

  it('refuses privileged shell execution, path escapes and malformed PR base evidence', async () =>
    fixture(async (root) => {
      const options = {
        cli: () => {
          throw new Error('Unexpected execution');
        },
      };
      await assert.rejects(
        qualityAction(
          {
            GITHUB_WORKSPACE: root,
            QUALITY_COMMAND: 'qa',
            GITHUB_EVENT_NAME: 'pull_request_target',
          },
          options
        ),
        /pull_request_target/
      );
      await assert.rejects(
        qualityAction({ GITHUB_WORKSPACE: root, QUALITY_ROOT: '..' }, options),
        /inside/
      );
      await assert.rejects(
        qualityAction(
          { GITHUB_WORKSPACE: root, QUALITY_REPORTS: '../outside' },
          options
        ),
        /path/i
      );
      await assert.rejects(
        qualityAction(
          { GITHUB_WORKSPACE: root, QUALITY_ENFORCE_BASE: 'yes' },
          options
        ),
        /true or false/
      );
      const eventPath = join(root, 'event.json');
      await writeFile(
        eventPath,
        JSON.stringify({ pull_request: { base: { sha: '--bad-ref' } } })
      );
      await assert.rejects(
        qualityAction(
          {
            GITHUB_WORKSPACE: root,
            GITHUB_EVENT_NAME: 'pull_request',
            GITHUB_EVENT_PATH: eventPath,
            QUALITY_COMMAND: 'qa',
            QUALITY_INSTALL_TOOLS: 'false',
          },
          options
        ),
        /base commit/
      );
    }));
});
