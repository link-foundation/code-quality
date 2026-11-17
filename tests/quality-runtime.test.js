import { describe, it } from 'test-anywhere';
import assert from 'node:assert/strict';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  collectRuntime,
  checkLoaderListing,
} from '../src/quality/shell-runtime.js';
import { inspectShellInstallation } from '../src/quality/installation.js';
import { executableProvenance } from '../src/quality/executable.js';
import { shellToolManifest } from '../src/quality/index.js';
import { itUnless } from './helpers/skip.js';

async function fixture(fn) {
  const root = await mkdtemp(join(tmpdir(), 'quality-runtime-'));
  try {
    return await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe('private native runtime', () => {
  it('pins an independent Debian library closure and returns isolated metadata', () => {
    for (const arch of ['x64', 'arm64']) {
      const packages = shellToolManifest('linux', arch).kcov.dependencies;
      assert.equal(packages.length, 36);
      assert.equal(new Set(packages.map((pin) => pin.name)).size, 36);
      for (const pin of packages) {
        assert.match(
          pin.url,
          /^https:\/\/deb\.debian\.org\/debian(?:-security)?\/pool\//
        );
        assert.match(pin.sha256, /^[a-f0-9]{64}$/);
      }
      const original = packages[0].version;
      packages[0].version = 'changed';
      assert.equal(
        shellToolManifest('linux', arch).kcov.dependencies[0].version,
        original
      );
    }
  });

  it('refuses missing and host-resolved native dependencies while admitting host glibc', () => {
    const libraryRoot = '/private tools/runtime/lib';
    const lines = `linux-vdso.so.1 (0x1)\nlibcurl.so.4 => ${libraryRoot}/libcurl.so.4 (0x2)\nlibc.so.6 => /lib/libc.so.6 (0x3)\n/lib64/ld-linux-x86-64.so.2 (0x4)\n`;
    assert.equal(checkLoaderListing(lines, libraryRoot).length, 2);
    for (const output of [
      lines.replace(`${libraryRoot}/libcurl.so.4`, '/host/libcurl.so.4'),
      lines.replace(`${libraryRoot}/libcurl.so.4 (0x2)`, 'not found'),
      'libc.so.6 => /lib/libc.so.6 (0x3)\n',
      `${lines}libssl.so.3 => /host/libssl.so.3 (0x5)\n`,
      lines.replace(
        `${libraryRoot}/libcurl.so.4`,
        `${libraryRoot}/../../outside/libcurl.so.4`
      ),
    ]) {
      assert.throws(
        () => checkLoaderListing(output, libraryRoot),
        /runtime|Runtime/
      );
    }
  });

  itUnless(
    process.platform === 'win32' &&
      'Windows developer mode is required for file links'
  )(
    'materializes only internal library aliases, retains licenses and refuses escapes',
    async () =>
      fixture(async (root) => {
        const staging = join(root, 'staging');
        const libraries = join(staging, 'usr/lib/x86_64-linux-gnu');
        await mkdir(libraries, { recursive: true });
        await mkdir(join(staging, 'usr/share/doc/example'), {
          recursive: true,
        });
        await mkdir(join(staging, 'usr/share/common-licenses'), {
          recursive: true,
        });
        await writeFile(
          join(libraries, 'libexample.so.1.2'),
          'original native bytes'
        );
        await symlink('libexample.so.1.2', join(libraries, 'libexample.so.1'));
        await writeFile(
          join(staging, 'usr/share/doc/example/copyright'),
          'Original notice'
        );
        await writeFile(
          join(staging, 'usr/share/common-licenses/GPL-3'),
          'License fixture'
        );
        const destination = join(root, 'runtime');
        assert.deepEqual(
          await collectRuntime(
            staging,
            destination,
            [{ name: 'example' }],
            'x64'
          ),
          ['libexample.so.1']
        );
        assert.deepEqual(await readdir(join(destination, 'lib')), [
          'libexample.so.1',
        ]);
        assert.equal(
          await readFile(join(destination, 'lib/libexample.so.1'), 'utf8'),
          'original native bytes'
        );
        assert.equal(
          await readFile(
            join(destination, 'licenses/example.copyright'),
            'utf8'
          ),
          'Original notice'
        );
        assert.equal(
          await readFile(join(destination, 'licenses/common/GPL-3'), 'utf8'),
          'License fixture'
        );
        await writeFile(join(root, 'outside'), 'outside');
        await symlink(join(root, 'outside'), join(libraries, 'libescape.so.1'));
        await assert.rejects(
          collectRuntime(
            staging,
            join(root, 'refused'),
            [{ name: 'example' }],
            'x64'
          ),
          /internal regular file/
        );
        assert.equal(await readFile(join(root, 'outside'), 'utf8'), 'outside');
      })
  );
});

describe('managed installation provenance', () => {
  itUnless(
    process.platform === 'win32' &&
      'Windows developer mode is required for file links'
  )('refuses a managed launcher replaced by an external symlink', async () =>
    fixture(async (root) => {
      const managed = join(root, 'managed');
      await mkdir(join(managed, 'bin'), { recursive: true });
      const launcher = join(managed, 'bin/kcov');
      const outside = join(root, 'outside');
      await writeFile(launcher, '#!/bin/sh\necho original\n', { mode: 0o755 });
      await writeFile(outside, '#!/bin/sh\necho replaced\n', { mode: 0o755 });
      await writeFile(
        join(managed, 'installation.json'),
        JSON.stringify({
          schemaVersion: 1,
          files: await inspectShellInstallation(managed),
        })
      );
      await rm(launcher);
      await symlink(outside, launcher);
      await assert.rejects(executableProvenance(launcher), /link or special/);
    })
  );
  it('checks helper/library content and inventory before running a managed tool, and fingerprints relocatable trees', async () =>
    fixture(async (root) => {
      const first = join(root, 'first');
      await mkdir(join(first, 'bin'), { recursive: true });
      await mkdir(join(first, 'runtime/lib'), { recursive: true });
      const launcher = join(first, 'bin/kcov');
      await writeFile(
        launcher,
        '#!/bin/sh\n# code-quality-managed-kcov-v1\necho unchanged-version\n',
        { mode: 0o755 }
      );
      await writeFile(join(first, 'runtime/lib/libexample.so.1'), 'original');
      await assert.rejects(executableProvenance(launcher), /ENOENT/);
      const persist = async () =>
        writeFile(
          join(first, 'installation.json'),
          JSON.stringify({
            schemaVersion: 1,
            files: await inspectShellInstallation(first, '', {
              count: 0,
              bytes: 0,
              excludeReceipt: true,
            }),
          })
        );
      await persist();
      const before = await executableProvenance(launcher);
      assert.match(before.installation, /^[a-f0-9]{64}$/);
      const second = join(root, 'relocated');
      await cp(first, second, { recursive: true });
      assert.deepEqual(
        await executableProvenance(join(second, 'bin/kcov')),
        before
      );
      await writeFile(join(first, 'runtime/lib/libexample.so.1'), 'changed');
      await assert.rejects(
        executableProvenance(launcher),
        /installation changed/
      );
      await persist();
      const after = await executableProvenance(launcher);
      assert.equal(before.sha256, after.sha256);
      assert.notEqual(before.installation, after.installation);
      await writeFile(join(first, 'unexpected-helper'), 'extra');
      await assert.rejects(
        executableProvenance(launcher),
        /installation changed/
      );
    }));
});
