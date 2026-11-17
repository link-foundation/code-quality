import Parser from 'web-tree-sitter';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { getLanguage } from './languages.js';
import { parseCmake } from './cmake.js';

const require = createRequire(import.meta.url);
const grammars = new Map();
let initialized;
const functionKinds = new Set([
  'function_declaration',
  'function_definition',
  'function_item',
  'method_declaration',
  'method_definition',
  'arrow_function',
  'function_expression',
  'generator_function_declaration',
  'generator_function',
  'constructor_declaration',
  'local_function_statement',
  'anonymous_method_expression',
  'lambda_expression',
  'closure_expression',
  'lambda',
]);
const classKinds = new Set([
  'class_declaration',
  'class_definition',
  'class_specifier',
  'class',
  'struct_item',
  'struct_specifier',
  'struct_declaration',
  'interface_declaration',
  'interface_type',
  'enum_item',
  'enum_declaration',
  'trait_item',
  'impl_item',
  'type_declaration',
  'namespace_definition',
  'namespace_declaration',
  'module',
  'mod_item',
]);
const decisionKinds = new Set([
  'if_statement',
  'if_expression',
  'elif_clause',
  'for_statement',
  'for_expression',
  'while_statement',
  'while_expression',
  'do_statement',
  'case_statement',
  'switch_case',
  'catch_clause',
  'except_clause',
  'conditional_expression',
  'ternary_expression',
  'match_arm',
  'for_in_statement',
  'for_range_loop',
  'select_statement',
]);

export const hash = (value) => createHash('sha256').update(value).digest('hex');
export const position = (source, index) => {
  const before = source.slice(0, index).split('\n');
  return { line: before.length, column: before.at(-1).length + 1 };
};

export function* walk(root, budget = { remaining: 500_000 }) {
  const cursor = root.walk();
  try {
    let more = true;
    while (more) {
      if (--budget.remaining < 0) {
        throw new Error('Syntax traversal budget exceeded');
      }
      yield cursor.currentNode();
      if (cursor.gotoFirstChild()) {
        continue;
      }
      while (!cursor.gotoNextSibling()) {
        if (!cursor.gotoParent()) {
          more = false;
          break;
        }
      }
    }
  } finally {
    cursor.delete();
  }
}

function nodeName(node) {
  const direct = node.childForFieldName('name')?.text;
  if (direct) {
    return direct;
  }
  const declarator = node.childForFieldName('declarator');
  if (declarator) {
    return [...walk(declarator)].find((child) =>
      ['identifier', 'field_identifier'].includes(child.type)
    )?.text;
  }
  const parent = node.parent;
  if (
    ![
      'variable_declarator',
      'pair',
      'assignment',
      'assignment_expression',
    ].includes(parent?.type)
  ) {
    return null;
  }
  return (
    parent.childForFieldName('name') ||
    parent.childForFieldName('left') ||
    parent.childForFieldName('key')
  )?.text;
}

function qualifiedName(node, name) {
  const parents = [];
  let depth = 0;
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (++depth > 512) {
      throw new Error('Syntax depth budget exceeded');
    }
    if (functionKinds.has(parent.type) || classKinds.has(parent.type)) {
      const parentName = parent.childForFieldName('name')?.text;
      if (parentName) {
        parents.unshift(parentName);
      }
    }
  }
  return [...parents, name].join('.');
}

function nodeMetrics(node, budget) {
  const leaves = [];
  const edits = [];
  let complexity = 1;
  for (const child of walk(node, budget)) {
    if (
      decisionKinds.has(child.type) ||
      ['&&', '||', 'and', 'or', '??'].includes(child.type)
    ) {
      complexity++;
    }
    if (child.childCount !== 0 || /comment/.test(child.type)) {
      continue;
    }
    const identity = /identifier|name/.test(child.type);
    const literal = /string|number|integer|float|literal/.test(child.type);
    leaves.push(identity ? '$id' : literal ? `$${child.type}` : child.type);
    edits.push(identity ? '$id' : child.text);
  }
  const params = node.childForFieldName('parameters');
  const parameters = params
    ? params.namedChildren.filter((child) => !child.type.includes('comment'))
        .length
    : 0;
  return {
    parameters,
    complexity,
    shape: hash(leaves.join(' ')),
    editHash: hash(edits.join(' ')),
  };
}

function abstraction(node, source, budget) {
  if (
    !node.isNamed() ||
    (node.type === 'module' && !node.childForFieldName('name'))
  ) {
    return null;
  }
  const kind = functionKinds.has(node.type)
    ? 'function'
    : classKinds.has(node.type)
      ? 'class'
      : null;
  if (!kind) {
    return null;
  }
  const name = nodeName(node) || '<anonymous>';
  const start = node.startIndex;
  const end = node.endIndex;
  return {
    kind,
    syntaxKind: node.type,
    name,
    qualifiedName: qualifiedName(node, name),
    start,
    end,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    hash: hash(source.slice(start, end)),
    ...nodeMetrics(node, budget),
  };
}

export async function withSyntax(language, source, callback) {
  const spec = getLanguage(language);
  if (!spec.grammar) {
    return callback({ cmake: parseCmake(source), root: null });
  }
  initialized ||= Parser.init();
  await initialized;
  if (!grammars.has(spec.grammar)) {
    grammars.set(
      spec.grammar,
      Parser.Language.load(
        require.resolve(
          `tree-sitter-wasms/out/tree-sitter-${spec.grammar}.wasm`
        )
      )
    );
  }
  const parser = new Parser();
  let tree;
  try {
    parser.setLanguage(await grammars.get(spec.grammar));
    parser.setTimeoutMicros(2_000_000);
    tree = parser.parse(source);
    if (!tree) {
      throw new Error('Parser budget exceeded');
    }
    return await callback({ root: tree.rootNode, cmake: null });
  } finally {
    tree?.delete();
    parser.delete();
  }
}

export function extractSyntax(syntax, source) {
  if (syntax.cmake) {
    // A shared line index maps CMake source offsets to report positions without
    // rescanning each declaration's prefix.
    const starts = [0];
    for (let index = 0; index < source.length; index++) {
      if (source[index] === '\n') {
        starts.push(index + 1);
      }
    }
    const location = (index) => {
      let low = 0;
      let high = starts.length;
      while (low + 1 < high) {
        const middle = Math.floor((low + high) / 2);
        if (starts[middle] <= index) {
          low = middle;
        } else {
          high = middle;
        }
      }
      return { line: low + 1, column: index - starts[low] + 1 };
    };
    let descriptorBytes = 0;
    return {
      errors: syntax.cmake.errors.map((error) => ({
        ...location(error.index),
        message: error.message,
      })),
      limitations: syntax.cmake.limitations.map((entry) => ({
        ...location(entry.index),
        message: entry.message,
      })),
      abstractions: syntax.cmake.abstractions.map((entry) => {
        const abstraction = {
          ...entry,
          kind: 'function',
          syntaxKind: entry.kind,
          editHash: hash(
            source
              .slice(entry.start, entry.end)
              .replace(/\b[A-Za-z_]\w*\b/g, '$id')
          ),
          startLine: location(entry.start).line,
          endLine: location(entry.end).line,
          hash: hash(source.slice(entry.start, entry.end)),
          shape: hash(
            source.slice(entry.start, entry.end).replace(/\b\w+\b/g, '$id')
          ),
        };
        descriptorBytes += Buffer.byteLength(JSON.stringify(abstraction));
        if (descriptorBytes > 4_194_304) {
          throw new Error('Abstraction metadata budget exceeded');
        }
        return abstraction;
      }),
    };
  }
  const errors = [];
  const abstractions = [];
  let descriptorBytes = 0;
  const budget = { remaining: 500_000 };
  for (const node of walk(syntax.root, budget)) {
    if (node.type === 'ERROR' || node.isMissing()) {
      errors.push({
        line: node.startPosition.row + 1,
        column: node.startPosition.column + 1,
        message: `Invalid or incomplete ${node.type}`,
      });
    }
    const entry = abstraction(node, source, budget);
    if (entry) {
      descriptorBytes += Buffer.byteLength(JSON.stringify(entry));
      if (descriptorBytes > 4_194_304) {
        throw new Error('Abstraction metadata budget exceeded');
      }
      abstractions.push(entry);
    }
  }
  return { errors, abstractions };
}
