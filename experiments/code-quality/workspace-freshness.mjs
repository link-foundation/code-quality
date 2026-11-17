import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { URL } from 'node:url';
import { shellQuality } from '../../src/quality/index.js';

export async function verifyWorkspaceFreshness() {
  const root = await mkdtemp(join(tmpdir(), 'quality-helper-freshness-'));
  try {
    await cp(
      new URL(
        '../../examples/code-quality/shell-measurement/arithmetic/',
        import.meta.url
      ),
      root,
      { recursive: true }
    );
    const source = await readFile(join(root, 'choose.sh'), 'utf8');
    await writeFile(join(root, 'expected.txt'), 'before\n');
    await writeFile(
      join(root, 'choose.bats'),
      [
        '#!/usr/bin/env bats',
        '@test "passing control changes its helper data" {',
        '  source "${BATS_TEST_DIRNAME}/choose.sh"',
        '  run choose 7',
        '  [ "$output" = 10 ]',
        '  printf "after\\n" > "${BATS_TEST_DIRNAME}/expected.txt"',
        '}',
        '',
      ].join('\n')
    );
    await assert.rejects(shellQuality(root), /workspace inputs changed/);
    assert.equal(await readFile(join(root, 'expected.txt'), 'utf8'), 'after\n');
    assert.equal(await readFile(join(root, 'choose.sh'), 'utf8'), source);
    return 'Real passing Bats control changed helper data; QA refused a score';
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
