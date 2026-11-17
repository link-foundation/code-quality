import { walk, hash } from './syntax.js';
import { lineLocator } from './lines.js';
import { cloneFile } from './clone-suppressions.js';

const literalKinds = new Set([
  'string',
  'string_literal',
  'raw_string_literal',
  'raw_string',
  'interpreted_string_literal',
  'char_literal',
  'character_literal',
  'integer',
  'integer_literal',
  'decimal_integer_literal',
  'hex_integer_literal',
  'octal_integer_literal',
  'binary_integer_literal',
  'decimal_floating_point_literal',
  'hex_floating_point_literal',
  'float',
  'float_literal',
  'number',
  'number_literal',
  'boolean',
  'true',
  'false',
  'null',
  'null_literal',
  'none',
]);

export function cloneContext() {
  return {
    dictionary: new Map(),
    values: [null],
    files: [],
    count: 0,
    bytes: 0,
    suppressionMarkers: 0,
    suppressions: [],
  };
}

function ignoredSyntax(node, language, config) {
  return (
    (config.ignoreAnnotations &&
      ((language === 'java' &&
        ['annotation', 'marker_annotation'].includes(node.type)) ||
        (language === 'csharp' &&
          ['attribute_list', 'global_attribute_list'].includes(node.type)))) ||
    (config.ignoreUsings &&
      language === 'csharp' &&
      node.type === 'using_directive')
  );
}

function literal(node, budget) {
  if (!literalKinds.has(node.type)) {
    return false;
  }
  for (const child of walk(node, budget)) {
    if (/interpolation|substitution|expansion|embedded/.test(child.type)) {
      return false;
    }
  }
  return true;
}

function tokenValue(
  node,
  atom,
  config,
  context,
  identifier = /(?:^|_)identifier$/.test(node.type)
) {
  if (++context.count > 100_000) {
    throw new Error('Clone token count budget exceeded');
  }
  const key = JSON.stringify(
    identifier && config.ignoreIdentifiers
      ? ['$identifier']
      : atom && config.ignoreLiterals
        ? ['$literal', node.type]
        : [node.type, node.text]
  );
  if (!context.dictionary.has(key)) {
    context.bytes += Buffer.byteLength(key);
    if (context.bytes > 16_777_216) {
      throw new Error('Clone token metadata budget exceeded');
    }
    context.dictionary.set(key, context.dictionary.size + 1);
    context.values.push(key);
  }
  return context.dictionary.get(key);
}

export function collectCloneTokens(root, file, config, context) {
  const output = cloneFile(file, config, context);
  const budget = { remaining: 500_000 };
  let coveredUntil = -1;
  let ignoredUntil = -1;
  for (const node of walk(root, budget)) {
    if (node.startIndex < coveredUntil) {
      continue;
    }
    if (ignoredSyntax(node, file.language, config)) {
      ignoredUntil = Math.max(ignoredUntil, node.endIndex);
    }
    if (/comment/.test(node.type)) {
      output.comment(node.text, node.startIndex);
      coveredUntil = node.endIndex;
      continue;
    }
    const atom = literal(node, budget);
    if ((!atom && node.childCount) || !node.text) {
      continue;
    }
    const token = {
      value: tokenValue(node, atom, config, context),
      start: node.startIndex,
      end: node.endIndex,
      line: node.startPosition.row + 1,
      column: node.startPosition.column + 1,
      endLine: node.endPosition.row + 1,
      endColumn: node.endPosition.column + 1,
    };
    // Omitted syntax still consumes token/key budgets, and its comments above
    // still reach the opt-in region policy. Only the comparison input changes.
    if (node.endIndex > ignoredUntil) {
      output.add(token);
    }
    coveredUntil = node.endIndex;
  }
  output.finish();
}

export function collectCmakeCloneTokens(parsed, file, config, context) {
  const locate = lineLocator(file.content);
  const output = cloneFile(file, config, context);
  for (const token of parsed.tokens) {
    if (token.comment) {
      output.comment(file.content.slice(token.start, token.end), token.start);
      continue;
    }
    const start = locate(token.start);
    const end = locate(token.end);
    output.add({
      value: tokenValue(
        { type: token.kind, text: file.content.slice(token.start, token.end) },
        token.literal,
        config,
        context,
        Boolean(token.identifier)
      ),
      start: token.start,
      end: token.end,
      line: start.line,
      column: start.column,
      endLine: end.line,
      endColumn: end.column,
    });
  }
  output.finish();
}

function location(file, start, length) {
  const first = file.tokens[start];
  const last = file.tokens[start + length - 1];
  return {
    path: file.path,
    start: first.start,
    end: last.end,
    line: first.line,
    column: first.column,
    endLine: last.endLine,
    endColumn: last.endColumn,
  };
}

function match(previous, current, start, budget) {
  const { file, index } = previous;
  const a = file.tokens;
  const b = current.tokens;
  const continued = index && start && a[index - 1].value === b[start - 1].value;
  // Across files a matching predecessor always extends this pair to the left.
  if (continued && file !== current) {
    return 0;
  }
  const limit = file === current ? start - index : Infinity;
  let length = 0;
  while (index + length < a.length && start + length < b.length) {
    if (++budget.comparisons > 5_000_000) {
      throw new Error('Clone comparison budget exceeded');
    }
    if (
      length >= limit ||
      a[index + length].value !== b[start + length].value
    ) {
      break;
    }
    length++;
  }
  // In one file an overlap-limited pair cannot also extend to the left.
  return continued && length < limit ? 0 : length;
}

function addMatch(previous, file, index, minimum, matches, budget) {
  if (++budget.pairs > 100_000) {
    throw new Error('Clone candidate budget exceeded');
  }
  const length = match(previous, file, index, budget);
  if (length < minimum) {
    return;
  }
  if (matches.length >= 10_000) {
    throw new Error('Clone result budget exceeded');
  }
  matches.push({
    language: file.language,
    tokens: length,
    signature: hash(
      JSON.stringify(
        file.tokens
          .slice(index, index + length)
          .map((token) => budget.values[token.value])
      )
    ),
    first: location(previous.file, previous.index, length),
    second: location(file, index, length),
  });
}

export function detectTokenClones(context, config) {
  const seeds = new Map();
  const matches = [];
  const budget = { comparisons: 0, pairs: 0, values: context.values };
  const minimum = config.minTokens;
  const base = 16_777_619;
  let power = 1;
  for (let index = 1; index < minimum; index++) {
    power = Math.imul(power, base);
  }
  const files = [...context.files].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0
  );
  for (const file of files) {
    let seed = 0;
    for (let end = 0; end < file.tokens.length; end++) {
      seed = (Math.imul(seed, base) + file.tokens[end].value) >>> 0;
      if (end + 1 < minimum) {
        continue;
      }
      const index = end + 1 - minimum;
      const key = `${file.language}:${seed}`;
      const previous = seeds.get(key) || [];
      for (const candidate of previous) {
        addMatch(candidate, file, index, minimum, matches, budget);
      }
      previous.push({ file, index });
      seeds.set(key, previous);
      seed = (seed - Math.imul(file.tokens[index].value, power)) >>> 0;
    }
  }
  return matches;
}
