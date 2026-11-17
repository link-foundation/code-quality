import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { access, chmod, mkdir, open, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { runProcess } from './process.js';
import { requireBash } from './shell-version.js';
import { runtimePins } from './runtime-pins.js';
import { installRuntime } from './shell-runtime.js';
import {
  inspectShellInstallation,
  installationFingerprint,
} from './installation.js';
export { inspectShellInstallation } from './installation.js';

// Distribution metadata only. These tools remain separately licensed native
// adapters. In particular, this is not a JavaScript port of their behavior.
const bats = {
  version: '1.14.0',
  url: 'https://codeload.github.com/bats-core/bats-core/tar.gz/refs/tags/v1.14.0',
  sha256: 'bb537b70b15b732f6d8827dd6578e3d8ce166636ce1f18ea9a074184fcce9177',
  executable: 'bats-core-1.14.0/bin/bats',
};
const pins = {
  x64: {
    shellcheck: [
      'x86_64',
      'b7af85e41cc99489dcc21d66c6d5f3685138f06d34651e6d34b42ec6d54fe6f6',
    ],
    kcov: [
      'amd64',
      '30f6d21d7062b2bc244a68f196a45f3c9dda9de4766d1579c1defd55a87b24f1',
    ],
  },
  arm64: {
    shellcheck: [
      'aarch64',
      '68a8133197a50beb8803f8d42f9908d1af1c5540d4bb05fdfca8c1fa47decefc',
    ],
    kcov: [
      'arm64',
      'da332c480172ec8135d24bf17f1367b48459e3ea13d967780c216567e2dd19fc',
    ],
  },
};

export function shellToolManifest(
  platform = process.platform,
  arch = process.arch
) {
  if (platform !== 'linux' || !Object.hasOwn(pins, arch)) {
    throw new Error(
      'Downloaded shell tools require Linux x64 or arm64 with glibc'
    );
  }
  const pin = pins[arch];
  return {
    bats: { ...bats },
    shellcheck: {
      version: '0.11.0',
      url: `https://github.com/koalaman/shellcheck/releases/download/v0.11.0/shellcheck-v0.11.0.linux.${pin.shellcheck[0]}.tar.gz`,
      sha256: pin.shellcheck[1],
      executable: 'shellcheck-v0.11.0/shellcheck',
    },
    kcov: {
      version: '43+dfsg-1~bpo12+1',
      url: `https://deb.debian.org/debian/pool/main/k/kcov/kcov_43+dfsg-1~bpo12+1_${pin.kcov[0]}.deb`,
      sha256: pin.kcov[1],
      executable: 'usr/bin/kcov',
      dependencies: runtimePins[arch].map((pin) => ({ ...pin })),
    },
  };
}

async function download(pin, path, fetch) {
  const response = await fetch(pin.url, {
    signal: AbortSignal.timeout(300_000),
  });
  if (!response.ok || !response.body) {
    throw new Error(
      `Tool download failed: HTTP ${response.status}: ${pin.url}`
    );
  }
  const hash = createHash('sha256');
  const file = await open(path, 'wx', 0o600);
  let bytes = 0;
  try {
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > 33_554_432) {
        throw new Error('Tool download exceeds 32 MiB byte budget');
      }
      hash.update(chunk);
      await file.writeFile(chunk);
    }
  } finally {
    await file.close();
    await response.body.cancel().catch(() => {});
  }
  if (!bytes || hash.digest('hex') !== pin.sha256) {
    throw new Error(`Tool checksum mismatch: ${pin.url}`);
  }
}

async function unpackTool(name, archive, component, run) {
  const result = await run(
    name === 'kcov' ? 'dpkg-deb' : 'tar',
    name === 'kcov'
      ? ['--extract', archive, component]
      : [
          '--extract',
          '--gzip',
          '--file',
          archive,
          '--directory',
          component,
          '--no-same-owner',
          '--no-same-permissions',
          ...(name === 'bats'
            ? [
                'bats-core-1.14.0/bin',
                'bats-core-1.14.0/lib',
                'bats-core-1.14.0/libexec',
                'bats-core-1.14.0/LICENSE.md',
              ]
            : []),
        ],
    { timeoutMs: 300_000, maxOutputBytes: 65_536 }
  );
  if (result.code !== 0) {
    throw new Error(`Cannot unpack ${name}: ${result.stderr}`);
  }
}

export async function installShellTools(
  directory,
  {
    platform = process.platform,
    arch = process.arch,
    fetch = globalThis.fetch,
    run = runProcess,
  } = {}
) {
  const manifest = shellToolManifest(platform, arch);
  const root = resolve(directory);
  if (/[:;$\r\n]/.test(root)) {
    throw new Error(
      'Tool directory contains unsupported dynamic-loader path tokens'
    );
  }
  // Exclusive creation is also the ownership boundary for failure cleanup.
  // Existing directories, dependencies and caches are never replaced or removed.
  await mkdir(root, { mode: 0o700 });
  try {
    const bash = await run('bash', ['--version'], {
      env: { ...process.env, LC_ALL: 'C' },
      maxOutputBytes: 65_536,
    });
    if (bash.code !== 0) {
      throw new Error('Shell tools require GNU Bash >= 5.2');
    }
    requireBash(bash.stdout);
    const executables = {};
    let runtime;
    for (const [name, pin] of Object.entries(manifest)) {
      const archive = join(root, `${name}.download`);
      const component = join(root, name);
      await download(pin, archive, fetch);
      await mkdir(component);
      await unpackTool(name, archive, component, run);
      await rm(archive);
      executables[name] = join(component, pin.executable);
      if (name === 'kcov') {
        runtime = await installRuntime(root, pin, arch, {
          run,
          download: (dependency, path) => download(dependency, path, fetch),
        });
        executables[name] = runtime.launcher;
      }
      await access(executables[name], constants.X_OK);
      const version = await run(executables[name], ['--version'], {
        maxOutputBytes: 65_536,
      });
      if (
        version.code !== 0 ||
        !`${version.stdout}\n${version.stderr}`.includes(pin.version)
      ) {
        throw new Error(
          'Cannot execute pinned tool; check GNU Bash >= 5.2, glibc >= 2.36 and Python 3 prerequisites'
        );
      }
    }
    const files = await inspectShellInstallation(root);
    const receipt = {
      schemaVersion: 1,
      platform,
      arch,
      manifest,
      files,
      executables,
      runtime,
    };
    await writeFile(
      join(root, 'installation.json'),
      `${JSON.stringify(receipt, null, 2)}\n`,
      { flag: 'wx', mode: 0o600 }
    );
    await chmod(root, 0o755);
    return {
      ...receipt,
      directory: root,
      fingerprint: installationFingerprint(files),
    };
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}
