import { access, realpath, stat } from 'node:fs/promises';
import { createReadStream, constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { delimiter, resolve } from 'node:path';

// Version output alone can be uninformative (the upstream kcov 42 archive says
// only "kcov"). Hash the actual entry executable too, with bounded reads.
export async function executableHash(command, cwd = process.cwd()) {
  const suffixes =
    process.platform === 'win32'
      ? ['', ...(process.env.PATHEXT || '.EXE;.COM').split(';')]
      : [''];
  const paths = /[/\\]/.test(command)
    ? [resolve(cwd, command)]
    : (process.env.PATH || '')
        .split(delimiter)
        .flatMap((directory) =>
          suffixes.map((suffix) =>
            resolve(cwd, directory || '.', command + suffix)
          )
        );
  if (paths.length > 4096) {
    throw new Error('Executable search budget exceeded');
  }
  let executable;
  for (const path of paths) {
    try {
      await access(path, constants.X_OK);
      if ((await stat(path)).isFile()) {
        executable = await realpath(path);
        break;
      }
    } catch {
      /* Continue PATH lookup. */
    }
  }
  if (!executable) {
    throw new Error(`Cannot resolve executable: ${command}`);
  }
  const limit = 134_217_728;
  if ((await stat(executable)).size > limit) {
    throw new Error('Executable byte budget exceeded');
  }
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of createReadStream(executable, {
    highWaterMark: 65_536,
  })) {
    bytes += chunk.length;
    if (bytes > limit) {
      throw new Error('Executable byte budget exceeded');
    }
    hash.update(chunk);
  }
  return hash.digest('hex');
}
