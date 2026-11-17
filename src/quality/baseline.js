import { hash } from './syntax.js';

function validateMetrics(metrics) {
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

function validateReport(report) {
  if (
    report?.schemaVersion !== 1 ||
    !Array.isArray(report.files) ||
    !report.files.length ||
    !Array.isArray(report.findings) ||
    typeof report.method !== 'string'
  ) {
    throw new Error('Expected a nonempty code-quality report');
  }
  if (report.incomplete || report.errors?.length) {
    throw new Error('Incomplete or failed reports cannot establish a baseline');
  }
  validateMetrics(report.metrics || {});
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
  if (
    baseline?.schemaVersion !== 1 ||
    !Array.isArray(baseline.files) ||
    !Array.isArray(baseline.findings) ||
    !baseline.metrics ||
    typeof baseline.metrics !== 'object'
  ) {
    throw new Error('Invalid baseline');
  }
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
