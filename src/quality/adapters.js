import { isAbsolute, relative, resolve, sep } from 'node:path';
import { safePath } from './config.js';
import { runProcess } from './process.js';

// These are integration recipes, not claims that those analyzers are reimplemented.
export const toolRecipes = Object.freeze({
  javascript: ['eslint', ['.', '--format', 'json'], 'eslint'],
  typescript: ['eslint', ['.', '--format', 'json'], 'eslint'],
  rust: [
    'cargo',
    ['clippy', '-j', '1', '--message-format=json', '--', '-D', 'warnings'],
    'cargo',
  ],
  python: ['ruff', ['check', '.', '--output-format', 'json'], 'ruff'],
  go: ['golangci-lint', ['run', '--output.json.path=stdout'], 'golangci'],
  csharp: ['dotnet', ['format', '--verify-no-changes'], 'exit'],
  java: ['mvn', ['--batch-mode', 'verify'], 'exit'],
  c: ['cppcheck', ['--error-exitcode=1', '.'], 'exit'],
  cpp: ['cppcheck', ['--error-exitcode=1', '.'], 'exit'],
  php: ['phpstan', ['analyse', '--error-format=json'], 'phpstan'],
  cmake: ['cmake-lint', ['CMakeLists.txt'], 'exit'],
  bash: ['shellcheck', ['--format=json', '--external-sources'], 'shellcheck'],
});

function validFinding(entry, id) {
  const path = safePath(entry.path);
  const line = entry.line ?? 1;
  const column = entry.column ?? 1;
  if (
    typeof entry.message !== 'string' ||
    !entry.message ||
    !['note', 'warning', 'error'].includes(entry.severity) ||
    !Number.isInteger(line) ||
    line < 1 ||
    !Number.isInteger(column) ||
    column < 1
  ) {
    throw new Error(`Malformed finding from ${id}`);
  }
  return {
    path,
    line,
    column,
    message: entry.message,
    severity: entry.severity,
    ruleId: `${id}/${entry.ruleId || 'diagnostic'}`,
  };
}

function sarifFindings(data) {
  if (
    data?.version !== '2.1.0' ||
    !Array.isArray(data.runs) ||
    !data.runs.length
  ) {
    throw new Error('Invalid SARIF report');
  }
  return data.runs.flatMap((run) => {
    if (!Array.isArray(run.results)) {
      throw new Error('SARIF run needs results');
    }
    if (
      run.invocations?.some(
        (invocation) => invocation.executionSuccessful === false
      )
    ) {
      throw new Error('SARIF analyzer execution failed');
    }
    return run.results.map((entry) => {
      const location = entry.locations?.[0]?.physicalLocation;
      return {
        path: decodeURIComponent(location?.artifactLocation?.uri || ''),
        line: location?.region?.startLine,
        column: location?.region?.startColumn,
        message: entry.message?.text,
        ruleId: entry.ruleId,
        severity: entry.level || 'warning',
      };
    });
  });
}

function eslintFindings(data) {
  return data.flatMap((file) => {
    if (!Array.isArray(file.messages)) {
      throw new Error('ESLint file needs messages');
    }
    return file.messages.map((entry) => ({
      path: file.filePath,
      line: entry.line,
      column: entry.column,
      message: entry.message,
      ruleId: entry.ruleId || 'parse',
      severity: entry.severity === 2 ? 'error' : 'warning',
    }));
  });
}

function phpstanFindings(data) {
  if (!data?.files || typeof data.files !== 'object') {
    throw new Error('Invalid PHPStan report');
  }
  if (data.errors?.length) {
    throw new Error(`PHPStan analysis failed: ${data.errors.join('; ')}`);
  }
  return Object.entries(data.files).flatMap(([path, file]) =>
    file.messages.map((entry) => ({
      path,
      line: entry.line,
      message: entry.message,
      ruleId: entry.identifier,
      severity: 'error',
    }))
  );
}

function cargoFindings(data) {
  return data
    .filter((entry) => entry.reason === 'compiler-message')
    .flatMap(({ message }) => {
      if (message.level === 'failure-note') {
        return [];
      }
      const span = message.spans?.find((entry) => entry.is_primary);
      if (!span) {
        throw new Error('Cargo diagnostic lacks a source span');
      }
      return [
        {
          path: span.file_name,
          line: span.line_start,
          column: span.column_start,
          message: message.message,
          ruleId: message.code?.code || 'compiler',
          severity: message.level === 'error' ? 'error' : 'warning',
        },
      ];
    });
}

const readers = {
  sarif: sarifFindings,
  eslint: eslintFindings,
  phpstan: phpstanFindings,
  cargo: cargoFindings,
  golangci: (data) => {
    if (!Array.isArray(data?.Issues)) {
      throw new Error('golangci-lint report needs Issues');
    }
    return data.Issues.map((entry) => ({
      path: entry.Pos?.Filename,
      line: entry.Pos?.Line,
      column: entry.Pos?.Column,
      message: entry.Text,
      ruleId: entry.FromLinter,
      severity: 'warning',
    }));
  },
  shellcheck: (data) =>
    data.map((entry) => ({
      path: entry.file.replace(/^\.\//, ''),
      line: entry.line,
      column: entry.column,
      message: entry.message,
      ruleId: `SC${entry.code}`,
      severity: ['style', 'info'].includes(entry.level) ? 'note' : entry.level,
    })),
  ruff: (data) =>
    data.map((entry) => ({
      path: entry.filename,
      line: entry.location?.row,
      column: entry.location?.column,
      message: entry.message,
      ruleId: entry.code,
      severity: 'warning',
    })),
  json: (data) => {
    if (!Array.isArray(data?.findings)) {
      throw new Error('Adapter JSON needs a findings array');
    }
    return data.findings;
  },
};

export function importFindings(
  data,
  { id = 'external', format = 'json', root } = {}
) {
  const reader = readers[format];
  if (!reader) {
    throw new Error(`Unsupported adapter format: ${format}`);
  }
  if (
    ['eslint', 'shellcheck', 'ruff', 'cargo'].includes(format) &&
    !Array.isArray(data)
  ) {
    throw new Error(`${format} JSON must be an array`);
  }
  return reader(data).map((entry) => {
    const path =
      root && isAbsolute(entry.path)
        ? relative(resolve(root), entry.path).split(sep).join('/')
        : entry.path;
    return validFinding({ ...entry, path }, id);
  });
}

function validateAdapter(adapter) {
  if (
    !adapter ||
    typeof adapter.id !== 'string' ||
    !/^[\w-]+$/.test(adapter.id) ||
    typeof adapter.command !== 'string' ||
    !adapter.command
  ) {
    throw new Error('Adapters need id, command and an argv string array');
  }
  if (
    !Array.isArray(adapter.args) ||
    adapter.args.some((arg) => typeof arg !== 'string')
  ) {
    throw new Error('Adapters need id, command and an argv string array');
  }
}

export async function runAdapter(adapter, { cwd, run = runProcess } = {}) {
  validateAdapter(adapter);
  const result = await run(adapter.command, adapter.args, {
    cwd,
    timeoutMs: adapter.timeoutMs || 30_000,
  });
  if (![0, 1].includes(result.code)) {
    throw new Error(
      `${adapter.id}: analyzer failed with exit ${result.code}: ${result.stderr}`
    );
  }
  if (adapter.format === 'exit') {
    if (result.code) {
      throw new Error(
        `${adapter.id}: check failed: ${result.stderr || result.stdout}`
      );
    }
    return [];
  }
  const data =
    adapter.format === 'cargo'
      ? result.stdout
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line))
      : JSON.parse(result.stdout);
  const findings = importFindings(data, { ...adapter, root: cwd });
  if (result.code && !findings.length) {
    throw new Error(`${adapter.id}: nonzero exit without findings`);
  }
  return findings;
}

export async function doctor(adapters, { cwd, run = runProcess } = {}) {
  const results = [];
  for (const adapter of adapters) {
    try {
      const result = await run(
        adapter.command,
        adapter.versionArgs || ['--version'],
        { cwd, timeoutMs: 10_000 }
      );
      if (result.code !== 0 || !result.stdout.trim()) {
        throw new Error(`exit ${result.code} or empty version`);
      }
      results.push({
        id: adapter.id,
        available: true,
        version: result.stdout.trim(),
      });
    } catch (error) {
      results.push({ id: adapter.id, available: false, reason: error.message });
    }
  }
  return { passed: results.every((entry) => entry.available), tools: results };
}

function lcovLine(raw, current) {
  if (!current || !/^DA:[1-9]\d*,\d+(?:,[^,]*)?$/.test(raw)) {
    throw new Error('Invalid LCOV line');
  }
  const [line, hits] = raw.slice(3).split(',').map(Number);
  if (
    !Number.isSafeInteger(line) ||
    !Number.isSafeInteger(hits) ||
    current.lines.has(line)
  ) {
    throw new Error('Invalid or repeated LCOV line');
  }
  current.lines.set(line, hits);
}

function finishLcov(current, files) {
  if (!current || !current.lines.size || files.has(current.path)) {
    throw new Error('Invalid or duplicate LCOV file record');
  }
  const hit = [...current.lines.values()].filter((value) => value > 0).length;
  if (current.LF !== undefined && current.LF !== current.lines.size) {
    throw new Error('LCOV LF count mismatch');
  }
  if (current.LH !== undefined && current.LH !== hit) {
    throw new Error('LCOV LH count mismatch');
  }
  files.set(current.path, current.lines);
}

function lcovField(raw, current) {
  if (/^(?:LF|LH):/.test(raw)) {
    const key = raw.slice(0, 2);
    const count = Number(raw.slice(3));
    if (
      !current ||
      !/^(?:LF|LH):\d+$/.test(raw) ||
      !Number.isSafeInteger(count) ||
      current[key] !== undefined
    ) {
      throw new Error('Invalid LCOV count');
    }
    current[key] = count;
  } else if (!/^(?:TN|FN|FNDA|FNF|FNH|BRDA|BRF|BRH|VER):/.test(raw)) {
    throw new Error(`Unknown LCOV field: ${raw.split(':')[0]}`);
  }
}

export function parseLcov(source) {
  if (typeof source !== 'string' || !source.trim()) {
    throw new Error('Empty LCOV report');
  }
  const files = new Map();
  let current;
  for (const raw of source.split(/\r?\n/).filter(Boolean)) {
    if (raw.startsWith('SF:')) {
      if (current || !raw.slice(3)) {
        throw new Error('Unterminated or empty LCOV record');
      }
      current = { path: raw.slice(3), lines: new Map() };
    } else if (raw.startsWith('DA:')) {
      lcovLine(raw, current);
    } else if (raw === 'end_of_record') {
      finishLcov(current, files);
      current = null;
    } else {
      lcovField(raw, current);
    }
  }
  if (current || !files.size) {
    throw new Error('Incomplete LCOV report');
  }
  let total = 0;
  let covered = 0;
  for (const lines of files.values()) {
    total += lines.size;
    covered += [...lines.values()].filter((hits) => hits > 0).length;
  }
  return {
    total,
    covered,
    linePercent: Math.floor((covered / total) * 10_000) / 100,
    files: [...files.keys()],
  };
}
