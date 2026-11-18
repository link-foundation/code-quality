import { hash } from './syntax.js';
import { safePath, requireObject } from './config.js';
import { gitOutput, resolveCommit } from './git.js';
import { parseUniqueJson } from './json.js';

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
  if (report.measurement?.stage && report.measurement.stage !== 'qa') {
    throw new Error('Independent shell stages cannot establish a QA baseline');
  }
  validateMetrics(report.metrics ?? {});
}

function validateMigrations(migrations) {
  if (!Array.isArray(migrations) || migrations.length > 100) {
    throw new Error('Baseline migrations must be a bounded audit history');
  }
  for (const entry of migrations) {
    requireObject(entry, 'Baseline migration');
    if (
      Object.keys(entry).sort().join(',') !== 'previous,reason' ||
      typeof entry.reason !== 'string' ||
      !entry.reason.trim() ||
      entry.reason.length > 1024 ||
      typeof entry.previous !== 'string' ||
      !/^[a-f0-9]{64}$/.test(entry.previous)
    ) {
      throw new Error('Invalid baseline migration audit record');
    }
  }
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
        ![
          'schemaVersion',
          'method',
          'files',
          'findings',
          'metrics',
          'migrations',
        ].includes(key)
    )
  ) {
    throw new Error('Invalid baseline');
  }
  validateStrings(baseline.files, 'Baseline files', 1000, true);
  validateStrings(baseline.findings, 'Baseline findings', 10_000);
  validateMetrics(baseline.metrics);
  if (baseline.migrations !== undefined) {
    validateMigrations(baseline.migrations);
  }
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
    parseUniqueJson(
      await gitOutput(root, ['cat-file', 'blob', blob], 1_048_576)
    )
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

function advanceBaseline(report, previous, migrate) {
  validateReport(report);
  validateBaseline(previous);
  if (
    migrate !== undefined &&
    (typeof migrate !== 'string' || !migrate.trim() || migrate.length > 1024)
  ) {
    throw new Error(
      'Migration requires a nonblank explanation of at most 1024 characters'
    );
  }
  const incompatible =
    report.method !== previous.method ||
    JSON.stringify(report.files.map((entry) => entry.path).sort()) !==
      JSON.stringify([...previous.files].sort());
  if (incompatible && migrate !== undefined) {
    const migrations = [
      ...(previous.migrations || []),
      {
        reason: migrate.trim(),
        previous: hash(JSON.stringify(previous)),
      },
    ];
    validateMigrations(migrations);
    return { ...createBaseline(report), migrations };
  }
  const gate = checkBaseline(report, previous);
  if (!gate.passed) {
    throw new Error(`Baseline cannot be weakened: ${gate.failures.join('; ')}`);
  }
  return {
    ...createBaseline(report),
    ...(previous.migrations ? { migrations: previous.migrations } : {}),
  };
}

export function updateBaseline(report, previous, { migrate, committed } = {}) {
  let target;
  if (committed) {
    try {
      target = advanceBaseline(report, committed, migrate);
    } catch (error) {
      throw new Error(`Committed baseline: ${error.message}`, { cause: error });
    }
  }
  const updated = advanceBaseline(report, previous, migrate);
  const migrations = [
    ...(target?.migrations || []),
    ...(updated.migrations || []),
  ];
  if (!migrations.length) {
    return updated;
  }
  const distinct = [
    ...new Map(
      migrations.map((entry) => [JSON.stringify(entry), entry])
    ).values(),
  ];
  validateMigrations(distinct);
  return { ...updated, migrations: distinct };
}

export function measurementFingerprint(files, methodology) {
  return hash(
    JSON.stringify({
      files: files.map(({ path, hash: digest }) => [path, digest]).sort(),
      methodology,
    })
  );
}
