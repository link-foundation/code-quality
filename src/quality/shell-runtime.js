import {
  copyFile,
  lstat,
  mkdir,
  readdir,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';

async function entries(root, prefix = '', budget = { count: 0, bytes: 0 }) {
  if (prefix.split('/').length > 16) {
    throw new Error('Runtime package depth budget exceeded');
  }
  const result = [];
  for (const entry of await readdir(join(root, prefix), {
    withFileTypes: true,
  })) {
    if (++budget.count > 4000) {
      throw new Error('Runtime package entry budget exceeded');
    }
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      result.push(...(await entries(root, path, budget)));
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      const size = (await lstat(join(root, path))).size;
      budget.bytes += size;
      if (size > 67_108_864 || budget.bytes > 134_217_728) {
        throw new Error('Runtime package byte budget exceeded');
      }
      result.push({ path, link: entry.isSymbolicLink() });
    } else {
      throw new Error(`Runtime package contains a special file: ${path}`);
    }
  }
  return result;
}

async function internalFile(root, path) {
  const actual = await realpath(join(root, path));
  const inside = relative(root, actual);
  if (
    inside === '..' ||
    inside.startsWith(`..${sep}`) ||
    isAbsolute(inside) ||
    !(await lstat(actual)).isFile()
  ) {
    throw new Error(
      `Runtime package link must resolve to an internal regular file: ${path}`
    );
  }
  return actual;
}

// Keep the SONAME aliases as regular files. Versioned targets referenced by an
// alias need no duplicate copy: the dynamic loader requests the SONAME.
export async function collectRuntime(staging, destination, packages, arch) {
  // Compare resolved package links with the same canonical ownership root.
  // Ancestor aliases such as macOS /var -> /private/var are not package escapes.
  staging = await realpath(staging);
  const libraryRoot = join(destination, 'lib');
  await mkdir(libraryRoot, { recursive: true });
  const all = await entries(staging);
  const triple = arch === 'x64' ? 'x86_64-linux-gnu' : 'aarch64-linux-gnu';
  const candidates = [];
  for (const entry of all) {
    const path = entry.path.replace(/^usr\//, '');
    if (path.startsWith(`lib/${triple}/`) && /\.so(?:\.[\w+-]+)*$/.test(path)) {
      candidates.push({
        ...entry,
        name: path.slice(`lib/${triple}/`.length),
        actual: await internalFile(staging, entry.path),
      });
    }
  }
  const targets = new Set(
    candidates.filter((entry) => entry.link).map((entry) => entry.actual)
  );
  const selected = candidates.filter(
    (entry) => entry.link || !targets.has(entry.actual)
  );
  const names = new Set();
  for (const entry of selected) {
    if (names.has(entry.name)) {
      throw new Error(`Runtime library name collision: ${entry.name}`);
    }
    names.add(entry.name);
    const output = join(libraryRoot, entry.name);
    await mkdir(dirname(output), { recursive: true });
    await copyFile(entry.actual, output);
  }
  if (!names.size) {
    throw new Error('Runtime packages contain no shared libraries');
  }
  const licenses = join(destination, 'licenses');
  await mkdir(licenses);
  for (const pin of packages) {
    await copyFile(
      await internalFile(staging, `usr/share/doc/${pin.name}/copyright`),
      join(licenses, `${pin.name}.copyright`)
    );
  }
  for (const entry of all.filter((item) =>
    item.path.startsWith('usr/share/common-licenses/')
  )) {
    const output = join(
      licenses,
      'common',
      entry.path.slice('usr/share/common-licenses/'.length)
    );
    await mkdir(dirname(output), { recursive: true });
    await copyFile(await internalFile(staging, entry.path), output);
  }
  await writeFile(
    join(destination, 'packages.json'),
    `${JSON.stringify(packages, null, 2)}\n`,
    { flag: 'wx' }
  );
  return [...names].sort();
}

const glibc = new Set([
  'libc.so.6',
  'libm.so.6',
  'libdl.so.2',
  'libpthread.so.0',
  'librt.so.1',
  'libresolv.so.2',
]);

export function checkLoaderListing(output, libraryRoot) {
  const resolved = [];
  for (const line of output.split('\n')) {
    if (!line.includes('=>')) {
      continue;
    }
    const match = /^\s*(\S+) => (.+) \(0x[a-fA-F0-9]+\)\s*$/.exec(line);
    if (!match) {
      throw new Error(`Unresolved runtime dependency: ${line.trim()}`);
    }
    const [, name, path] = match;
    const inside = relative(libraryRoot, path);
    if (
      !isAbsolute(path) ||
      (!glibc.has(name) &&
        (inside === '..' ||
          inside.startsWith(`..${sep}`) ||
          isAbsolute(inside)))
    ) {
      throw new Error(`Runtime dependency escaped private libraries: ${name}`);
    }
    resolved.push({ name, path });
  }
  if (!resolved.some((entry) => entry.name === 'libcurl.so.4')) {
    throw new Error('Runtime loader did not report kcov dependencies');
  }
  return resolved;
}

export async function installRuntime(root, pin, arch, { download, run }) {
  const staging = join(root, 'runtime-extract');
  await mkdir(staging);
  for (const dependency of pin.dependencies) {
    const archive = join(root, `${dependency.name}.download`);
    await download(dependency, archive);
    const unpacked = await run('dpkg-deb', ['--extract', archive, staging], {
      timeoutMs: 300_000,
      maxOutputBytes: 65_536,
    });
    if (unpacked.code !== 0) {
      throw new Error(`Cannot unpack ${dependency.name}: ${unpacked.stderr}`);
    }
    await rm(archive);
  }
  const runtime = join(root, 'runtime');
  const libraries = await collectRuntime(
    staging,
    runtime,
    pin.dependencies,
    arch
  );
  await rm(staging, { recursive: true });
  const libraryRoot = join(runtime, 'lib');
  const loader =
    arch === 'x64'
      ? '/lib64/ld-linux-x86-64.so.2'
      : '/lib/ld-linux-aarch64.so.1';
  const executable = join(root, 'kcov', pin.executable);
  const listing = await run(
    loader,
    ['--inhibit-cache', '--library-path', libraryRoot, '--list', executable],
    {
      env: {
        ...process.env,
        LC_ALL: 'C',
        LD_LIBRARY_PATH: '',
        LD_PRELOAD: '',
        LD_AUDIT: '',
      },
      maxOutputBytes: 65_536,
    }
  );
  if (listing.code !== 0) {
    throw new Error(`Cannot load private kcov runtime: ${listing.stderr}`);
  }
  const dependencies = checkLoaderListing(listing.stdout, libraryRoot);
  const launcher = join(root, 'bin', 'kcov');
  await mkdir(dirname(launcher));
  await writeFile(
    launcher,
    `#!/bin/sh\n# code-quality-managed-kcov-v1\nunset LD_LIBRARY_PATH LD_PRELOAD LD_AUDIT\ntool_root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd -P) || exit 2\nexec '${loader}' --inhibit-cache --library-path "$tool_root/runtime/lib" "$tool_root/kcov/${pin.executable}" "$@"\n`,
    { flag: 'wx', mode: 0o755 }
  );
  return { launcher, loader, libraries, dependencies };
}
