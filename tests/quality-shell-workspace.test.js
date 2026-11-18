import { describe, it } from 'test-anywhere';
import assert from 'node:assert/strict';
import { writeFile, rm, mkdir, truncate, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { shellQuality } from '../src/quality/index.js';
import { fixture, runner } from './helpers/quality-shell.js';

async function changedControl(root, change) {
  const delegate = runner(root);
  let changed = false;
  return async (command, args, options) => {
    const result = await delegate(command, args, options);
    if (!changed && command === 'bats' && options.cwd === root) {
      changed = true;
      await change();
    }
    return result;
  };
}

describe('shell workspace input freshness', () => {
  for (const operation of ['replace', 'add', 'delete']) {
    it(`refuses a helper-data ${operation} between control and mutation`, async () => {
      await fixture(async (root) => {
        const helper = join(root, 'expected.txt');
        await writeFile(helper, 'before\n');
        const change = () =>
          operation === 'replace'
            ? writeFile(helper, 'after\n')
            : operation === 'delete'
              ? rm(helper)
              : writeFile(join(root, 'added.txt'), 'new\n');
        const run = await changedControl(root, change);
        await assert.rejects(
          shellQuality(root, { run }),
          /workspace.*changed/i
        );
      });
    });
  }

  it('refuses changes in an unselected shell helper', async () => {
    await fixture(async (root) => {
      await writeFile(join(root, 'helper.sh'), 'printf before\n');
      const run = await changedControl(root, () =>
        writeFile(join(root, 'helper.sh'), 'printf after\n')
      );
      await assert.rejects(
        shellQuality(root, { scripts: ['choose.sh'], run }),
        /workspace.*changed/i
      );
    });
  });

  it('allows explicitly excluded report changes and preserves complete measurements', async () => {
    await fixture(async (root) => {
      await mkdir(join(root, 'evidence'));
      await writeFile(join(root, 'expected.txt'), 'same\n');
      const run = await changedControl(root, async () => {
        await writeFile(join(root, 'evidence', 'new.json'), '{}\n');
        await writeFile(join(root, 'expected.txt'), 'same\n');
      });
      const report = await shellQuality(root, {
        excludedPaths: ['evidence'],
        run,
      });
      assert.equal(report.passed, true);
      assert.equal(report.metrics.mutationScore, 66.66);
      assert.equal(report.measurement.workspace.files, 3);
      assert.match(report.measurement.workspace.sha256, /^[a-f0-9]{64}$/);
    });
  });

  it('refuses changed helper permissions without requiring changed content', async () => {
    await fixture(async (root) => {
      const helper = join(root, 'expected.txt');
      await writeFile(helper, 'same\n');
      try {
        const run = await changedControl(root, () => chmod(helper, 0o444));
        await assert.rejects(
          shellQuality(root, { run }),
          /workspace.*changed/i
        );
      } finally {
        await chmod(helper, 0o644);
      }
    });
  });

  it('bounds helper bytes and refuses exclusions that hide selected inputs before execution', async () => {
    await fixture(async (root) => {
      let executions = 0;
      const run = async () => {
        executions++;
        throw new Error('Unexpected execution');
      };
      await assert.rejects(
        shellQuality(root, { excludedPaths: ['choose.sh'], run }),
        /hide selected/
      );
      await assert.rejects(
        shellQuality(root, { excludedPaths: ['../elsewhere'], run }),
        /relative portable/
      );
      const helper = join(root, 'large.dat');
      await writeFile(helper, '');
      // Sparse metadata probe; no large allocation or content write is needed.
      await truncate(helper, 33_554_433);
      await assert.rejects(shellQuality(root, { run }), /copy budget/);
      assert.equal(executions, 0);
    });
  });
});
