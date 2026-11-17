import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { safePath } from './config.js';
import { hash } from './syntax.js';

const ignored = new Set([
  '.git',
  'node_modules',
  'target',
  'dist',
  'coverage',
  'quality-reports',
]);

export function workspaceExcluded(path, prefixes) {
  return (
    path.split('/').some((part) => ignored.has(part)) ||
    prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
  );
}

async function fileHash(path, budget) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(path, { highWaterMark: 65_536 })) {
    budget.bytes += chunk.length;
    if (budget.bytes > 33_554_432) {
      throw new Error('Shell workspace byte budget exceeded');
    }
    digest.update(chunk);
  }
  return digest.digest('hex');
}

async function workspaceRecord(root, path, budget) {
  const stat = await lstat(join(root, path));
  if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) {
    throw new Error(`Unsupported workspace entry: ${path}`);
  }
  const record = { path, mode: stat.mode & 0o777 };
  if (stat.isDirectory()) {
    return { ...record, kind: 'directory' };
  }
  budget.paths.push(path);
  budget.declaredBytes += stat.size;
  if (budget.paths.length > 2000 || budget.declaredBytes > 33_554_432) {
    throw new Error('Shell workspace copy budget exceeded');
  }
  return {
    ...record,
    kind: 'file',
    size: stat.size,
    sha256: await fileHash(join(root, path), budget),
  };
}

// Hash every file copied into mutants, including data and unselected helpers.
// Generated report trees and the existing dependency/build exclusions are shared
// with copyWorkspace so the observed inputs match the isolated execution inputs.
export async function captureWorkspace(
  root,
  excludedPaths = [],
  selected = []
) {
  if (!Array.isArray(excludedPaths) || excludedPaths.length > 1000) {
    throw new Error('Workspace exclusions must be a bounded array of paths');
  }
  excludedPaths.forEach(safePath);
  const pending = [''];
  const entries = [];
  const budget = { bytes: 0, declaredBytes: 0, paths: [] };
  let visited = 0;
  let metadataBytes = 0;
  while (pending.length) {
    const directory = pending.pop();
    for (const entry of await readdir(join(root, directory))) {
      if (++visited > 100_000) {
        throw new Error('Shell workspace entry budget exceeded');
      }
      const path = directory ? `${directory}/${entry}` : entry;
      if (workspaceExcluded(path, excludedPaths)) {
        continue;
      }
      safePath(path);
      const record = await workspaceRecord(root, path, budget);
      if (record.kind === 'directory') {
        pending.push(path);
      }
      metadataBytes += Buffer.byteLength(JSON.stringify(record));
      if (metadataBytes > 4_194_304) {
        throw new Error('Shell workspace metadata budget exceeded');
      }
      entries.push(record);
    }
  }
  if (selected.some((path) => !budget.paths.includes(path))) {
    throw new Error('Workspace exclusions hide selected shell inputs');
  }
  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return {
    sha256: hash(JSON.stringify(entries)),
    files: budget.paths.length,
    bytes: budget.bytes,
  };
}

export async function assertWorkspaceUnchanged(root, previous, exclusions) {
  const current = await captureWorkspace(root, exclusions);
  if (current.sha256 !== previous.sha256) {
    throw new Error('Shell workspace inputs changed during measurement');
  }
}
