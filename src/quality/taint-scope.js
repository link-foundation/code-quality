import { UnsupportedFlow, spend, isSimpleBinding } from './taint-values.js';
import { hasBranches } from './taint-branches.js';

const children = (node) =>
  node.namedChildren.filter((child) => child.type !== 'comment');

function statementBindings(statement, topLevel, branches, nested) {
  let bindings = [];
  if (
    ['lexical_declaration', 'variable_declaration'].includes(statement.type)
  ) {
    if (nested && statement.type === 'variable_declaration') {
      throw new UnsupportedFlow(statement, 'var in a nested block');
    }
    bindings = children(statement).map((entry) =>
      entry.childForFieldName('name')
    );
  } else if (statement.type === 'function_declaration' && topLevel) {
    bindings = [statement.childForFieldName('name')];
  } else if (
    branches && ['if_statement', 'statement_block'].includes(statement.type)
  ) {
    // Child scopes are inventoried after all declarations in this scope.
  } else if (
    statement.type === 'export_statement' &&
    topLevel &&
    children(statement).length === 1 &&
    children(statement)[0].type === 'function_declaration'
  ) {
    bindings = [children(statement)[0].childForFieldName('name')];
  } else if (
    !['expression_statement', 'empty_statement', 'hash_bang_line'].includes(
      statement.type
    ) &&
    !(statement.type === 'return_statement' && !topLevel)
  ) {
    throw new UnsupportedFlow(statement, `unsupported ${statement.type}`);
  }
  return bindings;
}

// Inventory the entire scope, including declarations following a return. This
// prevents hoisted bindings or lexical TDZs from masquerading as external models.
export function inventoryScope(context, node, topLevel, inherited = context.env, depth = 0) {
  if (hasBranches(context)) spend(context, node, inherited.size, depth * 4);
  const seen = new Set(inherited.keys());
  const statements = node.type === 'program' || node.type === 'statement_block'
    ? children(node) : [node];
  for (const statement of statements) {
    spend(context, statement);
    for (const binding of statementBindings(statement, topLevel, hasBranches(context), depth > 0)) {
      spend(context, binding || statement);
      if (
        !isSimpleBinding(binding) ||
        context.modelRoots.has(binding.text) ||
        seen.has(binding.text)
      ) {
        throw new UnsupportedFlow(
          binding || statement,
          'scope needs unique simple ASCII bindings without shadowing call models'
        );
      }
      seen.add(binding.text);
    }
  }
  if (hasBranches(context)) {
    const parents = new Map([...seen].map((name) => [name, null]));
    for (const statement of statements) {
      if (statement.type === 'statement_block') {
        inventoryScope(context, statement, false, parents, depth + 1);
      } else if (statement.type === 'if_statement') {
        inventoryScope(context, statement.childForFieldName('consequence'), false, parents, depth + 1);
        const alternate = statement.childForFieldName('alternative');
        if (alternate) {
          inventoryScope(context, children(alternate)[0], false, parents, depth + 1);
        }
      }
    }
  }
}
