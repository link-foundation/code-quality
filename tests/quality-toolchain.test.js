import { describe, it } from 'test-anywhere';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { shellToolManifest, installShellTools } from '../src/quality/index.js';
import { runQualityCli } from '../src/quality/cli.js';

async function fixture(fn) {
  const root = await mkdtemp(join(tmpdir(), 'quality-toolchain-'));
  try {
    await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe('pinned shell tool distribution', () => {
  it('pins actual gzip assets and Debian kcov 43 for both native architectures', () => {
    for (const arch of ['x64', 'arm64']) {
      const manifest = shellToolManifest('linux', arch);
      assert.equal(manifest.bats.version, '1.14.0');
      assert.equal(manifest.shellcheck.version, '0.11.0');
      assert.equal(manifest.kcov.version, '43+dfsg-1~bpo12+1');
      assert.ok(manifest.shellcheck.url.endsWith('.tar.gz'));
      for (const pin of Object.values(manifest)) {
        assert.match(pin.sha256, /^[a-f0-9]{64}$/);
        assert.match(pin.url, /^https:\/\//);
      }
      assert.equal(
        manifest.shellcheck.sha256,
        arch === 'x64'
          ? 'b7af85e41cc99489dcc21d66c6d5f3685138f06d34651e6d34b42ec6d54fe6f6'
          : '68a8133197a50beb8803f8d42f9908d1af1c5540d4bb05fdfca8c1fa47decefc'
      );
      manifest.bats.version = 'changed';
      assert.equal(shellToolManifest('linux', arch).bats.version, '1.14.0');
    }
    assert.throws(() => shellToolManifest('darwin', 'arm64'), /Linux/);
    assert.throws(() => shellToolManifest('linux', 'ia32'), /Linux/);
  });

  it('refuses existing destinations and unsupported platforms before fetching', async () =>
    fixture(async (root) => {
      await writeFile(join(root, 'keep'), 'owned by user');
      const options = {
        platform: 'linux',
        arch: 'x64',
        fetch: () => {
          throw new Error('Unexpected network call');
        },
      };
      await assert.rejects(installShellTools(root, options), /EEXIST/);
      assert.equal(await readFile(join(root, 'keep'), 'utf8'), 'owned by user');
      await assert.rejects(
        installShellTools(join(root, 'unsupported'), {
          ...options,
          platform: 'win32',
        }),
        /Linux/
      );
      assert.deepEqual(await readdir(root), ['keep']);
    }));

  it('rejects corrupt and failed downloads before extraction and removes only owned output', async () =>
    fixture(async (root) => {
      await mkdir(join(root, 'existing'));
      await writeFile(join(root, 'existing/keep'), 'preserve');
      for (const response of [
        new globalThis.Response('not the archive'),
        new globalThis.Response('unavailable', { status: 503 }),
      ]) {
        await assert.rejects(
          installShellTools(join(root, 'new'), {
            platform: 'linux',
            arch: 'x64',
            fetch: async () => response,
            run: () => {
              throw new Error('Unexpected extraction');
            },
          }),
          /checksum mismatch|HTTP 503/
        );
        assert.deepEqual(await readdir(root), ['existing']);
      }
      assert.equal(
        await readFile(join(root, 'existing/keep'), 'utf8'),
        'preserve'
      );
    }));

  it('requires an explicit installation destination in the CLI', async () => {
    let error = '';
    assert.equal(
      await runQualityCli(['tools', 'install'], {
        stdout: () => {},
        stderr: (value) => {
          error += value;
        },
      }),
      2
    );
    assert.match(error, /new destination directory/);
  });
});
