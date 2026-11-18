import { describe, it } from 'test-anywhere';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseUniqueJson } from '../src/quality/json.js';
import { readJsonFile } from '../src/quality/persistence.js';
import { readGitBaseline } from '../src/quality/baseline.js';
import { runProcess } from '../src/quality/process.js';
import { fixture } from './helpers/quality-shell.js';

describe('unambiguous bounded JSON persistence', () => {
  it('rejects repeated names, including escaped aliases, in every object scope', () => {
    for (const source of [
      '{"score":100,"score":0}',
      '{"method":{"name":"first","name":"second"}}',
      '[{"linePercent":100,"linePercent":0}]',
      '{"score":100,"sco\\u0072e":0}',
      '{"\\\\":true,"\\u005c":false}',
      '{"__proto__":1,"__proto__":2}',
    ]) {
      assert.throws(() => parseUniqueJson(source), /Duplicate JSON property/);
    }
  });
  it('preserves valid values and independent object scopes without interpreting string contents', () => {
    for (const value of [
      null,
      true,
      1.25,
      'a"b\\c',
      [],
      {},
      { key: [1, { key: 2 }, { key: 3 }], text: '"key":[]{}\\' },
      { nested: { name: 'value' }, name: 'separate' },
    ]) {
      const source = JSON.stringify(value);
      assert.deepEqual(parseUniqueJson(source), JSON.parse(source));
    }
    assert.throws(() => parseUniqueJson('{"key": }'), SyntaxError);
    assert.throws(
      () => parseUniqueJson(`${'['.repeat(129)}0${']'.repeat(129)}`),
      /nesting/
    );
  });
  it('refuses ambiguous JSON at the actual file boundary without changing its bytes', async () =>
    fixture(async (root) => {
      const source = '{"metrics":{"linePercent":100,"linePercent":0}}';
      const path = join(root, 'ambiguous.json');
      await writeFile(path, source);
      await assert.rejects(readJsonFile(path), /Duplicate JSON property/);
      assert.equal(await readFile(path, 'utf8'), source);
    }));
  it('rejects duplicate committed floors before interpreting a target baseline', async () =>
    fixture(async (root) => {
      await writeFile(
        join(root, 'ambiguous.json'),
        '{"metrics":{"linePercent":100,"linePercent":0}}'
      );
      for (const args of [
        ['init', '-q'],
        ['add', 'ambiguous.json'],
        [
          '-c',
          'user.name=Original regression',
          '-c',
          'user.email=quality@example.invalid',
          'commit',
          '-qm',
          'Original duplicate baseline',
        ],
      ]) {
        const result = await runProcess('git', ['-C', root, ...args]);
        assert.equal(result.code, 0, result.stderr);
      }
      await assert.rejects(
        readGitBaseline(root, { ref: 'HEAD', path: 'ambiguous.json' }),
        /Duplicate JSON property/
      );
    }));
});
