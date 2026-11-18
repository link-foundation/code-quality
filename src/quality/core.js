import { detectLanguage, getLanguage } from './languages.js';
import { validateConfig, severities, safePath } from './config.js';
import { withSyntax, extractSyntax, walk, hash, position } from './syntax.js';
import { bashParserMethod } from './bash-syntax.js';
import {
  cloneContext,
  collectCloneTokens,
  collectCmakeCloneTokens,
  detectTokenClones,
} from './clones.js';
import { groupTokenClones } from './clone-groups.js';
import { matchTreePattern, usesTreePredicates } from './tree-patterns.js';
import { analyzeTaint } from './taint.js';

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
    const last = line.at(line.endsWith('\r') ? -2 : -1);
    if (rules['trailing-whitespace'] && (last === '\t' || last === ' ')) {
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

function checkCustomRules(node, rules, language, add, budget) {
  for (const rule of rules) {
    if (rule.languages && !rule.languages.includes(language)) {
      continue;
    }
    if (
      rule.pattern.tree &&
      !matchTreePattern(node, rule.pattern.tree, budget)
    ) {
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
    if (
      config.customRules.some(
        (rule) => !rule.languages || rule.languages.includes(language)
      )
    ) {
      add(
        'unsupported-analysis',
        `${language}: custom tree rules require a syntax tree that this adapter does not provide`,
        1,
        1,
        'error'
      );
    }
    return;
  }
  const patternBudget = { remaining: 5_000_000 };
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
    checkCustomRules(node, config.customRules, language, add, patternBudget);
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

function collectClones(syntax, file, config, context, errors, add) {
  if (!config || !context || errors.length) {
    return;
  }
  if (syntax.root) {
    collectCloneTokens(syntax.root, file, config, context);
  } else if (syntax.cmake) {
    collectCmakeCloneTokens(syntax.cmake, file, config, context);
  } else {
    add(
      'unsupported-analysis',
      `${file.language}: token clone analysis requires a supported tokenizer`,
      1,
      1,
      'error'
    );
  }
}

export async function analyzeSource(file, options = {}, cloneInputs) {
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
  return await withSyntax(
    language,
    file.content,
    async (syntax) => {
      const {
        errors,
        abstractions,
        limitations = [],
      } = extractSyntax(syntax, file.content);
      for (const error of errors) {
        add('syntax', error.message, error.line, error.column, 'error');
      }
      for (const entry of limitations) {
        add(
          'unsupported-analysis',
          entry.message,
          entry.line,
          entry.column,
          'error'
        );
      }
      checkAbstractions(abstractions, config.rules, add);
      checkTree(syntax, config, language, add);
      if (!errors.length && syntax.root) {
        for (const entry of analyzeTaint(
          syntax.root,
          path,
          language,
          config.taintRules
        )) {
          if (findings.length >= 10_000) {
            throw new Error('Finding count budget exceeded');
          }
          findings.push({ path, ...entry });
        }
      }
      collectClones(
        syntax,
        { ...file, path, language },
        config.clones,
        cloneInputs,
        errors,
        add
      );
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
    },
    {
      tokens: Boolean(config.clones && cloneInputs),
      comments: Boolean(config.clones?.suppressionComments && cloneInputs),
    }
  );
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
      const { identity, ...record } = entry;
      return {
        ...record,
        fingerprint: hash(
          JSON.stringify([
            entry.path,
            entry.ruleId,
            abstraction?.qualifiedName || '',
            entry.message,
            ...(identity ? [identity] : []),
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
          'web-tree-sitter@0.20.8/tree-sitter-wasms@0.1.13/cmake-native-v2',
        ...(files.some((file) => file.language === 'bash') && {
          bashParser: bashParserMethod,
        }),
        rules: config.rules,
        customRules: config.customRules,
        ...(config.taintRules.length && {
          taint: {
            method: config.taintRules.some((rule) => rule.controlFlow === 'branch-joins')
              ? 'branch-join-call-models-v1' : 'straight-line-call-models-v1',
            rules: config.taintRules,
          },
        }),
        ...(config.customRules.some((rule) => rule.pattern.tree) && {
          treeRules: 'named-tree-patterns-v1',
        }),
        ...(usesTreePredicates(config.customRules) && {
          treePredicates: 'isolated-candidate-filters-v1',
        }),
        failOn: config.failOn,
        ...(config.clones && {
          clones: {
            method: 'bounded-token-pairs-v1',
            cmakeTokens: 'cmake-arguments-v1',
            ...(config.clones.ignoreLiterals && {
              literalNormalization: 'grammar-literals-v2',
            }),
            ...(config.clones.suppressionComments && {
              suppression: 'cpd-comment-regions-v1',
            }),
            ...((config.clones.ignoreAnnotations ||
              config.clones.ignoreUsings) && {
              syntaxFilters: 'annotations-usings-v1',
            }),
            ...config.clones,
          },
        }),
      })
    ),
    files,
    incomplete: sorted.some((entry) =>
      ['syntax', 'unsupported-analysis'].includes(entry.ruleId)
    ),
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

function duplicateFunctions(files, findings, enabled) {
  if (!enabled) {
    return;
  }
  const shapes = new Map();
  for (const file of files) {
    for (const entry of file.abstractions.filter(
      (value) =>
        value.kind === 'function' && value.endLine - value.startLine >= 3
    )) {
      const key = `${file.language}:${entry.shape}`;
      const previous = shapes.get(key);
      if (previous) {
        if (findings.length >= 10_000) {
          throw new Error('Finding count budget exceeded');
        }
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

function cloneResults(context, config, findings) {
  if (!config) {
    return undefined;
  }
  const clones = detectTokenClones(context, config);
  for (const clone of clones) {
    if (findings.length >= 10_000) {
      throw new Error('Finding count budget exceeded');
    }
    findings.push({
      ...finding(
        clone.second.path,
        'duplicate-tokens',
        `${clone.tokens} repeated tokens; first occurrence in ${clone.first.path}`,
        clone.second.line,
        clone.second.column
      ),
      identity: clone.signature,
      endLine: clone.second.endLine,
      endColumn: clone.second.endColumn,
      relatedLocations: [clone.first],
    });
  }
  return clones;
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
  const cloneInputs = config.clones ? cloneContext() : undefined;
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
    const result = await analyzeSource(file, options, cloneInputs);
    if (findings.length + result.findings.length > 10_000) {
      throw new Error('Finding count budget exceeded');
    }
    findings.push(...result.findings);
    const { findings: ignored, ...record } = result;
    void ignored;
    files.push(record);
  }
  duplicateFunctions(files, findings, config.rules['duplicate-function']);
  const clones = cloneResults(cloneInputs, config.clones, findings);
  const report = finalizeReport(
    files,
    findings,
    config,
    clones && {
      clones,
      cloneGroups: groupTokenClones(clones),
      ...(config.clones.suppressionComments && {
        cloneSuppressions: cloneInputs.suppressions.sort((a, b) =>
          a.path < b.path ? -1 : a.path > b.path ? 1 : a.start - b.start
        ),
      }),
    }
  );
  report.method = pluginMethod(options.plugins, report.method);
  return report;
}

export function sourceLocation(source, index) {
  return position(source, index);
}
