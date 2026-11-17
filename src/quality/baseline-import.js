import { createBaseline, validateBaseline } from './baseline.js';
import { requireObject, safePath } from './config.js';
import { hash } from './syntax.js';

const schema =
  'https://raw.githubusercontent.com/ever-guild/quality-bash/v1.0.0-alpha.3/baseline.schema.json';

function fields(value, names, name) {
  requireObject(value, name);
  if (Object.keys(value).sort().join(',') !== [...names].sort().join(',')) {
    throw new Error(`Invalid quality-bash ${name} fields`);
  }
}

function text(value, name) {
  if (typeof value !== 'string' || !value.trim() || value.length > 4096) {
    throw new Error(`Invalid quality-bash ${name}`);
  }
}

function strings(value, name, maximum) {
  if (!Array.isArray(value) || !value.length || value.length > maximum) {
    throw new Error(`Invalid quality-bash ${name} inventory`);
  }
  value.forEach((entry) => text(entry, name));
  if (new Set(value).size !== value.length) {
    throw new Error(`Duplicate quality-bash ${name}`);
  }
}

function percent(value) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100 ||
    Math.abs(value * 100 - Math.round(value * 100)) > 1e-8
  ) {
    throw new Error(
      'quality-bash floors must be percentages with two decimal places'
    );
  }
}

// Validate the published interchange contract only. No upstream implementation
// or tests are involved, and method names never imply measurement equivalence.
export function validateQualityBashBaseline(value) {
  fields(
    value,
    ['$schema', 'files', 'method', 'coverage', 'mutation'],
    'baseline'
  );
  if (value.$schema !== schema) {
    throw new Error('Unsupported quality-bash baseline schema');
  }
  strings(value.files, 'files', 1000);
  value.files.forEach(safePath);
  fields(value.coverage, ['linePercent'], 'coverage');
  fields(value.mutation, ['score'], 'mutation');
  percent(value.coverage.linePercent);
  percent(value.mutation.score);
  fields(value.method, ['coverage', 'mutation', 'tools'], 'method');
  fields(value.method.coverage, ['algorithm'], 'coverage method');
  text(value.method.coverage.algorithm, 'coverage algorithm');
  fields(
    value.method.mutation,
    ['algorithm', 'operators', 'parser'],
    'mutation method'
  );
  text(value.method.mutation.algorithm, 'mutation algorithm');
  strings(value.method.mutation.operators, 'mutation operators', 100);
  fields(value.method.mutation.parser, ['name', 'version'], 'parser');
  Object.values(value.method.mutation.parser).forEach((entry) =>
    text(entry, 'parser')
  );
  fields(value.method.tools, ['bash', 'bats', 'shellcheck', 'kcov'], 'tools');
  Object.values(value.method.tools).forEach((entry) =>
    text(entry, 'tool version')
  );
  return value;
}

export function importQualityBashBaseline(report, source, { reason } = {}) {
  validateQualityBashBaseline(source);
  if (typeof reason !== 'string' || !reason.trim() || reason.length > 900) {
    throw new Error(
      'Import requires a methodology migration reason of at most 900 characters'
    );
  }
  if (!report?.passed || report.measurement?.stage !== 'qa') {
    throw new Error('Import requires fresh complete passing shell QA');
  }
  const baseline = createBaseline(report);
  if (
    JSON.stringify(baseline.files) !== JSON.stringify([...source.files].sort())
  ) {
    throw new Error(
      'Imported baseline file inventory must match fresh shell QA'
    );
  }
  for (const [metric, floor] of [
    ['linePercent', source.coverage.linePercent],
    ['mutationScore', source.mutation.score],
  ]) {
    if (
      !Number.isFinite(baseline.metrics[metric]) ||
      baseline.metrics[metric] < floor
    ) {
      throw new Error(
        `Import would weaken the quality-bash ${metric} floor: ${floor}`
      );
    }
  }
  baseline.migrations = [
    {
      previous: hash(JSON.stringify(source)),
      reason: `quality-bash schema import; independent methodology: ${reason.trim()}`,
    },
  ];
  return validateBaseline(baseline);
}
