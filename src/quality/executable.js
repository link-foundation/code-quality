import { access, open, realpath, stat } from 'node:fs/promises';
import { createReadStream, constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { delimiter, join, resolve, sep } from 'node:path';
import { verifyShellInstallation } from './installation.js';

// Version output alone can be uninformative (the upstream kcov 42 archive says
// only "kcov"). Hash the actual entry executable too, with bounded reads.
export async function resolveExecutable(command, cwd = process.cwd()) {
  const suffixes =
    process.platform === 'win32'
      ? ['', ...(process.env.PATHEXT || '.EXE;.COM').split(';')]
      : [''];
  const paths = /[/\\]/.test(command)
    ? [resolve(cwd, command)]
    : (process.env.PATH || '')
        .split(delimiter)
        .flatMap((directory) =>
          suffixes.map((suffix) =>
            resolve(cwd, directory || '.', command + suffix)
          )
        );
  if (paths.length > 4096) {
    throw new Error('Executable search budget exceeded');
  }
  let executable;
  for (const path of paths) {
    try {
      await access(path, constants.X_OK);
      if ((await stat(path)).isFile()) {
        executable = path;
        break;
      }
    } catch {
      /* Continue PATH lookup. */
    }
  }
  if (!executable) {
    throw new Error(`Cannot resolve executable: ${command}`);
  }
  return executable;
}

export async function executableHash(command, cwd = process.cwd()) {
  const executable = await realpath(await resolveExecutable(command, cwd));
  const limit = 134_217_728;
  if ((await stat(executable)).size > limit) {
    throw new Error('Executable byte budget exceeded');
  }
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of createReadStream(executable, {
    highWaterMark: 65_536,
  })) {
    bytes += chunk.length;
    if (bytes > limit) {
      throw new Error('Executable byte budget exceeded');
    }
    hash.update(chunk);
  }
  return hash.digest('hex');
}

export async function executableProvenance(command, cwd, cache = new Map()) {
  const entry = await resolveExecutable(command, cwd);
  const executable = await realpath(entry);
  const result = { sha256: await executableHash(executable) };
  const suffixes = [
    'bin/kcov',
    'bats/bats-core-1.14.0/bin/bats',
    'shellcheck/shellcheck-v0.11.0/shellcheck',
  ];
  const normalized = entry.split(sep).join('/');
  const suffix = suffixes.find((item) => normalized.endsWith(`/${item}`));
  if (!suffix) {
    return result;
  }
  const root = entry.slice(0, -suffix.length - 1);
  // A launcher marker makes a missing receipt an error. Ordinary user-provided
  // tools without a managed receipt keep entry-executable fingerprinting.
  const file = await open(executable, 'r');
  const prefix = Buffer.alloc(128);
  let managed;
  try {
    await file.read(prefix, 0, prefix.length, 0);
    managed = prefix
      .toString()
      .startsWith('#!/bin/sh\n# code-quality-managed-kcov-v1\n');
  } finally {
    await file.close();
  }
  try {
    await access(join(root, 'installation.json'));
  } catch (error) {
    if (error.code === 'ENOENT' && !managed) {
      return result;
    }
    throw error;
  }
  if (!cache.has(root)) {
    cache.set(root, verifyShellInstallation(root));
  }
  result.installation = await cache.get(root);
  return result;
}
