import { utf8ByteLength } from './bytes.js';
import { constants } from 'node:fs';
import { readdir, lstat, open, readlink } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { safePath } from './config.js';

export function validateArtifacts(artifacts) {
  let bytes = 0;
  const entries = Object.entries(artifacts);
  if (entries.length > 128) {
    throw new Error('Coverage artifact count budget exceeded');
  }
  for (const [name, content] of entries) {
    safePath(name);
    if (
      !name.startsWith('coverage/') ||
      !(content instanceof Uint8Array || typeof content === 'string')
    ) {
      throw new Error(
        'Coverage artifacts must contain byte buffers or text under coverage/'
      );
    }
    const size =
      typeof content === 'string'
        ? utf8ByteLength(content)
        : content.byteLength;
    bytes += size;
    if (size > 16_777_216 || bytes > 33_554_432) {
      throw new Error('Coverage artifact byte budget exceeded');
    }
  }
  return entries;
}

async function readArtifact(absolute, stat, remaining) {
  const file = await open(
    absolute,
    constants.O_RDONLY |
      (constants.O_NOFOLLOW || 0) |
      (constants.O_NONBLOCK || 0)
  );
  try {
    if (!(await file.stat()).isFile()) {
      throw new Error('Coverage artifact must remain regular');
    }
    const limit = Math.min(16_777_216, remaining);
    const buffer = Buffer.alloc(Math.min(stat.size + 1, limit + 1));
    let count = 0;
    while (count < buffer.length) {
      const read = await file.read(buffer, count, buffer.length - count, null);
      if (!read.bytesRead) {
        break;
      }
      count += read.bytesRead;
    }
    if (count !== stat.size) {
      throw new Error('Coverage artifact changed during bounded read');
    }
    return buffer.subarray(0, count);
  } finally {
    await file.close();
  }
}

async function reportAlias(directory, absolute) {
  const target = resolve(directory, await readlink(absolute));
  if (
    dirname(target) !== resolve(directory) ||
    !/^bats\.[a-f0-9]{16}$/.test(basename(target)) ||
    !(await lstat(target)).isDirectory()
  ) {
    throw new Error('Unsupported kcov report alias');
  }
  return target;
}

// Read before the owned kcov workspace is removed. Never follow a generated
// arbitrary symlink or trust a stat size as the read limit. kcov's one known
// report alias is materialized as regular files after validating its target.
export async function readCoverageArtifacts(directory) {
  const artifacts = Object.create(null);
  let bytes = 0;
  let entries = 0;
  async function visit(local = '', depth = 0, physical = directory) {
    if (depth > 8) {
      throw new Error('Coverage artifact depth budget exceeded');
    }
    for (const name of (await readdir(physical)).sort()) {
      if (++entries > 256) {
        throw new Error('Coverage artifact entry budget exceeded');
      }
      const path = local ? `${local}/${name}` : name;
      safePath(path);
      const absolute = join(physical, name);
      const stat = await lstat(absolute);
      if (local === '' && name === 'bats' && stat.isSymbolicLink()) {
        const target = await reportAlias(directory, absolute);
        await visit(path, depth + 1, target);
        continue;
      }
      if (stat.isDirectory()) {
        await visit(path, depth + 1, absolute);
        continue;
      }
      if (
        !stat.isFile() ||
        stat.size > 16_777_216 ||
        bytes + stat.size > 33_554_432
      ) {
        throw new Error('Unsupported or oversized coverage artifact');
      }
      const content = await readArtifact(absolute, stat, 33_554_432 - bytes);
      bytes += content.byteLength;
      artifacts[`coverage/${path}`] = content;
    }
  }
  if (!(await lstat(directory)).isDirectory()) {
    throw new Error('Coverage artifact root must be a regular directory');
  }
  await visit();
  validateArtifacts(artifacts);
  return artifacts;
}
