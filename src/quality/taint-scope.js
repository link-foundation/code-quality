import { UnsupportedFlow, spend, isSimpleBinding } from './taint-values.js';

const children = (node) =>
  node.namedChildren.filter((child) => child.type !== 'comment');

function statementBindings(statement, topLevel) {
  let bindings = [];
  if (
    ['lexical_declaration', 'variable_declaration'].includes(statement.type)
  ) {
    bindings = children(statement).map((entry) =>
      entry.childForFieldName('name')
    );
  } else if (statement.type === 'function_declaration' && topLevel) {
    bindings = [statement.childForFieldName('name')];
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
export function inventoryScope(context, node, topLevel) {
  const seen = new Set(context.env.keys());
  for (const statement of children(node)) {
    spend(context, statement);
    for (const binding of statementBindings(statement, topLevel)) {
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
}
