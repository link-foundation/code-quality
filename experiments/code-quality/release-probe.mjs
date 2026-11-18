// Exercise all pending release fragments without modifying the shared checkout.
import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runProcess } from '../../src/quality/process.js';

const root = await mkdtemp(join(tmpdir(), 'code-quality-release-'));
try {
  for (const file of [
    'package.json',
    'package-lock.json',
    'deno.json',
    'deno.lock',
    '.prettierrc',
    'CHANGELOG.md',
    '.changeset',
  ]) {
    await cp(resolve(file), join(root, file), { recursive: true });
  }
  await symlink(
    resolve('node_modules'),
    join(root, 'node_modules'),
    'junction'
  );
  const before = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const result = await runProcess(
    'node',
    [resolve('scripts/changeset-version.mjs'), '--js-root', root],
    { cwd: root }
  );
  assert.equal(result.code, 0, result.stdout + result.stderr);
  const after = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  assert.equal(after.name, before.name);
  assert.notEqual(after.version, before.version);
  const lock = JSON.parse(
    await readFile(join(root, 'package-lock.json'), 'utf8')
  );
  assert.equal(lock.version, after.version);
  assert.equal(lock.packages[''].version, after.version);
  console.log(
    `All release fragments validated: ${before.version} -> ${after.version}`
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
