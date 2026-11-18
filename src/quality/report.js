import { mkdir, mkdtemp, lstat } from 'node:fs/promises';
import { join, basename, dirname } from 'node:path';
import { atomicWriteFile } from './persistence.js';
import { formatReport } from './report-format.js';
import { validateArtifacts } from './artifacts.js';

export { formatReport } from './report-format.js';

function reportFiles(current, error) {
  const diagnostic = error
    ? Object.fromEntries(
        ['message', 'command', 'code', 'signal', 'stdout', 'stderr'].map(
          (key) => [key, error[key] ?? null]
        )
      )
    : null;
  const files = {
    'report.json': `${JSON.stringify(current ?? null, null, 2)}\n`,
    'error.json': `${JSON.stringify(diagnostic, null, 2)}\n`,
    'report.txt': current
      ? formatReport(current)
      : `Incomplete check: ${error?.message || 'No report'}\n`,
  };
  if (current) {
    files['report.sarif'] = formatReport(current, 'sarif');
    files['report.lino'] = formatReport(current, 'lino');
  }
  if (error && current) {
    files['report.txt'] += `Incomplete check: ${error.message}\n`;
  }
  return files;
}

export async function saveReport(
  report,
  directory,
  { error, artifacts = {} } = {}
) {
  const raw = validateArtifacts(artifacts);
  await mkdir(directory, { recursive: true });
  if (!(await lstat(directory)).isDirectory()) {
    throw new Error('Reports path must be a directory, not a symlink');
  }
  // Separate owned runs preserve prior evidence and prevent concurrent writers
  // from mixing JSON, text and SARIF from different measurements.
  const run = await mkdtemp(join(directory, 'run-'));
  const current =
    report && error ? { ...report, passed: false, incomplete: true } : report;
  const files = reportFiles(current, error);
  for (const [name, content] of Object.entries(files)) {
    if (Buffer.byteLength(content) > 16_777_216) {
      throw new Error('Persistent report exceeds byte budget');
    }
    await atomicWriteFile(join(run, name), content, { create: true });
  }
  for (const [name, content] of raw) {
    const destination = join(run, name);
    await mkdir(dirname(destination), { recursive: true });
    await atomicWriteFile(destination, content, { create: true });
  }
  const manifest = {
    schemaVersion: 1,
    run: basename(run),
    complete: Boolean(current && !current.incomplete && !error),
    passed: Boolean(current?.passed && !current.incomplete && !error),
    files: [...Object.keys(files), ...raw.map(([name]) => name)],
  };
  const content = `${JSON.stringify(manifest, null, 2)}\n`;
  await atomicWriteFile(join(run, 'manifest.json'), content, { create: true });
  await atomicWriteFile(join(directory, 'latest.json'), content);
  return manifest;
}
