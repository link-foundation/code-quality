export class UnsupportedFlow extends Error {
  constructor(node, message) {
    super(`Taint analysis: ${message}`);
    this.node = node;
  }
}

export function isSimpleBinding(node) {
  return (
    node?.type === 'identifier' && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(node.text)
  );
}

export function spend(context, node, count = 1, depth = 0) {
  context.budget.remaining -= count;
  if (context.budget.remaining < 0 || depth > 128) {
    throw new UnsupportedFlow(node, 'work or depth budget exceeded');
  }
}

export function step(context, node, kind, name) {
  return {
    kind,
    name,
    path: context.path,
    start: node.startIndex,
    end: node.endIndex,
    line: node.startPosition.row + 1,
    column: node.startPosition.column + 1,
    endLine: node.endPosition.row + 1,
    endColumn: node.endPosition.column + 1,
  };
}

export function sourceValue(context, node, kind, name) {
  return new Map([[`${node.startIndex}`, [step(context, node, kind, name)]]]);
}

export function mergeValues(context, node, values) {
  const result = new Map();
  for (const value of values) {
    for (const [key, trace] of value) {
      spend(context, node, trace.length);
      if (!result.has(key)) {
        result.set(key, trace);
      }
    }
  }
  if (result.size > 64) {
    throw new UnsupportedFlow(
      node,
      'source inventory exceeds 64 origins per value'
    );
  }
  return result;
}

export function appendStep(context, node, value, kind, name) {
  const location = step(context, node, kind, name);
  return new Map(
    [...value].map(([key, trace]) => {
      spend(context, node, trace.length + 1);
      if (trace.length >= 128) {
        throw new UnsupportedFlow(node, 'trace exceeds 128 locations');
      }
      return [key, [...trace, location]];
    })
  );
}

export function bind(context, node, value, declare, constant = false) {
  const name = node?.text;
  if (!isSimpleBinding(node) || context.modelRoots.has(name)) {
    throw new UnsupportedFlow(
      node || context.root,
      'binding must be a simple ASCII identifier without shadowing a call model'
    );
  }
  if (declare === context.env.has(name)) {
    throw new UnsupportedFlow(
      node,
      declare ? 'duplicate binding' : 'assignment to an unresolved binding'
    );
  }
  if (!declare && context.constants.has(name)) {
    throw new UnsupportedFlow(node, 'assignment to a constant binding');
  }
  if (!context.env.has(name) && context.env.size >= 512) {
    throw new UnsupportedFlow(node, 'binding inventory exceeds 512 names');
  }
  context.env.set(name, appendStep(context, node, value, 'assignment', name));
  if (constant) {
    context.constants.add(name);
  }
}
