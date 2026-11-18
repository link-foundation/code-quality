const arithmetic = new Map([
  ['+', '-'],
  ['-', '+'],
  ['*', '/'],
  ['/', '*'],
]);
const comparisons = new Map([
  ['-eq', '-ne'],
  ['-ne', '-eq'],
  ['-gt', '-le'],
  ['-ge', '-lt'],
  ['-lt', '-ge'],
  ['-le', '-gt'],
  ['=', '!='],
  ['==', '!='],
  ['!=', '=='],
]);
const ordering = new Map([
  ['<', '>='],
  ['<=', '>'],
  ['>', '<='],
  ['>=', '<'],
]);

export function validateMutationPolicy(policy = 'standard') {
  if (!['standard', 'expanded'].includes(policy)) {
    throw new Error('Shell mutation policy must be standard or expanded');
  }
  return policy;
}

function arithmeticContext(node) {
  let parent = node.parent;
  for (let depth = 0; parent && depth < 512; depth++, parent = parent.parent) {
    if (
      ['arithmetic_expansion', 'c_style_for_statement'].includes(parent.type)
    ) {
      return true;
    }
    if (
      ![
        'binary_expression',
        'parenthesized_expression',
        'unary_expression',
        'ternary_expression',
        'assignment_expression',
        'subscript',
      ].includes(parent.type)
    ) {
      return false;
    }
  }
  if (parent) {
    throw new Error('Shell mutation arithmetic context exceeds depth budget');
  }
  return false;
}

function arithmeticReplacements(node, policy) {
  const standard = arithmetic.get(node.text);
  if (standard) {
    return policy === 'expanded' && node.text === '*'
      ? [standard, '+']
      : [standard];
  }
  const expanded = policy === 'expanded' && ordering.get(node.text);
  return expanded && arithmeticContext(node) ? [expanded] : [];
}

function grammarReplacements(node, policy) {
  const binaryOperator =
    node.parent?.type === 'binary_expression' &&
    node.parent.childForFieldName('operator')?.id === node.id;
  const comparison =
    (binaryOperator || node.type === 'test_operator') &&
    comparisons.get(node.text);
  if (comparison) {
    return [comparison];
  }
  if (
    ['&&', '||'].includes(node.type) &&
    (binaryOperator || node.parent?.type === 'list')
  ) {
    return [node.type === '&&' ? '||' : '&&'];
  }
  return binaryOperator ? arithmeticReplacements(node, policy) : [];
}

export function operatorReplacements(node, policy) {
  if (node.childCount !== 0) {
    return [];
  }
  const replacements = grammarReplacements(node, policy);
  if (replacements.length) {
    return replacements;
  }
  if (node.type === 'number' && /^[01]$/.test(node.text)) {
    return [node.text === '0' ? '1' : '0'];
  }
  return [];
}
