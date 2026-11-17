import { describe } from 'test-anywhere';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { extractEvolution } from '../src/quality/index.js';
import { runProcess } from '../src/quality/process.js';
import { itUnless, sandboxed } from './helpers/skip.js';

describe('inline read-only code evolution extraction', () => {
  itUnless(sandboxed)(
    'tracks file/function/class additions, changes, renames, deletions and repeated improvements',
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'quality-history-'));
      const git = async (...args) => {
        const result = await runProcess('git', ['-C', root, ...args]);
        assert.equal(result.code, 0, result.stderr);
        return result.stdout.trim();
      };
      const commit = async (subject) => {
        await git('add', '.');
        await git('commit', '-m', subject);
        return git('rev-parse', 'HEAD');
      };
      try {
        await git('init', '-b', 'main');
        await git('config', 'user.name', 'Quality Fixture');
        await git('config', 'user.email', 'quality@example.invalid');
        const before =
          'export function first(x) { if (x) { return x; } return 0; }\nexport function second(y) { if (y) { return y; } return 0; }\nclass Sample { method() { return 1; } }\n';
        await writeFile(join(root, 'a.js'), before);
        await writeFile(
          join(root, 'b.py'),
          'def compute(x):\n    return x + 1\n'
        );
        const first = await commit('Add independent original functions');
        await writeFile(
          join(root, 'a.js'),
          before
            .replace('if (x) { return x; } return 0;', 'return x || 0;')
            .replace('if (y) { return y; } return 0;', 'return y || 0;')
        );
        await writeFile(
          join(root, 'b.py'),
          'def compute(x):\n    return x + 2\n'
        );
        await commit('Apply the same structural simplification twice');
        await rename(join(root, 'a.js'), join(root, 'renamed.js'));
        await commit('Move a file without changing its source');
        await writeFile(
          join(root, 'renamed.js'),
          'export function renamed(x) { return x || 0; }\n'
        );
        const last = await commit('Rename a function and remove a class');
        const report = await extractEvolution(root, { from: first, to: last });
        assert.equal(report.truncated, false);
        assert.equal(report.commits.length, 4);
        for (const kind of ['file', 'function', 'class']) {
          assert.ok(
            report.events.some((entry) => entry.kind === kind),
            kind
          );
        }
        for (const action of ['added', 'modified', 'renamed', 'deleted']) {
          assert.ok(
            report.events.some((entry) => entry.action === action),
            action
          );
        }
        assert.equal(report.repeatedPatterns[0].count, 2);
        assert.equal(report.suggestions[0].confidence, 'observational');
        assert.equal(report.suggestions[0].evidence.length, 2);
        assert.ok(
          report.coupling.some((entry) => entry.files.includes('b.py'))
        );
        const moved = report.events.find(
          (entry) => entry.kind === 'file' && entry.action === 'renamed'
        );
        assert.equal(moved.before.path, 'a.js');
        assert.equal(moved.after.path, 'renamed.js');
        const short = await extractEvolution(root, { maxCommits: 2 });
        assert.equal(short.truncated, true);
        await assert.rejects(
          () => extractEvolution(root, { from: first, maxCommits: 1 }),
          /bounded/
        );
        await assert.rejects(
          () => extractEvolution(root, { to: '--all' }),
          /Invalid/
        );
        await assert.rejects(
          () => extractEvolution(root, { maxCommits: 0 }),
          /integer/
        );
        assert.equal(await git('status', '--porcelain'), '');
        assert.equal(await git('rev-parse', 'HEAD'), last);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  );
});
