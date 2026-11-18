const languages = ['javascript', 'typescript', 'tsx'];
const identifier = '[A-Za-z_$][A-Za-z0-9_$]*';
const callName = new RegExp(`^${identifier}(?:\\.${identifier})*$`);

function object(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
}

function names(value, name, required = false) {
  if (
    !Array.isArray(value) ||
    value.length > 32 ||
    (required && !value.length) ||
    value.some(
      (entry) =>
        typeof entry !== 'string' || entry.length > 256 || !callName.test(entry)
    ) ||
    new Set(value).size !== value.length
  ) {
    throw new Error(`${name} must contain at most 32 unique static call names`);
  }
  return [...value];
}

function sinks(value) {
  if (!Array.isArray(value) || !value.length || value.length > 32) {
    throw new Error('Taint sinks must contain 1..32 models');
  }
  const seen = new Set();
  return value.map((entry) => {
    object(entry, 'Taint sink');
    if (Object.keys(entry).some((key) => !['call', 'argument'].includes(key))) {
      throw new Error('Unknown taint sink option');
    }
    names([entry.call], 'Taint sink call', true);
    if (
      !Number.isSafeInteger(entry.argument) ||
      entry.argument < 0 ||
      entry.argument > 31
    ) {
      throw new Error('Taint sink argument must be an integer in [0, 31]');
    }
    const key = `${entry.call}:${entry.argument}`;
    if (seen.has(key)) {
      throw new Error('Duplicate taint sink');
    }
    seen.add(key);
    return { call: entry.call, argument: entry.argument };
  });
}

function metadata(rule, ids) {
  object(rule, 'Taint rule');
  if (
    Object.keys(rule).some(
      (key) =>
        ![
          'id',
          'message',
          'severity',
          'languages',
          'sources',
          'sinks',
          'sanitizers',
          'propagators',
        ].includes(key)
    )
  ) {
    throw new Error('Unknown taint rule option');
  }
  if (
    typeof rule.id !== 'string' ||
    !/^[\w/-]{1,128}$/.test(rule.id) ||
    ids.has(rule.id)
  ) {
    throw new Error('Taint rules need a unique id');
  }
  ids.add(rule.id);
  if (
    typeof rule.message !== 'string' ||
    !rule.message ||
    rule.message.length > 2048
  ) {
    throw new Error('Taint rules need a message of at most 2048 characters');
  }
  const severity = rule.severity ?? 'error';
  if (!['note', 'warning', 'error'].includes(severity)) {
    throw new Error('Invalid taint severity');
  }
  return { id: rule.id, message: rule.message, severity };
}

function ruleConfig(rule, ids) {
  const description = metadata(rule, ids);
  if (
    !Array.isArray(rule.languages) ||
    !rule.languages.length ||
    rule.languages.length > 3 ||
    rule.languages.some((language) => !languages.includes(language)) ||
    new Set(rule.languages).size !== rule.languages.length
  ) {
    throw new Error(
      'Taint languages must explicitly select javascript, typescript or tsx'
    );
  }
  const sources = names(rule.sources, 'Taint sources');
  const sanitizers = names(rule.sanitizers ?? [], 'Taint sanitizers');
  const propagators = names(rule.propagators ?? [], 'Taint propagators');
  const sinkModels = sinks(rule.sinks);
  const categories = [
    sources,
    sanitizers,
    propagators,
    [...new Set(sinkModels.map((sink) => sink.call))],
  ];
  const calls = categories.flat();
  if (new Set(calls).size !== calls.length) {
    throw new Error('Taint call models must have disjoint roles');
  }
  return {
    ...description,
    languages: [...rule.languages],
    sources,
    sinks: sinkModels,
    sanitizers,
    propagators,
  };
}

export function validateTaintRules(input = [], reserved = []) {
  if (!Array.isArray(input) || input.length > 25) {
    throw new Error('taintRules must contain at most 25 rules');
  }
  const ids = new Set(reserved);
  return input.map((rule) => ruleConfig(rule, ids));
}
