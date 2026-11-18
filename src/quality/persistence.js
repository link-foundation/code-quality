import { constants } from 'node:fs';
import { open, lstat, link, rename, unlink } from 'node:fs/promises';
import { dirname, basename, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { TextDecoder } from 'node:util';
import { parseUniqueJson } from './json.js';
import { parseCanonicalLino } from './lino.js';

export async function readJsonFile(path, maxBytes = 1_048_576) {
  return parseUniqueJson(await readTextFile(path, maxBytes));
}

// Config files may be JSON or canonical Links Notation (`.lino`).
export async function readConfigFile(path, maxBytes = 1_048_576) {
  const text = await readTextFile(path, maxBytes);
  return /\.lino$/i.test(path)
    ? parseCanonicalLino(text)
    : parseUniqueJson(text);
}

export async function readTextFile(path, maxBytes = 1_048_576) {
  // O_NOFOLLOW protects the opened entry on POSIX; lstat also covers Windows.
  if (!(await lstat(path)).isFile()) {
    throw new Error(`Expected a regular JSON file: ${path}`);
  }
  const file = await open(
    path,
    constants.O_RDONLY |
      (constants.O_NOFOLLOW || 0) |
      (constants.O_NONBLOCK || 0)
  );
  try {
    if (!(await file.stat()).isFile() || (await file.stat()).size > maxBytes) {
      throw new Error(
        `JSON file exceeds byte budget or is not regular: ${path}`
      );
    }
    const bytes = Buffer.alloc(maxBytes + 1);
    let count = 0;
    while (count < bytes.length) {
      const result = await file.read(bytes, count, bytes.length - count, null);
      if (!result.bytesRead) {
        break;
      }
      count += result.bytesRead;
    }
    if (count > maxBytes) {
      throw new Error(`JSON file exceeds byte budget: ${path}`);
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(
      bytes.subarray(0, count)
    );
  } finally {
    await file.close();
  }
}

export async function atomicWriteFile(path, content, { create = false } = {}) {
  try {
    if (!(await lstat(path)).isFile()) {
      throw new Error(`Refusing to replace a non-regular file: ${path}`);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
  const temporary = join(
    dirname(path),
    `.${basename(path)}.${randomUUID()}.tmp`
  );
  let file;
  let created = false;
  try {
    file = await open(temporary, 'wx', 0o600);
    created = true;
    await file.writeFile(content);
    await file.sync();
    await file.close();
    file = undefined;
    // Linking implements exclusive creation without a check/write race.
    if (create) {
      await link(temporary, path);
    } else {
      await rename(temporary, path);
    }
  } finally {
    await file?.close();
    if (created) {
      await unlink(temporary).catch((error) => {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      });
    }
  }
}

export async function withFileLock(path, operation) {
  const lockPath = join(dirname(path), `.${basename(path)}.quality-lock`);
  const lock = await open(lockPath, 'wx', 0o600);
  try {
    return await operation();
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}
