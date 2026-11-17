import { readdir, lstat, readFile, realpath } from 'node:fs/promises';
import { resolve, relative, join, sep } from 'node:path';
import { detectLanguage } from './languages.js';
import { validateConfig, safePath } from './config.js';
import { analyzeFiles } from './core.js';
import { runProcess } from './process.js';

const ignored = new Set([
  '.git',
  'node_modules',
  'vendor',
  'target',
  'dist',
  'build',
  'coverage',
  '.venv',
  '__pycache__',
]);
const excluded = (path, prefixes) =>
  path.split('/').some((part) => ignored.has(part)) ||
  prefixes.some(
    (prefix) =>
      path === prefix || path.startsWith(`${prefix.replace(/\/$/, '')}/`)
  );

async function enumerate(root, config) {
  const result = [];
  const pending = [''];
  let visited = 0;
  while (pending.length) {
    const dir = pending.pop();
    for (const entry of await readdir(join(root, dir), {
      withFileTypes: true,
    })) {
      if (++visited > 100_000) {
        throw new Error('Directory entry budget exceeded');
      }
      const path = dir ? `${dir}/${entry.name}` : entry.name;
      if (excluded(path, config.exclude)) {
        continue;
      }
      if (entry.isSymbolicLink()) {
        throw new Error(`Symlinks are unsupported: ${path}`);
      }
      if (entry.isDirectory()) {
        pending.push(path);
      } else if (detectLanguage(path)) {
        if (!entry.isFile()) {
          throw new Error(`Not a regular source file: ${path}`);
        }
        result.push(path);
      }
      if (result.length > config.limits.maxFiles) {
        throw new Error('File count budget exceeded');
      }
    }
  }
  return result;
}

export async function readProject(root, options = {}) {
  const config = validateConfig(options.config);
  const absolute = await realpath(resolve(root));
  if (!(await lstat(absolute)).isDirectory()) {
    throw new Error('Project root must be a directory');
  }
  let paths;
  const git = await runProcess('git', [
    '-C',
    absolute,
    'rev-parse',
    '--show-toplevel',
  ]).catch((error) => {
    if (error.code === 'ENOENT') {
      return { code: 1 };
    }
    throw error;
  });
  if (git.code === 0) {
    const files = await runProcess('git', [
      '-C',
      absolute,
      'ls-files',
      '-z',
      '--cached',
      '--others',
      '--exclude-standard',
      '--',
      '.',
    ]);
    if (files.code !== 0) {
      throw new Error(`git ls-files failed: ${files.stderr}`);
    }
    paths = [...new Set(files.stdout.split('\0').filter(Boolean))].filter(
      (path) => !excluded(path, config.exclude) && detectLanguage(path)
    );
  } else {
    paths = await enumerate(absolute, config);
  }
  if (paths.length > config.limits.maxFiles) {
    throw new Error('File count budget exceeded');
  }
  const files = [];
  let bytes = 0;
  for (const path of paths.sort()) {
    safePath(path);
    const full = join(absolute, path);
    // Resolve and inspect every component: a symlinked parent must not escape root.
    const resolved = await realpath(full);
    if (
      resolved !== full ||
      relative(absolute, resolved).split(sep).includes('..')
    ) {
      throw new Error(`Symlinks or escaped paths are unsupported: ${path}`);
    }
    const stat = await lstat(full);
    if (!stat.isFile()) {
      throw new Error(`Not a regular file: ${path}`);
    }
    bytes += stat.size;
    if (
      stat.size > config.limits.maxFileBytes ||
      bytes > config.limits.maxTotalBytes
    ) {
      throw new Error(`${path}: byte budget exceeded`);
    }
    const content = await readFile(full, 'utf8');
    files.push({ path, content });
  }
  return files;
}

export async function analyzeProject(root, options = {}) {
  return analyzeFiles(await readProject(root, options), options);
}
