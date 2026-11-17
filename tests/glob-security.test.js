import { describe, it } from 'test-anywhere';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runProcess } from '../src/quality/process.js';

const alias = 'npm:@ryotsu/picomatch@4.0.7-a';
const integrity =
  'sha512-JroBFEmaejC7szGSfqOhF1QZHLKvX2wTA1+fWyfkpy3BjzdQKNPLKa2FtgeKVUDy5/UPUNkXEeCHJ5ZRBMLTVA==';
describe('patched glob dependency', () => {
  it('pins the reviewed patch in both npm locks and the Deno graph', async () => {
    for (const root of ['.', 'examples/universal-app']) {
      const manifest = JSON.parse(
        await readFile(`${root}/package.json`, 'utf8')
      );
      const lock = JSON.parse(
        await readFile(`${root}/package-lock.json`, 'utf8')
      );
      assert.equal(manifest.overrides.picomatch, alias);
      const entries = Object.entries(lock.packages).filter(([path]) =>
        path.endsWith('node_modules/picomatch')
      );
      assert.ok(entries.length > 0);
      for (const [, entry] of entries) {
        assert.equal(entry.name, '@ryotsu/picomatch');
        assert.equal(entry.version, '4.0.7-a');
        assert.equal(entry.integrity, integrity);
      }
    }
    const deno = JSON.parse(await readFile('deno.lock', 'utf8'));
    assert.equal(deno.npm['@ryotsu/picomatch@4.0.7-a'].integrity, integrity);
    assert.ok(
      Object.keys(deno.npm).every((key) => !key.startsWith('picomatch@'))
    );
  });
  it('finishes the original exponential case and preserves repository glob behavior', async () => {
    const result = await runProcess(
      'node',
      ['experiments/code-quality/glob-security.mjs'],
      { timeoutMs: 20_000 }
    );
    assert.equal(result.code, 0, result.stderr);
    assert.match(
      result.stdout,
      /12 bounded glob security\/compatibility cases/
    );
  });
});
