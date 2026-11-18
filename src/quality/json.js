// JSON.parse accepts repeated object names by silently keeping the last value.
// Interchange and baseline inputs must have exactly one meaning. Scan valid JSON
// iteratively, decoding keys so escaped aliases are duplicates too.
function quotedEnd(source, index) {
  index++;
  while (index < source.length && source[index] !== '"') {
    if (source[index] === '\\') {
      index++;
    }
    index++;
  }
  return index;
}

function uniqueKey(current, source) {
  if (!current?.key) {
    return;
  }
  const key = JSON.parse(source);
  if (current.names.has(key)) {
    throw new Error(
      `Duplicate JSON property: ${JSON.stringify(key).slice(0, 160)}`
    );
  }
  current.names.add(key);
}

export function parseUniqueJson(source) {
  const value = JSON.parse(source);
  const stack = [];
  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    const current = stack.at(-1);
    if (character === '"') {
      const start = index;
      index = quotedEnd(source, index);
      uniqueKey(current, source.slice(start, index + 1));
    } else if (character === '{' || character === '[') {
      if (stack.length >= 128) {
        throw new Error('JSON nesting exceeds 128-level budget');
      }
      stack.push(character === '{' ? { key: true, names: new Set() } : {});
    } else if (character === '}' || character === ']') {
      stack.pop();
    } else if (character === ':' && current?.names) {
      current.key = false;
    } else if (character === ',' && current?.names) {
      current.key = true;
    }
  }
  return value;
}
