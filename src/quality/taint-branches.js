import { UnsupportedFlow, spend, mergeValues } from './taint-values.js';

export const hasBranches = (context) =>
  context.rule.controlFlow === 'branch-joins';

// Values and their traces are immutable. Each arm owns its binding map, while
// findings and work accounting remain shared across every possible arm.
export function forkBranches(context, node) {
  if (--context.budget.branches < 0 || context.controlDepth >= 32) {
    throw new UnsupportedFlow(node, 'branch count or nesting budget exceeded');
  }
  let copies = 0;
  for (const value of context.env.values()) {
    copies += 1;
    for (const trace of value.values()) copies += trace.length;
  }
  spend(context, node, 2 * copies);
  return [0, 1].map(() => ({
    ...context,
    env: new Map(context.env),
    constants: new Set(context.constants),
    controlDepth: context.controlDepth + 1,
  }));
}

export function joinBranches(context, node, continuing) {
  if (!continuing.length) return true;
  for (const name of context.env.keys()) {
    context.env.set(
      name,
      mergeValues(context, node, continuing.map((arm) => arm.env.get(name)))
    );
  }
  return false;
}

export function branchStatement(context, node, evaluate, execute) {
  evaluate(context, node.childForFieldName('condition'));
  const arms = forkBranches(context, node);
  const consequence = node.childForFieldName('consequence');
  const alternative = node.childForFieldName('alternative')?.namedChildren
    .find((child) => child.type !== 'comment');
  const ended = [
    execute(arms[0], consequence),
    alternative ? execute(arms[1], alternative) : false,
  ];
  return joinBranches(context, node, arms.filter((_, index) => !ended[index]));
}

export function branchExpression(context, node, evaluate, depth) {
  const ternary = node.type === 'ternary_expression';
  const condition = node.childForFieldName(ternary ? 'condition' : 'left');
  const first = evaluate(context, condition, depth + 1);
  const arms = forkBranches(context, node);
  const left = ternary
    ? evaluate(arms[0], node.childForFieldName('consequence'), depth + 1)
    : first;
  const right = evaluate(
    arms[1],
    node.childForFieldName(ternary ? 'alternative' : 'right'),
    depth + 1
  );
  joinBranches(context, node, arms);
  return mergeValues(context, node, [left, right]);
}
