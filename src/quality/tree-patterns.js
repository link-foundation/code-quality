import { createHash } from 'node:crypto';
import { walk } from './syntax.js';

function validateFields(node, inventory) {
  for (const key of ['kind', 'text', 'capture']) {
    if (node[key] !== undefined) {
      if (typeof node[key] !== 'string' || node[key].length > 4096) {
        throw new Error(`Tree pattern ${key} must be a bounded string`);
      }
      inventory.bytes += Buffer.byteLength(node[key]);
    }
  }
  if (inventory.bytes > 65_536) {
    throw new Error('Tree pattern metadata budget exceeded');
  }
  if (node.kind !== undefined && !/^[A-Za-z_][\w-]{0,127}$/.test(node.kind)) {
    throw new Error('Tree pattern kind must name a syntax node');
  }
  if (
    node.capture !== undefined &&
    !/^[A-Z][A-Z0-9_]{0,63}$/.test(node.capture)
  ) {
    throw new Error('Tree pattern capture must be an uppercase name');
  }
}

function validateNode(node, sequence, inventory) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) {
    throw new Error('Tree pattern nodes must be objects');
  }
  const prototype = Object.getPrototypeOf(node);
  if (prototype !== null && prototype !== Object.prototype) {
    throw new Error('Tree pattern nodes must be plain objects');
  }
  if (node.rest === true && sequence && Object.keys(node).length === 1) {
    return false;
  }
  const fields = [
    'kind',
    'text',
    'capture',
    'children',
    'fields',
    'all',
    'any',
    'not',
  ];
  for (const key of Object.keys(node)) {
    if (!fields.includes(key)) {
      throw new Error(`Unknown tree pattern key: ${key}`);
    }
  }
  if (!fields.some((key) => node[key] !== undefined)) {
    throw new Error('Tree pattern nodes need a constraint or capture');
  }
  validateFields(node, inventory);
  return true;
}

export function validateTreePattern(tree, inventory) {
  let count = 0;
  const visit = (node, depth, sequence = false) => {
    if (++count > 512 || depth > 32 || ++inventory.nodes > 10_000) {
      throw new Error('Tree pattern size/depth budget exceeded');
    }
    if (!validateNode(node, sequence, inventory)) {
      return;
    }
    if (node.children !== undefined) {
      validateChildren(node.children, (child) => visit(child, depth + 1, true));
    }
    if (node.fields !== undefined) {
      validateFieldsMap(node.fields, inventory, (child) =>
        visit(child, depth + 1)
      );
    }
    for (const key of ['all', 'any']) {
      if (node[key] !== undefined) {
        validateClauses(node[key], (child) => visit(child, depth + 1));
      }
    }
    if (node.not !== undefined) {
      visit(node.not, depth + 1);
    }
  };
  visit(tree, 1);
}

function validateClauses(clauses, visit) {
  if (!Array.isArray(clauses) || !clauses.length || clauses.length > 128) {
    throw new Error('Tree pattern all/any must contain 1 to 128 patterns');
  }
  for (const clause of clauses) {
    visit(clause);
  }
}

function validateChildren(children, visit) {
  if (!Array.isArray(children) || children.length > 128) {
    throw new Error(
      'Tree pattern children must be an array of at most 128 nodes'
    );
  }
  let rests = 0;
  for (const child of children) {
    visit(child);
    rests += Number(child.rest === true);
  }
  if (rests > 1) {
    throw new Error('Tree pattern children allow at most one rest wildcard');
  }
}

function validateFieldsMap(fields, inventory, visit) {
  if (
    !fields ||
    typeof fields !== 'object' ||
    Array.isArray(fields) ||
    Object.keys(fields).length > 32
  ) {
    throw new Error(
      'Tree pattern fields must be an object of at most 32 fields'
    );
  }
  const prototype = Object.getPrototypeOf(fields);
  if (prototype !== null && prototype !== Object.prototype) {
    throw new Error('Tree pattern fields must be a plain object');
  }
  for (const [name, child] of Object.entries(fields)) {
    if (!/^[A-Za-z_][\w]{0,63}$/.test(name)) {
      throw new Error('Tree pattern field must name a grammar field');
    }
    inventory.bytes += Buffer.byteLength(name);
    visit(child);
  }
}

function spend(budget, count = 1) {
  budget.remaining -= count;
  if (budget.remaining < 0) {
    throw new Error('Tree pattern comparison budget exceeded');
  }
}

function structure(node, budget) {
  const digest = createHash('sha256');
  let commentEnd = -1;
  for (const child of walk(node)) {
    spend(budget);
    if (child.startIndex < commentEnd) {
      continue;
    }
    if (/comment/.test(child.type)) {
      commentEnd = child.endIndex;
      continue;
    }
    spend(budget, child.childCount);
    const children = child.children.filter(
      (entry) => !/comment/.test(entry.type)
    );
    const encoded = JSON.stringify([
      child.type,
      children.length,
      children.length ? null : child.childCount ? '' : child.text,
    ]);
    spend(budget, Buffer.byteLength(encoded));
    digest.update(encoded);
  }
  return digest.digest('hex');
}

function matches(node, pattern, captures, budget, namedOnly = true) {
  spend(budget);
  if ((namedOnly && !node.isNamed()) || /comment/.test(node.type)) {
    return false;
  }
  if (
    (pattern.kind !== undefined && node.type !== pattern.kind) ||
    (pattern.text !== undefined && node.text !== pattern.text)
  ) {
    return false;
  }
  if (pattern.capture) {
    const value = structure(node, budget);
    if (
      captures.has(pattern.capture) &&
      captures.get(pattern.capture) !== value
    ) {
      return false;
    }
    captures.set(pattern.capture, value);
  }
  if (!matchFields(node, pattern.fields, captures, budget)) {
    return false;
  }
  if (pattern.children && !matchChildren(node, pattern, captures, budget)) {
    return false;
  }
  return matchPredicates(node, pattern, captures, budget, namedOnly);
}

function matchPredicates(node, pattern, captures, budget, namedOnly) {
  const test = (clause) => {
    spend(budget, captures.size + 1);
    return matches(node, clause, new Map(captures), budget, namedOnly);
  };
  if (pattern.all && !pattern.all.every(test)) {
    return false;
  }
  if (pattern.any && !pattern.any.some(test)) {
    return false;
  }
  return !pattern.not || !test(pattern.not);
}

function matchFields(node, fields = {}, captures, budget) {
  for (const [name, pattern] of Object.entries(fields)) {
    spend(budget, node.childCount + 1);
    const child = node.childForFieldName(name);
    if (!child || !matches(child, pattern, captures, budget, false)) {
      return false;
    }
  }
  return true;
}

function matchChildren(node, pattern, captures, budget) {
  spend(budget, node.namedChildCount);
  const children = node.namedChildren.filter(
    (child) => !/comment/.test(child.type)
  );
  const rest = pattern.children.findIndex((child) => child.rest === true);
  const required = pattern.children.length - Number(rest !== -1);
  if (rest === -1 ? children.length !== required : children.length < required) {
    return false;
  }
  for (let index = 0; index < pattern.children.length; index++) {
    if (index === rest) {
      continue;
    }
    const offset =
      rest !== -1 && index > rest
        ? children.length - pattern.children.length
        : 0;
    if (
      !matches(
        children[index + offset],
        pattern.children[index],
        captures,
        budget
      )
    ) {
      return false;
    }
  }
  return true;
}

export function matchTreePattern(node, pattern, budget) {
  return matches(node, pattern, new Map(), budget);
}

export function usesTreePredicates(rules) {
  const pending = rules.flatMap((rule) => rule.pattern.tree || []);
  while (pending.length) {
    const pattern = pending.pop();
    if (pattern.all || pattern.any || pattern.not) {
      return true;
    }
    pending.push(
      ...(pattern.children || []),
      ...Object.values(pattern.fields || {})
    );
  }
  return false;
}
