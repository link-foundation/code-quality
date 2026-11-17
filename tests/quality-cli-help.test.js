import { describe, it } from 'test-anywhere';
import assert from 'node:assert/strict';
import { runQualityCli } from '../src/quality/cli.js';

async function invoke(args) {
  let output = '';
  let error = '';
  const status = await runQualityCli(args, {
    stdout: (value) => {
      output += value;
    },
    stderr: (value) => {
      error += value;
    },
  });
  return { output, error, status };
}

describe('CLI discovery without a project or external tools', () => {
  it('shows every command help before reading project configuration', async () => {
    for (const args of [
      [],
      ['check'],
      ['qa'],
      ['lint'],
      ['test'],
      ['coverage'],
      ['mutation'],
      ['baseline', 'check'],
      ['baseline-update'],
      ['evolution'],
      ['serve'],
      ['languages'],
      ['rules'],
      ['doctor'],
      ['tools', 'install'],
    ]) {
      const result = await invoke([
        ...args,
        '--help',
        '--config',
        'absent-project/absent-config.json',
      ]);
      assert.equal(result.status, 0, JSON.stringify({ args, ...result }));
      assert.equal(result.error, '');
      assert.match(result.output, /^Usage: code-quality/);
    }
  });

  it('supports help and version commands as well as their flag forms', async () => {
    assert.deepEqual(await invoke(['help']), await invoke(['--help']));
    const result = await invoke(['version']);
    assert.equal(result.status, 0, result.error);
    assert.match(result.output, /^\d+\.\d+\.\d+[^\n]*\n$/);
    assert.deepEqual(result, await invoke(['--version']));
  });

  it('refuses unknown commands before project configuration or tool lookup', async () => {
    for (const args of [
      ['not-a-command'],
      ['not-a-command', '--help'],
      ['tools', 'not-a-command'],
    ]) {
      const result = await invoke([
        ...args,
        '--config',
        'absent-project/absent-config.json',
      ]);
      assert.equal(result.status, 2);
      assert.match(result.error, /Unknown command/);
      assert.equal(result.output, '');
    }
  });
});
