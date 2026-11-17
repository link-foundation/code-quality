import { describe, it } from 'test-anywhere';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { shellQuality, installShellTools } from '../src/quality/index.js';
import { requireBash } from '../src/quality/shell-version.js';
import { fixture, runner } from './helpers/quality-shell.js';

describe('Bash execution prerequisite', () => {
  it('requires a recognized GNU Bash 5.2 or newer version', () => {
    for (const version of ['5.2.0(1)-release', '5.3.1(1)-release', '6.0']) {
      assert.doesNotThrow(() => requireBash(`GNU bash, version ${version}`));
    }
    for (const version of ['4.4', '5.0', '5.1', '5.10x', '99999.0', '']) {
      assert.throws(
        () => requireBash(`GNU bash, version ${version}`),
        /Bash >= 5.2/
      );
    }
    assert.throws(() => requireBash('bash fixture-version'), /Bash >= 5.2/);
  });

  it('refuses unsupported Bash before project execution and before tool downloads', async () =>
    fixture(async (root) => {
      for (const version of ['GNU bash, version 5.1.0', 'unrecognized']) {
        const calls = [];
        const run = async (command, args, options) => {
          calls.push([command, args]);
          assert.equal(args[0], '--version', 'Project code must not execute');
          return command === 'bash'
            ? { code: 0, stdout: version, stderr: '' }
            : runner(root)(command, args, options);
        };
        await assert.rejects(shellQuality(root, { run }), /Bash >= 5.2/);
        const before = await readdir(root);
        await assert.rejects(
          installShellTools(join(root, 'new'), {
            platform: 'linux',
            arch: 'x64',
            run,
            fetch: () => {
              throw new Error('Must reject before fetching');
            },
          }),
          /Bash >= 5.2/
        );
        assert.deepEqual(await readdir(root), before);
        assert.ok(calls.every(([, args]) => args[0] === '--version'));
      }
    }));
});

describe('measurement toolchain consistency', () => {
  it('refuses a tool version that changes during the project measurement', async () =>
    fixture(async (root) => {
      let measured = false;
      const native = runner(root);
      await assert.rejects(
        shellQuality(root, {
          run: async (command, args, options) => {
            const result = await native(command, args, options);
            if (command === 'kcov' && args[0] !== '--version') {
              measured = true;
            }
            if (command === 'kcov' && args[0] === '--version' && measured) {
              result.stdout = 'kcov changed during measurement';
            }
            return result;
          },
        }),
        /toolchain changed during measurement/
      );
      assert.equal(measured, true);
    }));
});
