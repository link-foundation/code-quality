import {
  UnsupportedFlow,
  spend,
  sourceValue,
  mergeValues,
  appendStep,
  bind,
} from './taint-values.js';
import { inventoryScope } from './taint-scope.js';
import {
  hasBranches,
  branchStatement,
  branchExpression,
} from './taint-branches.js';

const literals = new Set([
  'string',
  'number',
  'true',
  'false',
  'null',
  'undefined',
  'regex',
]);
const operators = new Set([
  '+',
  '-',
  '*',
  '/',
  '%',
  '**',
  '<',
  '<=',
  '>',
  '>=',
  '===',
  '!==',
  '==',
  '!=',
  '&',
  '|',
  '^',
  '<<',
  '>>',
  '>>>',
]);
const children = (node) =>
  node.namedChildren.filter((child) => child.type !== 'comment');
const field = (node, name) => node.childForFieldName(name);

function unsupported(node, reason = node.type) {
  throw new UnsupportedFlow(node, `unsupported ${reason}`);
}

function staticCall(node, depth = 0) {
  if (
    !node ||
    depth > 32 ||
    node.children.some((child) => ['optional_chain', '?.'].includes(child.type))
  ) {
    return null;
  }
  if (node.type === 'identifier' || node.type === 'property_identifier') {
    return node.text;
  }
  if (node.type === 'member_expression') {
    const object = staticCall(field(node, 'object'), depth + 1);
    const property = field(node, 'property');
    return object && property?.type === 'property_identifier'
      ? `${object}.${property.text}`
      : null;
  }
  return null;
}

function sinkFindings(context, node, name, values) {
  for (const sink of context.rule.sinks.filter(
    (entry) => entry.call === name
  )) {
    const value = values[sink.argument] ?? new Map();
    const traced = appendStep(context, node, value, 'sink', name);
    for (const trace of traced.values()) {
      context.findings.push({
        ruleId: context.rule.id,
        severity: context.rule.severity,
        message: `${context.rule.message}: ${trace[0].name} reaches argument ${sink.argument} of ${name}`,
        line: node.startPosition.row + 1,
        column: node.startPosition.column + 1,
        endLine: node.endPosition.row + 1,
        endColumn: node.endPosition.column + 1,
        dataFlow: trace,
        identity: JSON.stringify(
          trace.map(({ kind, name: label }) => [kind, label])
        ),
      });
      if (context.findings.length > 1000) {
        throw new UnsupportedFlow(
          node,
          'finding inventory exceeds 1000 paths per rule'
        );
      }
    }
  }
}

function callValue(context, node, depth) {
  const name = staticCall(field(node, 'function'));
  const args = field(node, 'arguments');
  if (
    !name ||
    !context.calls.has(name) ||
    args?.type !== 'arguments' ||
    node.children.some((child) => ['optional_chain', '?.'].includes(child.type))
  ) {
    unsupported(node, 'unmodeled or dynamic call');
  }
  const values = children(args).map((arg) =>
    expression(context, arg, depth + 1)
  );
  sinkFindings(context, node, name, values);
  if (context.rule.sources.includes(name)) {
    return sourceValue(context, node, 'source', name);
  }
  if (context.rule.sanitizers.includes(name)) {
    return new Map();
  }
  return appendStep(
    context,
    node,
    mergeValues(context, node, values),
    'propagator',
    name
  );
}

function compoundValue(context, node, depth) {
  if (
    hasBranches(context) &&
    (node.type === 'ternary_expression' ||
      (node.type === 'binary_expression' &&
        ['&&', '||', '??'].includes(field(node, 'operator')?.text)))
  ) {
    return branchExpression(context, node, expression, depth);
  }
  if (node.type === 'binary_expression') {
    if (!operators.has(field(node, 'operator')?.text)) {
      unsupported(node, 'conditional or unmodeled operator');
    }
    return mergeValues(context, node, [
      expression(context, field(node, 'left'), depth + 1),
      expression(context, field(node, 'right'), depth + 1),
    ]);
  }
  if (node.type === 'template_string') {
    return mergeValues(
      context,
      node,
      children(node)
        .filter((child) => child.type === 'template_substitution')
        .map((child) => expression(context, children(child)[0], depth + 1))
    );
  }
  if (node.type === 'unary_expression') {
    if (
      !['!', '+', '-', '~', 'typeof', 'void'].includes(
        field(node, 'operator')?.text
      )
    ) {
      unsupported(node, 'unmodeled unary operator');
    }
    const value = expression(context, field(node, 'argument'), depth + 1);
    return field(node, 'operator').text === 'void' ? new Map() : value;
  }
  unsupported(node);
}

function expression(context, node, depth = 0) {
  spend(context, node, 1, depth);
  if (literals.has(node.type)) {
    return new Map();
  }
  if (node.type === 'identifier') {
    if (!context.env.has(node.text)) {
      unsupported(node, `unresolved identifier ${node.text}`);
    }
    return context.env.get(node.text);
  }
  if (
    [
      'parenthesized_expression',
      'as_expression',
      'non_null_expression',
      'satisfies_expression',
    ].includes(node.type)
  ) {
    return expression(context, children(node)[0], depth + 1);
  }
  if (node.type === 'assignment_expression') {
    const value = expression(context, field(node, 'right'), depth + 1);
    bind(context, field(node, 'left'), value, false);
    return context.env.get(field(node, 'left').text);
  }
  if (node.type === 'call_expression') {
    return callValue(context, node, depth);
  }
  return compoundValue(context, node, depth);
}

function declaration(context, node) {
  for (const entry of children(node)) {
    spend(context, entry);
    if (entry.type !== 'variable_declarator') {
      unsupported(entry);
    }
    const value = field(entry, 'value');
    bind(
      context,
      field(entry, 'name'),
      value ? expression(context, value) : new Map(),
      true,
      node.children.some((child) => child.type === 'const')
    );
  }
}

function functionScope(context, node) {
  const name = field(node, 'name');
  if (
    !name ||
    context.modelRoots.has(name.text) ||
    node.children.some((child) => child.type === 'async')
  ) {
    unsupported(node, 'anonymous, async or model-shadowing function');
  }
  const scope = {
    ...context,
    env: new Map(),
    constants: new Set(),
    controlDepth: 0,
  };
  for (const parameter of children(field(node, 'parameters'))) {
    spend(context, parameter);
    let binding = parameter;
    if (parameter.type === 'required_parameter') {
      const parts = children(parameter);
      if (
        parts.length > 2 ||
        parts[0]?.type !== 'identifier' ||
        (parts[1] && parts[1].type !== 'type_annotation')
      ) {
        unsupported(parameter, 'non-simple parameter');
      }
      binding = parts[0];
    }
    bind(
      scope,
      binding,
      sourceValue(scope, binding, 'parameter', binding.text),
      true
    );
  }
  statements(scope, field(node, 'body'), false);
}

function executeBlock(context, node, topLevel) {
  for (const statement of children(node)) {
    if (executeStatement(context, statement, topLevel)) {
      return true;
    }
  }
  return false;
}

function isExportedFunction(statement) {
  return (
    statement.type === 'export_statement' &&
    children(statement).length === 1 &&
    children(statement)[0].type === 'function_declaration'
  );
}

// Execute a nested block, then drop bindings it introduced so the outer
// environment only retains names declared in its own scope.
function nestedBlock(context, statement, topLevel) {
  const outerNames = new Set(context.env.keys());
  const ended = executeBlock(context, statement, topLevel);
  for (const name of context.env.keys()) {
    if (!outerNames.has(name)) {
      context.env.delete(name);
      context.constants.delete(name);
    }
  }
  return ended;
}

function topLevelFunction(statement, topLevel) {
  if (!topLevel) {
    return null;
  }
  if (statement.type === 'function_declaration') {
    return statement;
  }
  return isExportedFunction(statement) ? children(statement)[0] : null;
}

// Returns true when the statement ends the current function body.
function controlStatement(context, statement, topLevel) {
  if (!hasBranches(context)) {
    return null;
  }
  if (statement.type === 'if_statement') {
    return branchStatement(context, statement, expression, executeStatement);
  }
  if (statement.type === 'statement_block') {
    return nestedBlock(context, statement, topLevel);
  }
  return null;
}

function executeStatement(context, statement, topLevel = false) {
  spend(context, statement);
  const fn = topLevelFunction(statement, topLevel);
  const control = controlStatement(context, statement, topLevel);
  if (control !== null) {
    return control;
  }
  if (
    ['lexical_declaration', 'variable_declaration'].includes(statement.type)
  ) {
    declaration(context, statement);
  } else if (statement.type === 'expression_statement') {
    expression(context, children(statement)[0]);
  } else if (statement.type === 'return_statement' && !topLevel) {
    for (const value of children(statement)) {
      expression(context, value);
    }
    return true;
  } else if (fn) {
    functionScope(context, fn);
  } else if (
    statement.type !== 'empty_statement' &&
    statement.type !== 'hash_bang_line'
  ) {
    unsupported(statement);
  }
  return false;
}

function statements(context, node, topLevel) {
  inventoryScope(context, node, topLevel);
  return executeBlock(context, node, topLevel);
}

export function analyzeTaint(root, path, language, rules) {
  const findings = [];
  const budget = { remaining: 100_000, branches: 256 };
  for (const rule of rules.filter((entry) =>
    entry.languages.includes(language)
  )) {
    const calls = new Set([
      ...rule.sources,
      ...rule.sanitizers,
      ...rule.propagators,
      ...rule.sinks.map((sink) => sink.call),
    ]);
    const context = {
      root,
      path,
      rule,
      budget,
      calls,
      findings: [],
      env: new Map(),
      constants: new Set(),
      controlDepth: 0,
      modelRoots: new Set([...calls].map((call) => call.split('.')[0])),
    };
    try {
      statements(context, root, true);
      findings.push(...context.findings);
    } catch (error) {
      if (!(error instanceof UnsupportedFlow)) {
        throw error;
      }
      findings.push({
        ruleId: 'unsupported-analysis',
        severity: 'error',
        message: `${rule.id}: ${error.message}`,
        line: error.node.startPosition.row + 1,
        column: error.node.startPosition.column + 1,
      });
    }
  }
  return findings;
}
