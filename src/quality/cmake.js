// Native adapter for CMake's documented command/bracket syntax. It never runs CMake.
// Semantic command validation remains the responsibility of CMake itself.
function bracketEnd(source, match, tokens, errors) {
  const close = `]${match[1]}]`;
  const end = source.indexOf(close, tokens.lastIndex);
  if (end < 0) {
    errors.push({
      index: match.index,
      message: 'Unclosed bracket argument or comment',
    });
    tokens.lastIndex = source.length;
    return;
  }
  tokens.lastIndex = end + close.length;
}

function consumeArgument(source, match, tokens, errors) {
  const value = match[0];
  if (/^#?\[=*\[$/.test(value)) {
    bracketEnd(source, match, tokens, errors);
    return true;
  }
  if (value === '"') {
    errors.push({ index: match.index, message: 'Unclosed quoted argument' });
    tokens.lastIndex = source.length;
    return true;
  }
  return (
    value.startsWith('#') || value.startsWith('"') || value.startsWith('\\')
  );
}

function checkArgumentContext(match, depth, errors) {
  if (depth === 0 && !match[0].startsWith('#')) {
    errors.push({
      index: match.index,
      message: 'Argument outside a command invocation',
    });
  }
}

function readCommands(source, errors) {
  const commands = [];
  const tokens =
    /#?\[(=*)\[|#.*|"(?:\\[\s\S]|[^"\\])*"|\\[\s\S]|[A-Za-z_][\w]*|[()]|[^\s]/g;
  let depth = 0;
  let current;
  let match;
  while ((match = tokens.exec(source))) {
    const value = match[0];
    if (consumeArgument(source, match, tokens, errors)) {
      checkArgumentContext(match, depth, errors);
      continue;
    }
    if (value === '(') {
      if (depth === 0 && !current) {
        errors.push({ index: match.index, message: 'Missing command name' });
      }
      depth++;
    } else if (value === ')') {
      depth--;
      if (depth < 0) {
        errors.push({
          index: match.index,
          message: 'Unexpected closing parenthesis',
        });
        depth = 0;
      }
      if (depth === 0 && current) {
        commands.push({
          ...current,
          end: tokens.lastIndex,
          text: source.slice(current.start, tokens.lastIndex),
        });
        current = null;
      }
    } else if (depth === 0) {
      if (current || !/^[A-Za-z_]\w*$/.test(value)) {
        errors.push({
          index: match.index,
          message: 'Expected a command invocation',
        });
      }
      current = { name: value.toLowerCase(), start: match.index };
    }
  }
  if (depth || current) {
    errors.push({
      index: source.length,
      message: 'Unclosed command invocation',
    });
  }
  return commands;
}

function extractBlocks(commands, errors) {
  const abstractions = [];
  const stack = [];
  const blocks = ['function', 'macro', 'if', 'foreach', 'while', 'block'];
  for (const command of commands) {
    if (blocks.includes(command.name)) {
      stack.push(command);
      continue;
    }
    if (!blocks.map((name) => `end${name}`).includes(command.name)) {
      continue;
    }
    const start = stack.pop();
    if (!start || command.name !== `end${start.name}`) {
      errors.push({
        index: command.start,
        message: `Mismatched ${command.name}`,
      });
      continue;
    }
    if (['function', 'macro'].includes(start.name)) {
      abstractions.push({
        kind: start.name,
        name: start.text.match(/\(\s*([^\s)]+)/)?.[1] || '<anonymous>',
        start: start.start,
        end: command.end,
      });
    }
  }
  for (const command of stack) {
    errors.push({
      index: command.start,
      message: `Missing end${command.name}`,
    });
  }
  return abstractions;
}

export function parseCmake(source) {
  const errors = [];
  const commands = readCommands(source, errors);
  return { errors, commands, abstractions: extractBlocks(commands, errors) };
}
