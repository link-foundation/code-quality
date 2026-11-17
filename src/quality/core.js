import { detectLanguage, getLanguage } from './languages.js';
import { validateConfig, severities, safePath } from './config.js';
import { withSyntax, extractSyntax, walk, hash, position } from './syntax.js';

function finding(
  path,
  ruleId,
  message,
  line = 1,
  column = 1,
  severity = 'warning'
) {
  return { path, ruleId, severity, message, line, column };
}

function checkLines(file, rules, add) {
  const lines = file.content.split('\n');
  const count = lines.length - (lines.at(-1) === '' ? 1 : 0);
  if (rules['file-lines'] && count > rules['file-lines']) {
    add('file-lines', `${count} lines exceed ${rules['file-lines']}`);
  }
  if (rules['final-newline'] && file.content && !file.content.endsWith('\n')) {
    add('final-newline', 'End the file with a newline', count);
  }
  lines.forEach((line, index) => {
    if (rules['trailing-whitespace'] && /[\t ]+\r?$/.test(line)) {
      add('trailing-whitespace', 'Remove trailing whitespace', index + 1);
    }
  });
  return count;
}

function checkAbstractions(abstractions, rules, add) {
  for (const entry of abstractions.filter(
    (value) => value.kind === 'function'
  )) {
    for (const [id, value] of [
      ['function-lines', entry.endLine - entry.startLine + 1],
      ['complexity', entry.complexity],
      ['parameters', entry.parameters],
    ]) {
      if (rules[id] && value > rules[id]) {
        add(
          id,
          `${entry.qualifiedName}: ${value} exceeds ${rules[id]}`,
          entry.startLine
        );
      }
    }
  }
}

function checkCustomRules(node, rules, language, add) {
  for (const rule of rules) {
    if (rule.languages && !rule.languages.includes(language)) {
      continue;
    }
    if (rule.pattern.kind && node.type !== rule.pattern.kind) {
      continue;
    }
    if (rule.pattern.text && !node.text.includes(rule.pattern.text)) {
      continue;
    }
    add(
      rule.id,
      rule.message,
      node.startPosition.row + 1,
      node.startPosition.column + 1,
      rule.severity || 'warning'
    );
  }
}

function checkTree(syntax, config, language, add) {
  if (!syntax.root) {
    return;
  }
  for (const node of walk(syntax.root)) {
    const line = node.startPosition.row + 1;
    const column = node.startPosition.column + 1;
    if (
      config.rules['unsafe-eval'] &&
      /call|invocation/.test(node.type) &&
      /^(?:eval|exec|Function|new Function)\s*\(/.test(node.text)
    ) {
      add(
        'unsafe-eval',
        'Avoid dynamic code execution; use a parser or explicit dispatch',
        line,
        column,
        'error'
      );
    }
    if (
      config.rules['hardcoded-secret'] &&
      /assignment|declarator|pair/.test(node.type) &&
      /(?:password|passwd|api_?key|secret|access_?token)\s*['"]?\s*[:=]\s*['"][^'"]{8,}['"]/i.test(
        node.text
      )
    ) {
      add(
        'hardcoded-secret',
        'Move the hardcoded credential to a secret provider',
        line,
        column,
        'error'
      );
    }
    checkCustomRules(node, config.customRules, language, add);
  }
}

function validPluginFinding(result) {
  return (
    result &&
    typeof result.message === 'string' &&
    result.message &&
    severities.includes(result.severity || 'warning') &&
    Number.isSafeInteger(result.line ?? 1) &&
    (result.line ?? 1) > 0 &&
    Number.isSafeInteger(result.column ?? 1) &&
    (result.column ?? 1) > 0
  );
}

async function pluginFindings(plugins, file, language, abstractions, root) {
  const findings = [];
  for (const plugin of plugins) {
    if (typeof plugin.id !== 'string' || typeof plugin.analyze !== 'function') {
      throw new Error('Plugins need an id and analyze function');
    }
    const results = await plugin.analyze({
      ...file,
      language,
      abstractions,
      root,
    });
    if (!Array.isArray(results)) {
      throw new Error(`Plugin ${plugin.id} must return findings`);
    }
    if (findings.length + results.length > 10_000) {
      throw new Error('Plugin finding count budget exceeded');
    }
    for (const result of results) {
      if (!validPluginFinding(result)) {
        throw new Error(`Plugin ${plugin.id} returned an invalid finding`);
      }
      findings.push(
        finding(
          file.path,
          plugin.id,
          result.message,
          result.line ?? 1,
          result.column ?? 1,
          result.severity || 'warning'
        )
      );
    }
  }
  return findings;
}

function pluginMethod(plugins, method) {
  if (!plugins?.length) {
    return method;
  }
  const versions = plugins.map((plugin) => {
    if (typeof plugin.version !== 'string' || !plugin.version) {
      throw new Error('Plugins require a version for reproducible reports');
    }
    return [plugin.id, plugin.version];
  });
  return hash(JSON.stringify([method, versions]));
}

export async function analyzeSource(file, options = {}) {
  const config = validateConfig(options.config);
  const path = safePath(file.path);
  if (typeof file.content !== 'string' || file.content.includes('\0')) {
    throw new Error(`${path}: expected UTF-8 text without NUL bytes`);
  }
  if (Buffer.byteLength(file.content) > config.limits.maxFileBytes) {
    throw new Error(`${path}: file byte budget exceeded`);
  }
  const language = file.language || detectLanguage(path, file.content);
  if (!language) {
    throw new Error(`${path}: unsupported language`);
  }
  getLanguage(language);
  const findings = [];
  const add = (...args) => {
    if (findings.length >= 10_000) {
      throw new Error('Finding count budget exceeded');
    }
    findings.push(finding(path, ...args));
  };
  const lineCount = checkLines(file, config.rules, add);
  return await withSyntax(language, file.content, async (syntax) => {
    const { errors, abstractions } = extractSyntax(syntax, file.content);
    for (const error of errors) {
      add('syntax', error.message, error.line, error.column, 'error');
    }
    checkAbstractions(abstractions, config.rules, add);
    checkTree(syntax, config, language, add);
    findings.push(
      ...(await pluginFindings(
        options.plugins || [],
        file,
        language,
        abstractions,
        syntax.root
      ))
    );
    return {
      path,
      language,
      hash: hash(file.content),
      lineCount,
      abstractions,
      findings,
    };
  });
}

export function finalizeReport(files, findings, config, metadata = {}) {
  const sorted = findings
    .map((entry) => {
      if (
        !Number.isInteger(entry.line) ||
        entry.line < 1 ||
        !Number.isInteger(entry.column) ||
        entry.column < 1
      ) {
        throw new Error('Finding locations must be positive integers');
      }
      const file = files.find((value) => value.path === entry.path);
      const abstraction = file?.abstractions.find(
        (value) => value.startLine <= entry.line && value.endLine >= entry.line
      );
      return {
        ...entry,
        fingerprint: hash(
          JSON.stringify([
            entry.path,
            entry.ruleId,
            abstraction?.qualifiedName || '',
            entry.message,
          ])
        ),
      };
    })
    .sort(
      (a, b) =>
        a.path.localeCompare(b.path) ||
        a.line - b.line ||
        a.column - b.column ||
        a.ruleId.localeCompare(b.ruleId)
    );
  // Occurrence suffixes retain independent identical findings without relying on line numbers.
  const occurrences = new Map();
  for (const entry of sorted) {
    const count = occurrences.get(entry.fingerprint) || 0;
    occurrences.set(entry.fingerprint, count + 1);
    entry.fingerprint = hash(`${entry.fingerprint}:${count}`);
  }
  return {
    schemaVersion: 1,
    tool: 'code-quality',
    method: hash(
      JSON.stringify({
        engine: 'native-quality-v1',
        parser:
          'web-tree-sitter@0.20.8/tree-sitter-wasms@0.1.13/cmake-native-v1',
        rules: config.rules,
        customRules: config.customRules,
        failOn: config.failOn,
      })
    ),
    files,
    incomplete: sorted.some((entry) => entry.ruleId === 'syntax'),
    findings: sorted,
    summary: {
      files: files.length,
      errors: sorted.filter((item) => item.severity === 'error').length,
      warnings: sorted.filter((item) => item.severity === 'warning').length,
    },
    passed: !sorted.some(
      (entry) =>
        severities.indexOf(entry.severity) >= severities.indexOf(config.failOn)
    ),
    ...metadata,
  };
}

export async function analyzeFiles(input, options = {}) {
  const config = validateConfig(options.config);
  if (
    !Array.isArray(input) ||
    !input.length ||
    input.length > config.limits.maxFiles
  ) {
    throw new Error(`Expected 1..${config.limits.maxFiles} files`);
  }
  const paths = new Set();
  let bytes = 0;
  const files = [];
  const findings = [];
  for (const file of input) {
    if (!file || paths.has(file.path)) {
      throw new Error('Invalid or duplicate file path');
    }
    paths.add(file.path);
    if (typeof file.content !== 'string') {
      throw new Error('File content must be a string');
    }
    bytes += Buffer.byteLength(file.content);
    if (bytes > config.limits.maxTotalBytes) {
      throw new Error('Total byte budget exceeded');
    }
    const result = await analyzeSource(file, options);
    if (findings.length + result.findings.length > 10_000) {
      throw new Error('Finding count budget exceeded');
    }
    findings.push(...result.findings);
    const { findings: ignored, ...record } = result;
    void ignored;
    files.push(record);
  }
  if (config.rules['duplicate-function']) {
    const shapes = new Map();
    for (const file of files) {
      for (const entry of file.abstractions.filter(
        (value) =>
          value.kind === 'function' && value.endLine - value.startLine >= 3
      )) {
        const key = `${file.language}:${entry.shape}`;
        const previous = shapes.get(key);
        if (previous) {
          findings.push(
            finding(
              file.path,
              'duplicate-function',
              `Structural duplicate of ${previous.path}:${previous.name}`,
              entry.startLine
            )
          );
        } else {
          shapes.set(key, { path: file.path, name: entry.qualifiedName });
        }
      }
    }
  }
  const report = finalizeReport(files, findings, config);
  report.method = pluginMethod(options.plugins, report.method);
  return report;
}

export function sourceLocation(source, index) {
  return position(source, index);
}
