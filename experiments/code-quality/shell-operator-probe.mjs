// Original finite black-box fixture; competitor source and tests are never read.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { shellMutants } from '../../src/quality/index.js';
import { runProcess } from '../../src/quality/process.js';
import { hash } from '../../src/quality/syntax.js';

const binary = resolve(process.argv[2]);
assert.equal(
  hash(await readFile(binary)),
  '6ef1bba6219909713ee6a068d3f9c437c93c701f5271092c8fb4816d6aec627d'
);
const source = `#!/usr/bin/env bash
probe() {
  printf '%s\\n' "$((7 + 3))" "$((7 - 3))" "$((7 * 3))" "$((7 / 3))" "$((7 % 3))" "$((7 ** 3))"
  printf '%s\\n' "$((7 < 3))" "$((7 <= 3))" "$((7 > 3))" "$((7 >= 3))" "$((7 == 3))" "$((7 != 3))"
  printf '%s\\n' "$((7 & 3))" "$((7 | 3))" "$((7 ^ 3))" "$((7 << 3))" "$((7 >> 3))"
  printf '%s\\n' "$((7 && 3))" "$((7 || 3))" "$((! 7))" "$((~ 7))" "$((- 7))" "$((+ 7))"
  local value=7
  printf '%s\\n' "$((value++))" "$((++value))" "$((value--))" "$((--value))"
  [[ 7 -gt 3 ]] && printf gt
  [[ word == word ]] && printf equal
  [[ -n word ]] && printf nonempty
  [[ -z '' ]] && printf empty
}
`;
const test = `#!/usr/bin/env bats
@test "observe operators without treating outcomes as assertions" {
  source "\${BATS_TEST_DIRNAME}/probe.sh"
  run probe
  [ "$status" -eq 0 ]
}
`;
const root = await mkdtemp(join(tmpdir(), 'quality-operator-probe-'));
try {
  await writeFile(join(root, 'probe.sh'), source);
  await writeFile(join(root, 'probe.bats'), test);
  const result = await runProcess(
    binary,
    ['mutation', '--root', root, '--jobs', '1', '--timeout', '10s'],
    {
      env: { ...process.env, GOMAXPROCS: '1', GOMEMLIMIT: '128MiB' },
      timeoutMs: 120_000,
      maxOutputBytes: 65_536,
    }
  );
  const report = JSON.parse(
    await readFile(join(root, 'quality-reports', 'mutation.json'), 'utf8')
  );
  let native;
  try {
    native = await shellMutants({ path: 'probe.sh', content: source });
  } catch (error) {
    native = { error: error.message };
  }
  console.log(
    JSON.stringify(
      {
        source,
        test,
        released: { result, report },
        native,
      },
      null,
      2
    ).replaceAll(root, '$FIXTURE')
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
