import { describe } from 'test-anywhere';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { extractEvolution } from '../src/quality/index.js';
import { runProcess } from '../src/quality/process.js';
import { itUnless, sandboxed } from './helpers/skip.js';

describe('CMake evolution metrics and refusals', () => {
  itUnless(sandboxed)(
    'tracks literal metrics and refuses unresolved definition identities or arity',
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'quality-cmake-history-'));
      const git = async (...args) => {
        const result = await runProcess('git', ['-C', root, ...args]);
        assert.equal(result.code, 0, result.stderr);
      };
      const commit = async () => {
        await git('add', '.');
        await git('commit', '-m', 'Original CMake history fixture');
      };
      try {
        await git('init', '-b', 'main');
        await git('config', 'user.name', 'Quality Fixture');
        await git('config', 'user.email', 'quality@example.invalid');
        await writeFile(
          join(root, 'original.cmake'),
          'function(sample first second)\nif(first)\nendif()\nendfunction()\n'
        );
        await commit();
        await writeFile(
          join(root, 'original.cmake'),
          'function(sample first second)\nmessage("value")\nendfunction()\n'
        );
        await commit();
        const history = await extractEvolution(root);
        const event = history.events.find(
          ({ kind, action }) => kind === 'function' && action === 'modified'
        );
        assert.equal(event.before.parameters, 2);
        assert.equal(event.before.complexity, 2);
        assert.equal(event.after.complexity, 1);
        for (const header of ['sample ${arguments}', '"${name}" first']) {
          await writeFile(
            join(root, 'original.cmake'),
            `function(${header})\nendfunction()\n`
          );
          await commit();
          await assert.rejects(
            () => extractEvolution(root, { maxCommits: 1 }),
            /unsupported.*abstraction tracking/
          );
        }
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  );
});
