import { cp, lstat, mkdtemp, readdir, readlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { URL } from 'node:url';
import { join } from 'node:path';
import { shellQuality } from '../../src/quality/index.js';
const root = await mkdtemp(join(tmpdir(), 'code-quality-artifact-inventory-'));
try {
  await cp(
    new URL('../../examples/code-quality/shell/', import.meta.url),
    root,
    { recursive: true }
  );
  await shellQuality(root, {
    stage: 'coverage',
    onCoverage: async (directory) => {
      async function visit(local = '') {
        for (const name of (await readdir(join(directory, local))).sort()) {
          const path = join(local, name);
          const stat = await lstat(join(directory, path));
          console.log(
            JSON.stringify({
              path,
              size: stat.size,
              type: stat.isDirectory()
                ? 'directory'
                : stat.isFile()
                  ? 'file'
                  : stat.isSymbolicLink()
                    ? 'symlink'
                    : 'special',
              ...(stat.isSymbolicLink()
                ? { target: await readlink(join(directory, path)) }
                : {}),
            })
          );
          if (stat.isDirectory()) {
            await visit(path);
          }
        }
      }
      await visit();
    },
  });
} finally {
  await rm(root, { recursive: true, force: true });
}
