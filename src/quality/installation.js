import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { readJsonFile } from './persistence.js';

async function fileHash(path, budget) {
  const size = (await lstat(path)).size;
  budget.bytes += size;
  // The checksum-pinned aarch64 ShellCheck executable is 55,043,352 bytes.
  // Keep a finite per-file limit that admits that actual distribution.
  if (size > 67_108_864 || budget.bytes > 134_217_728) {
    throw new Error('Tool installation byte budget exceeded');
  }
  const file = await open(
    path,
    constants.O_RDONLY |
      (constants.O_NOFOLLOW || 0) |
      (constants.O_NONBLOCK || 0)
  );
  const hash = createHash('sha256');
  let bytes = 0;
  try {
    const opened = await file.stat();
    if (!opened.isFile() || opened.size !== size) {
      throw new Error('Tool installation changed during fingerprinting');
    }
    for await (const chunk of file.createReadStream()) {
      bytes += chunk.length;
      if (bytes > size) {
        throw new Error('Tool installation changed during fingerprinting');
      }
      hash.update(chunk);
    }
  } finally {
    await file.close();
  }
  if (bytes !== size) {
    throw new Error('Tool installation changed during fingerprinting');
  }
  return hash.digest('hex');
}

export async function inspectShellInstallation(
  directory,
  prefix = '',
  budget = { count: 0, bytes: 0 }
) {
  if (prefix.split('/').length > 16) {
    throw new Error('Tool installation depth budget exceeded');
  }
  const files = [];
  for (const entry of await readdir(join(directory, prefix), {
    withFileTypes: true,
  })) {
    if (++budget.count > 4000) {
      throw new Error('Tool installation entry budget exceeded');
    }
    if (
      budget.excludeReceipt &&
      !prefix &&
      entry.name === 'installation.json'
    ) {
      continue;
    }
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    const path = join(directory, name);
    if (entry.isDirectory()) {
      files.push(...(await inspectShellInstallation(directory, name, budget)));
    } else if (entry.isFile()) {
      files.push({ path: name, sha256: await fileHash(path, budget) });
    } else {
      throw new Error(
        `Tool installation contains a link or special file: ${name}`
      );
    }
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export function installationFingerprint(files) {
  return createHash('sha256').update(JSON.stringify(files)).digest('hex');
}

export async function verifyShellInstallation(root) {
  const receipt = await readJsonFile(join(root, 'installation.json'));
  if (receipt.schemaVersion !== 1 || !Array.isArray(receipt.files)) {
    throw new Error('Invalid managed shell tool receipt');
  }
  const files = await inspectShellInstallation(root, '', {
    count: 0,
    bytes: 0,
    excludeReceipt: true,
  });
  if (JSON.stringify(files) !== JSON.stringify(receipt.files)) {
    throw new Error(
      'Managed shell installation changed: file inventory or content mismatch'
    );
  }
  return installationFingerprint(files);
}
