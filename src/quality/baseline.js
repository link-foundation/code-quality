import { hash } from './syntax.js';
import { safePath, requireObject } from './config.js';
import { gitOutput, resolveCommit } from './git.js';

function validateMetrics(metrics) {
  requireObject(metrics, 'Metrics');
  if (Object.keys(metrics).length > 100) {
    throw new Error('At most 100 metrics are supported');
  }
  for (const value of Object.values(metrics)) {
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > 100
    ) {
      throw new Error('Metrics must be finite percentages in [0, 100]');
    }
  }
}

function validateStrings(values, name, maximum, paths = false) {
  if (
    !Array.isArray(values) ||
    values.length > maximum ||
    values.some(
      (value) => typeof value !== 'string' || !value || value.length > 4096
    ) ||
    new Set(values).size !== values.length
  ) {
    throw new Error(`${name} must contain bounded unique nonempty strings`);
  }
  if (paths) {
    values.forEach(safePath);
  }
}

function validMethod(method) {
  return (
    typeof method === 'string' &&
    method.trim().length > 0 &&
    method.length <= 4096
  );
}

function validateReport(report) {
  if (
    report?.schemaVersion !== 1 ||
    !Array.isArray(report.files) ||
    !report.files.length ||
    !Array.isArray(report.findings) ||
    !validMethod(report.method)
  ) {
    throw new Error('Expected a nonempty code-quality report');
  }
  validateStrings(
    report.files.map((entry) => entry?.path),
    'Report files',
    1000,
    true
  );
  validateStrings(
    report.findings.map((entry) => entry?.fingerprint),
    'Report findings',
    10_000
  );
  if (report.incomplete || report.errors?.length) {
    throw new Error('Incomplete or failed reports cannot establish a baseline');
  }
  validateMetrics(report.metrics ?? {});
}

export function validateBaseline(baseline) {
  requireObject(baseline, 'Baseline');
  if (
    baseline.schemaVersion !== 1 ||
    !validMethod(baseline.method) ||
    !Array.isArray(baseline.files) ||
    !baseline.files.length ||
    Object.keys(baseline).some(
      (key) =>
        !['schemaVersion', 'method', 'files', 'findings', 'metrics'].includes(
          key
        )
    )
  ) {
    throw new Error('Invalid baseline');
  }
  validateStrings(baseline.files, 'Baseline files', 1000, true);
  validateStrings(baseline.findings, 'Baseline findings', 10_000);
  validateMetrics(baseline.metrics);
  return baseline;
}

export async function readGitBaseline(
  root,
  { ref, path = 'quality-baseline.json' } = {}
) {
  safePath(path);
  let commit;
  try {
    commit = await resolveCommit(root, ref);
  } catch (error) {
    throw new Error(
      `Cannot resolve baseline revision ${JSON.stringify(ref)}; fetch that revision first: ${error.message}`,
      { cause: error }
    );
  }
  const prefix = await gitOutput(root, ['rev-parse', '--show-prefix']);
  const repositoryPath = `${prefix.replace(/\n$/, '')}${path}`;
  safePath(repositoryPath);
  const tree = await gitOutput(root, [
    'ls-tree',
    '-z',
    '--long',
    '--full-tree',
    commit,
    '--',
    repositoryPath,
  ]);
  const entries = tree.split('\0').filter(Boolean);
  if (entries.length !== 1) {
    throw new Error(`Missing committed baseline: ${ref}:${repositoryPath}`);
  }
  const tab = entries[0].indexOf('\t');
  const [mode, type, blob, size] = entries[0].slice(0, tab).trim().split(/\s+/);
  if (
    !['100644', '100755'].includes(mode) ||
    type !== 'blob' ||
    entries[0].slice(tab + 1) !== repositoryPath
  ) {
    throw new Error('Committed baseline must be a regular Git file');
  }
  if (!Number.isSafeInteger(Number(size)) || Number(size) > 1_048_576) {
    throw new Error('Committed baseline exceeds byte budget');
  }
  return validateBaseline(
    JSON.parse(await gitOutput(root, ['cat-file', 'blob', blob], 1_048_576))
  );
}

export function createBaseline(report) {
  validateReport(report);
  return {
    schemaVersion: 1,
    method: report.method,
    files: report.files.map((entry) => entry.path).sort(),
    findings: report.findings.map((entry) => entry.fingerprint).sort(),
    metrics: { ...report.metrics },
  };
}

function metricFailures(report, baseline) {
  const failures = [];
  validateMetrics(baseline.metrics);
  for (const [key, floor] of Object.entries(baseline.metrics)) {
    if (
      !Number.isFinite(report.metrics?.[key]) ||
      report.metrics[key] < floor
    ) {
      failures.push(`${key} fell below ${floor}`);
    }
  }
  return failures;
}

export function checkBaseline(report, baseline) {
  validateReport(report);
  validateBaseline(baseline);
  const failures = metricFailures(report, baseline);
  if (report.method !== baseline.method) {
    failures.push(
      'Measurement method changed; an explicit baseline migration is required'
    );
  }
  if (
    JSON.stringify(report.files.map((entry) => entry.path).sort()) !==
    JSON.stringify([...baseline.files].sort())
  ) {
    failures.push(
      'File inventory changed; an explicit baseline migration is required'
    );
  }
  const accepted = new Set(baseline.findings);
  for (const finding of report.findings) {
    if (!accepted.has(finding.fingerprint)) {
      failures.push(`New finding: ${finding.path} ${finding.ruleId}`);
    }
  }
  return { passed: failures.length === 0, failures };
}

export function updateBaseline(report, previous) {
  const gate = checkBaseline(report, previous);
  if (!gate.passed) {
    throw new Error(`Baseline cannot be weakened: ${gate.failures.join('; ')}`);
  }
  return createBaseline(report);
}

export function measurementFingerprint(files, methodology) {
  return hash(
    JSON.stringify({
      files: files.map(({ path, hash: digest }) => [path, digest]).sort(),
      methodology,
    })
  );
}
