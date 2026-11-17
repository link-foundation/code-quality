import { describe, it } from 'test-anywhere';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  readdir,
  rm,
  symlink,
} from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  analyzeFiles,
  createBaseline,
  checkBaseline,
  readGitBaseline,
  saveReport,
  analyzeProject,
} from '../src/quality/index.js';
import {
  atomicWriteFile,
  readJsonFile,
  withFileLock,
} from '../src/quality/persistence.js';
import { runQualityCli } from '../bin/code-quality.js';
import { runProcess } from '../src/quality/process.js';
import { itUnless, sandboxed } from './helpers/skip.js';

const clean = [{ path: 'a.js', content: 'export const answer = 42;\n' }];
async function fixture(fn) {
  const root = await mkdtemp(join(tmpdir(), 'quality-baseline-'));
  try {
    return await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
async function git(root, ...args) {
  const result = await runProcess('git', ['-C', root, ...args]);
  assert.equal(result.code, 0, result.stderr);
  return result.stdout.trim();
}
async function repository(root) {
  await git(root, 'init', '-q');
  await git(root, 'config', 'user.name', 'Quality regression');
  await git(root, 'config', 'user.email', 'quality@example.invalid');
}
async function commit(root) {
  await git(root, 'add', '.');
  await git(root, 'commit', '-qm', 'Original baseline');
  return git(root, 'rev-parse', 'HEAD');
}
async function bundle(directory) {
  const manifest = JSON.parse(
    await readFile(join(directory, 'latest.json'), 'utf8')
  );
  return { manifest, path: join(directory, manifest.run) };
}

describe('baseline persistence and committed floors', () => {
  it('rejects malformed methods, inventories, fingerprints and metric objects', async () => {
    const report = await analyzeFiles(clean);
    const baseline = createBaseline(report);
    for (const patch of [
      { method: '' },
      { method: ' ' },
      { files: [] },
      { files: ['../a.js'] },
      { files: ['a.js', 'a.js'] },
      { findings: ['x', 'x'] },
      { findings: [null] },
      { metrics: [] },
      { metrics: null },
      { metrics: { coverage: Infinity } },
      { unexpected: true },
    ]) {
      assert.throws(() => checkBaseline(report, { ...baseline, ...patch }));
    }
    for (const patch of [
      { method: '' },
      { metrics: [] },
      { files: [report.files[0], report.files[0]] },
    ]) {
      assert.throws(() => createBaseline({ ...report, ...patch }));
    }
  });

  it('creates exclusively, atomically replaces JSON and refuses oversized or malformed input', async () =>
    fixture(async (root) => {
      const path = join(root, 'baseline.json');
      const outcomes = await Promise.allSettled([
        atomicWriteFile(path, '{"writer":1}\n', { create: true }),
        atomicWriteFile(path, '{"writer":2}\n', { create: true }),
      ]);
      assert.equal(
        outcomes.filter((outcome) => outcome.status === 'fulfilled').length,
        1
      );
      assert.equal(
        outcomes.find((outcome) => outcome.status === 'rejected').reason.code,
        'EEXIST'
      );
      assert.ok([1, 2].includes((await readJsonFile(path)).writer));
      await atomicWriteFile(path, '{"writer":3}\n');
      assert.deepEqual(await readJsonFile(path), { writer: 3 });
      assert.deepEqual(await readdir(root), ['baseline.json']);
      await writeFile(path, ' '.repeat(1025));
      await assert.rejects(() => readJsonFile(path, 1024), /byte budget/);
      await writeFile(path, Buffer.from([0x22, 0xff, 0x22]));
      await assert.rejects(() => readJsonFile(path), /encoded|encoding|UTF/i);
      await assert.rejects(() => readJsonFile(root), /regular/);
    }));

  it('serializes baseline decisions and releases only its own update lock', async () =>
    fixture(async (root) => {
      const path = join(root, 'baseline.json');
      await withFileLock(path, async () => {
        await assert.rejects(
          () => withFileLock(path, () => assert.fail('Concurrent decision')),
          { code: 'EEXIST' }
        );
        await assert.rejects(() => readJsonFile(path), { code: 'ENOENT' });
      });
      await assert.rejects(
        () =>
          withFileLock(path, () => {
            throw new Error('Aborted update');
          }),
        /Aborted update/
      );
      assert.deepEqual(await readdir(root), []);
      await withFileLock(path, () =>
        atomicWriteFile(path, '{}\n', { create: true })
      );
      assert.deepEqual(await readJsonFile(path), {});
    }));
});

describe('committed target baseline enforcement', () => {
  itUnless(sandboxed)(
    'enforces the committed baseline even when a PR accepts its new finding locally',
    async () =>
      fixture(async (root) => {
        await repository(root);
        await writeFile(join(root, 'a.js'), clean[0].content);
        const baselinePath = join(root, 'quality-baseline.json');
        await writeFile(
          baselinePath,
          JSON.stringify(createBaseline(await analyzeFiles(clean)))
        );
        const revision = await commit(root);
        const changed = [{ path: 'a.js', content: 'eval("userInput");\n' }];
        await writeFile(join(root, 'a.js'), changed[0].content);
        await writeFile(
          baselinePath,
          JSON.stringify(createBaseline(await analyzeFiles(changed)))
        );
        const before = await git(root, 'status', '--porcelain');
        let output = '';
        let errors = '';
        const io = {
          stdout: (value) => {
            output += value;
          },
          stderr: (value) => {
            errors += value;
          },
        };
        assert.equal(
          await runQualityCli(
            ['check', root, '--baseline', baselinePath, '--format', 'json'],
            io
          ),
          0
        );
        output = '';
        assert.equal(
          await runQualityCli(
            [
              'check',
              root,
              '--baseline',
              baselinePath,
              '--baseline-ref',
              revision,
              '--reports',
              'quality-reports',
              '--format',
              'json',
            ],
            io
          ),
          1
        );
        assert.match(
          JSON.parse(output).baseline.failures.join('\n'),
          /Committed baseline: New finding/
        );
        assert.equal(errors, '');
        const saved = await bundle(join(root, 'quality-reports'));
        assert.equal(saved.manifest.complete, true);
        assert.equal(saved.manifest.passed, false);
        assert.match(
          await readFile(join(saved.path, 'report.txt'), 'utf8'),
          /Committed baseline/
        );
        assert.equal(
          JSON.parse(await readFile(join(saved.path, 'report.sarif'), 'utf8'))
            .runs[0].results.length,
          1
        );
        assert.equal(await git(root, 'rev-parse', 'HEAD'), revision);
        // Report output is the only additional workspace change.
        assert.equal(
          (await git(root, 'status', '--porcelain'))
            .split('\n')
            .filter((line) => !line.includes('quality-reports/'))
            .join('\n'),
          before
        );
        assert.deepEqual(
          await readGitBaseline(root, { ref: revision }),
          createBaseline(await analyzeFiles(clean))
        );
      })
  );
  itUnless(
    process.platform === 'win32' &&
      'Windows developer mode is required for links'
  )(
    'refuses baseline and report-directory symlinks without changing their targets',
    async () =>
      fixture(async (root) => {
        const path = join(root, 'baseline.json');
        await writeFile(path, '{}\n');
        const alias = join(root, 'alias.json');
        await symlink(path, alias);
        await assert.rejects(() => readJsonFile(alias), /regular/);
        await assert.rejects(
          () => atomicWriteFile(alias, 'changed'),
          /non-regular/
        );
        assert.equal(await readFile(path, 'utf8'), '{}\n');
        await mkdir(join(root, 'reports'));
        await symlink(
          join(root, 'reports'),
          join(root, 'linked-reports'),
          'dir'
        );
        await assert.rejects(
          async () =>
            saveReport(await analyzeFiles(clean), join(root, 'linked-reports')),
          /symlink/
        );
        assert.deepEqual(await readdir(join(root, 'reports')), []);
      })
  );
});

describe('bounded Git baseline reads', () => {
  itUnless(sandboxed)(
    'reads literal nested paths without checkout and refuses missing refs, paths and link blobs',
    async () =>
      fixture(async (root) => {
        await repository(root);
        const project = join(root, 'nested project');
        await mkdir(project);
        const baseline = createBaseline(await analyzeFiles(clean));
        await writeFile(
          join(project, 'quality[1].json'),
          JSON.stringify(baseline)
        );
        await writeFile(join(project, 'large.json'), ' '.repeat(1_048_577));
        const revision = await commit(root);
        assert.deepEqual(
          await readGitBaseline(project, {
            ref: revision,
            path: 'quality[1].json',
          }),
          baseline
        );
        await assert.rejects(
          () =>
            readGitBaseline(project, {
              ref: 'absent',
              path: 'quality[1].json',
            }),
          /fetch that revision/
        );
        await assert.rejects(
          () => readGitBaseline(project, { ref: '--help' }),
          /Invalid Git revision/
        );
        await assert.rejects(
          () =>
            readGitBaseline(project, { ref: revision, path: '../escape.json' }),
          /portable/
        );
        await assert.rejects(
          () =>
            readGitBaseline(project, { ref: revision, path: 'missing.json' }),
          /Missing committed/
        );
        await assert.rejects(
          () => readGitBaseline(project, { ref: revision, path: 'large.json' }),
          /byte budget/
        );
        const blob = await git(
          root,
          'rev-parse',
          `${revision}:nested project/quality[1].json`
        );
        await git(
          root,
          'update-index',
          '--cacheinfo',
          `120000,${blob},nested project/quality[1].json`
        );
        const tree = await git(root, 'write-tree');
        const linkCommit = await git(
          root,
          'commit-tree',
          tree,
          '-p',
          revision,
          '-m',
          'Synthetic Git symlink metadata'
        );
        await assert.rejects(
          () =>
            readGitBaseline(project, {
              ref: linkCommit,
              path: 'quality[1].json',
            }),
          /regular Git file/
        );
        assert.equal(await git(root, 'rev-parse', 'HEAD'), revision);
      })
  );
});

describe('fresh persistent report evidence', () => {
  it('keeps fresh analysis and failure status when a baseline is malformed', async () =>
    fixture(async (root) => {
      await writeFile(join(root, 'a.js'), clean[0].content);
      const path = join(root, 'quality-baseline.json');
      await writeFile(path, '{invalid');
      let error = '';
      assert.equal(
        await runQualityCli(
          ['check', root, '--baseline', path, '--reports', 'quality-reports'],
          {
            stdout: () => {},
            stderr: (value) => {
              error += value;
            },
          }
        ),
        2
      );
      assert.match(error, /JSON|property/i);
      const saved = await bundle(join(root, 'quality-reports'));
      assert.equal(saved.manifest.complete, false);
      assert.equal(saved.manifest.passed, false);
      const report = JSON.parse(
        await readFile(join(saved.path, 'report.json'), 'utf8')
      );
      assert.equal(report.files.length, 1);
      assert.equal(report.passed, false);
      assert.equal(report.incomplete, true);
      assert.match(
        await readFile(join(saved.path, 'report.txt'), 'utf8'),
        /Incomplete check/
      );
    }));
  it('saves separate immutable run bundles and marks failed measurements incomplete', async () =>
    fixture(async (root) => {
      const report = await analyzeFiles(clean);
      const directory = join(root, 'quality-reports');
      const first = await saveReport(report, directory);
      assert.equal(first.passed, true);
      const second = await saveReport(undefined, directory, {
        error: new Error('Measurement unavailable'),
      });
      assert.notEqual(first.run, second.run);
      assert.equal(second.complete, false);
      assert.equal(second.passed, false);
      assert.deepEqual((await bundle(directory)).manifest, second);
      assert.equal(
        JSON.parse(
          await readFile(join(directory, second.run, 'report.json'), 'utf8')
        ),
        null
      );
      assert.match(
        await readFile(join(directory, second.run, 'error.json'), 'utf8'),
        /Measurement unavailable/
      );
      assert.equal(
        JSON.parse(
          await readFile(join(directory, first.run, 'report.json'), 'utf8')
        ).passed,
        true
      );
    }));

  it('persists fresh diagnostics by default when shell QA cannot measure', async () =>
    fixture(async (root) => {
      await writeFile(join(root, 'a.js'), clean[0].content);
      let error = '';
      assert.equal(
        await runQualityCli(['qa', root], {
          stdout: () => {},
          stderr: (value) => {
            error += value;
          },
        }),
        2
      );
      assert.match(error, /Shell QA requires/);
      const saved = await bundle(join(root, 'quality-reports'));
      assert.equal(saved.manifest.complete, false);
      assert.match(
        await readFile(join(saved.path, 'error.json'), 'utf8'),
        /Shell QA requires/
      );
      assert.deepEqual(
        (await analyzeProject(root)).files.map((file) => file.path),
        ['a.js']
      );
      await assert.rejects(
        () => readFile(join(root, 'quality-baseline.json')),
        { code: 'ENOENT' }
      );
    }));
});
