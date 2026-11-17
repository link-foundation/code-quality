// Original structural adapter for CMake's public language grammar (modern policies).
// It never executes commands, expands variables or evaluates project conditions.
class Reader {
  constructor(source, { tokens = false } = {}) {
    this.source = source;
    this.index = source.startsWith('\uFEFF') ? 1 : 0;
    this.errors = [];
    this.arguments = 0;
    this.tokens = tokens ? [] : null;
  }

  token(kind, start, end, flags = {}) {
    if (!this.tokens) {
      return;
    }
    if (this.tokens.length >= 100_000) {
      throw new Error('CMake token count budget exceeded');
    }
    this.tokens.push({ kind, start, end, ...flags });
  }

  error(message, index = this.index) {
    if (this.errors.length >= 1000) {
      throw new Error('CMake diagnostic count budget exceeded');
    }
    this.errors.push({ index, message });
  }

  bracket() {
    const start = this.index;
    if (this.source[start] !== '[') {
      return null;
    }
    let open = start + 1;
    while (this.source[open] === '=') {
      open++;
    }
    if (this.source[open] !== '[') {
      return null;
    }
    const close = `]${this.source.slice(start + 1, open)}]`;
    const end = this.source.indexOf(close, open + 1);
    if (end < 0) {
      this.error('Unclosed bracket argument or comment', start);
      this.index = this.source.length;
      return '';
    }
    this.index = end + close.length;
    return this.source
      .slice(open + 1, end)
      .replace(/^\r?\n/, '')
      .replace(/\r\n/g, '\n');
  }

  trivia() {
    let newline = false;
    let bracketBeforeCommand = false;
    while (this.index < this.source.length) {
      const value = this.source[this.index];
      if (/[ \t\r\n]/.test(value)) {
        newline ||= value === '\n';
        if (value === '\n') {
          bracketBeforeCommand = false;
        }
        this.index++;
      } else if (value === '#') {
        this.index++;
        if (this.bracket() === null) {
          const end = this.source.indexOf('\n', this.index);
          this.index = end < 0 ? this.source.length : end;
        } else {
          bracketBeforeCommand = true;
        }
      } else {
        break;
      }
    }
    return { newline, bracketBeforeCommand };
  }

  escape(quoted) {
    const start = this.index++;
    const value = this.source[this.index++];
    if (value === undefined) {
      this.error('Incomplete escape sequence', start);
      return '';
    }
    if (value === '\r' && this.source[this.index] === '\n') {
      this.index++;
      return quoted ? '' : '\n';
    }
    if (value === '\n') {
      return quoted ? '' : '\n';
    }
    if (value === ';') {
      return '\\;';
    }
    if ('trn'.includes(value)) {
      return { t: '\t', r: '\r', n: '\n' }[value];
    }
    if (/[A-Za-z0-9]/.test(value)) {
      this.error('Invalid escape sequence', start);
    }
    return value;
  }

  argument() {
    const bracket = this.bracket();
    if (bracket !== null) {
      const next = this.source[this.index];
      if (next !== undefined && !/[ \t\r\n()#]/.test(next)) {
        this.error('Expected separation after a bracket argument');
      }
      return { value: bracket, kind: 'bracket', dynamic: false };
    }
    return this.textArgument();
  }

  reference(quoted) {
    const dynamic = ['${', '$ENV{', '$CACHE{'].some((prefix) =>
      this.source.startsWith(prefix, this.index)
    );
    const makeReference = /\$\([A-Za-z_][A-Za-z0-9_]*\)/y;
    makeReference.lastIndex = this.index;
    const make = !quoted && makeReference.exec(this.source);
    const value = make ? make[0] : '$';
    this.index += value.length;
    return { value, dynamic };
  }

  textArgument() {
    const start = this.index;
    const quoted = this.source[this.index] === '"';
    if (quoted) {
      this.index++;
    }
    let legacyQuote = false;
    let closed = !quoted;
    let value = '';
    let dynamic = false;
    while (this.index < this.source.length) {
      const char = this.source[this.index];
      if (char === '\\') {
        value += this.escape(quoted);
        continue;
      }
      if (char === '"') {
        this.index++;
        if (quoted) {
          closed = true;
          break;
        }
        legacyQuote = !legacyQuote;
        value += char;
        continue;
      }
      if (!quoted && !legacyQuote && /[ \t\r\n()#]/.test(char)) {
        break;
      }
      if (char === '$') {
        const reference = this.reference(quoted);
        dynamic ||= reference.dynamic;
        value += reference.value;
        continue;
      }
      value += char;
      this.index++;
    }
    if (!closed || legacyQuote) {
      this.error('Unclosed quoted argument', start);
    }
    return {
      value: value.replace(/\r\n/g, '\n'),
      kind: quoted ? 'quoted' : 'unquoted',
      dynamic,
    };
  }

  commandArguments() {
    const args = [];
    let depth = 1;
    this.token('cmake_parenthesis', this.index, this.index + 1);
    this.index++;
    while (this.index < this.source.length) {
      this.trivia();
      const char = this.source[this.index];
      if (char !== undefined && ++this.arguments > 200_000) {
        throw new Error('CMake argument count budget exceeded');
      }
      if (char === '(') {
        if (++depth > 512) {
          throw new Error('CMake parenthesis depth budget exceeded');
        }
        this.token('cmake_parenthesis', this.index, this.index + 1);
        this.index++;
        args.push({ value: char, kind: 'unquoted', dynamic: false });
      } else if (char === ')') {
        this.token('cmake_parenthesis', this.index, this.index + 1);
        this.index++;
        if (--depth === 0) {
          return args;
        }
        args.push({ value: char, kind: 'unquoted', dynamic: false });
      } else if (char !== undefined) {
        const start = this.index;
        const argument = this.argument();
        args.push(argument);
        if (this.tokens) {
          const text = this.source.slice(start, this.index);
          const identifier =
            argument.kind === 'unquoted' &&
            /^[A-Za-z_][A-Za-z0-9_]*$/.test(text);
          this.token(`cmake_${argument.kind}`, start, this.index, {
            identifier,
            literal: !identifier && !argument.dynamic && !text.includes('$<'),
          });
        }
      }
    }
    this.error('Unclosed command invocation');
    return args;
  }

  commands() {
    const commands = [];
    let needsNewline = false;
    const identifier = /[A-Za-z_][A-Za-z0-9_]*/y;
    while (this.index < this.source.length) {
      const { newline, bracketBeforeCommand } = this.trivia();
      if (this.index === this.source.length) {
        break;
      }
      if ((needsNewline && !newline) || bracketBeforeCommand) {
        this.error('Expected a newline between command invocations');
      }
      const start = this.index;
      identifier.lastIndex = start;
      const name = identifier.exec(this.source)?.[0];
      if (!name) {
        this.error('Expected a command invocation');
        this.index++;
        continue;
      }
      this.index = identifier.lastIndex;
      while (/[ \t]/.test(this.source[this.index] || '\0')) {
        this.index++;
      }
      if (this.source[this.index] !== '(') {
        this.error(
          'Expected an opening parenthesis on the command name line',
          start
        );
        continue;
      }
      if (commands.length >= 50_000) {
        throw new Error('CMake command count budget exceeded');
      }
      this.token('cmake_command', start, start + name.length, {
        identifier: true,
      });
      const args = this.commandArguments();
      commands.push({ name: name.toLowerCase(), start, end: this.index, args });
      needsNewline = true;
    }
    return commands;
  }
}

function listElements(value) {
  const result = [];
  let brackets = 0;
  let element = '';
  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    if (char === '\\' && value[index + 1] === ';') {
      element += ';';
      index++;
    } else if (char === ';' && brackets === 0) {
      if (element) {
        result.push(element);
      }
      element = '';
    } else {
      if (char === '[') {
        brackets++;
      }
      if (char === ']') {
        brackets--;
      }
      element += char;
    }
  }
  if (element) {
    result.push(element);
  }
  return result;
}

function definition(command, parent, limitations, errors) {
  const unresolved = command.args.some(
    (arg) => arg.kind === 'unquoted' && arg.dynamic
  );
  const argumentsWithValues = command.args.flatMap((arg) =>
    (arg.kind === 'unquoted' ? listElements(arg.value) : [arg.value]).map(
      (value) => ({ value, dynamic: arg.dynamic })
    )
  );
  const values = argumentsWithValues.map((arg) => arg.value);
  if (!unresolved && !values.length) {
    errors.push({
      index: command.start,
      message: `${command.name} requires a name`,
    });
  }
  if (unresolved) {
    limitations.push({
      index: command.start,
      message:
        'CMake formal parameter arity requires variable expansion; it was not measured',
    });
  }
  const first = argumentsWithValues[0];
  if (first?.dynamic && !unresolved) {
    limitations.push({
      index: command.start,
      message:
        'CMake definition name requires variable expansion; its identity was not resolved',
    });
  }
  const name = first?.dynamic ? '<dynamic>' : (values[0] ?? '<anonymous>');
  const qualifiedName = parent ? `${parent.qualifiedName}.${name}` : name;
  if (qualifiedName.length > 4096) {
    throw new Error('CMake definition name length budget exceeded');
  }
  return {
    kind: command.name,
    name,
    qualifiedName,
    start: command.start,
    parameters: unresolved ? null : Math.max(0, values.length - 1),
    complexity: 1,
  };
}

function extractBlocks(commands, errors, limitations) {
  const abstractions = [];
  const stack = [];
  const definitions = [];
  const blocks = new Set([
    'function',
    'macro',
    'if',
    'foreach',
    'while',
    'block',
  ]);
  const decisions = new Set(['if', 'elseif', 'foreach', 'while']);
  let spanBytes = 0;
  for (const command of commands) {
    if (decisions.has(command.name) && definitions.length) {
      definitions.at(-1).complexity++;
    }
    if (blocks.has(command.name)) {
      if (stack.length >= 512) {
        throw new Error('CMake block depth budget exceeded');
      }
      const entry = { ...command };
      if (['function', 'macro'].includes(command.name)) {
        entry.abstraction = definition(
          command,
          definitions.at(-1),
          limitations,
          errors
        );
        definitions.push(entry.abstraction);
      }
      stack.push(entry);
    } else if (['elseif', 'else'].includes(command.name)) {
      checkBranch(command, stack, errors);
    } else if (
      command.name.startsWith('end') &&
      blocks.has(command.name.slice(3))
    ) {
      spanBytes += closeBlock(
        command,
        stack,
        definitions,
        abstractions,
        errors
      );
      if (spanBytes > 4_194_304) {
        throw new Error('CMake abstraction metadata budget exceeded');
      }
    }
    if (errors.length + limitations.length > 1000) {
      throw new Error('CMake diagnostic count budget exceeded');
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

function checkBranch(command, stack, errors) {
  const block = stack.at(-1);
  if (block?.name !== 'if' || block.hasElse) {
    errors.push({
      index: command.start,
      message: `Unexpected ${command.name}`,
    });
  }
  if (block && command.name === 'else') {
    block.hasElse = true;
  }
}

function closeBlock(command, stack, definitions, abstractions, errors) {
  const block = stack.at(-1);
  if (!block || command.name !== `end${block.name}`) {
    errors.push({
      index: command.start,
      message: `Mismatched ${command.name}`,
    });
    return 0;
  }
  stack.pop();
  if (!block.abstraction) {
    return 0;
  }
  definitions.pop();
  abstractions.push({ ...block.abstraction, end: command.end });
  return (command.end - block.start) * 2;
}

export function parseCmake(source, options) {
  if (source.length > 1_048_576) {
    throw new Error('CMake source length budget exceeded');
  }
  const reader = new Reader(source, options);
  const commands = reader.commands();
  const limitations = [];
  const abstractions = extractBlocks(commands, reader.errors, limitations);
  return {
    errors: reader.errors,
    limitations,
    commands,
    abstractions,
    ...(reader.tokens && { tokens: reader.tokens }),
  };
}
