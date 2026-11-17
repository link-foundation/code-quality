// Targeted kcov diagnosis, without installing tools globally or changing sources.
// Each probe has finite input, a 5s process budget and a 256 MiB native memory cap.
import { mkdtemp, cp, rm, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { URL } from 'node:url';
import { runProcess } from '../../src/quality/process.js';

const root = await mkdtemp(join(tmpdir(), 'code-quality-kcov-probe-'));
try {
  await cp(
    new URL('../../examples/code-quality/shell/', import.meta.url),
    root,
    { recursive: true }
  );
  const options = process.argv
    .slice(2)
    .map((option) => (option === '--trace' ? '--debug=31' : option));
  console.log(
    JSON.stringify({
      control: await runProcess('bats', ['--tap', 'choose.bats'], {
        cwd: root,
        timeoutMs: 5000,
      }),
    })
  );
  const result = await runProcess(
    'bash',
    [
      '-c',
      'ulimit -v 262144; exec "$@"',
      'kcov-probe',
      'kcov',
      `--include-path=${join(root, 'choose.sh')}`,
      ...options,
      join(root, 'coverage'),
      'bats',
      '--tap',
      'choose.bats',
    ],
    { cwd: root, timeoutMs: 5000 }
  );
  console.log(JSON.stringify(result));
  const files = await readdir(join(root, 'coverage'), { recursive: true });
  for (const file of files.filter(
    (path) => path.endsWith('codecov.json') || path.endsWith('coverage.json')
  )) {
    console.log(
      JSON.stringify({
        file,
        data: JSON.parse(await readFile(join(root, 'coverage', file), 'utf8')),
      })
    );
  }
} catch (error) {
  console.error(
    JSON.stringify({
      message: error.message,
      stdout: error.stdout,
      stderr: error.stderr,
    })
  );
  process.exitCode = 1;
} finally {
  await rm(root, { recursive: true, force: true });
}
