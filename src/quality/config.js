export const defaultLimits = Object.freeze({
  maxFiles: 1000,
  maxFileBytes: 1_048_576,
  maxTotalBytes: 16_777_216,
});
export const defaultRules = Object.freeze({
  'file-lines': 1500,
  'function-lines': 100,
  complexity: 15,
  parameters: 6,
  'duplicate-function': true,
  'trailing-whitespace': true,
  'final-newline': true,
  'unsafe-eval': true,
  'hardcoded-secret': true,
});
export const severities = Object.freeze(['note', 'warning', 'error']);

export function positiveInteger(value, name, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) {
    throw new Error(`${name} must be an integer in [1, ${max}]`);
  }
  return value;
}

export function requireObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
}

function limitsConfig(input = {}) {
  requireObject(input, 'limits');
  const limits = { ...defaultLimits, ...input };
  for (const key of Object.keys(limits)) {
    if (!Object.hasOwn(defaultLimits, key)) {
      throw new Error(`Unknown limit: ${key}`);
    }
    positiveInteger(limits[key], key, defaultLimits[key]);
  }
  return limits;
}

function rulesConfig(input = {}) {
  requireObject(input, 'rules');
  const rules = { ...defaultRules, ...input };
  for (const [name, value] of Object.entries(rules)) {
    if (!Object.hasOwn(defaultRules, name)) {
      throw new Error(`Unknown rule: ${name}`);
    }
    if (value === false) {
      continue;
    }
    if (typeof defaultRules[name] === 'number') {
      positiveInteger(value, name);
    } else if (typeof value !== 'boolean') {
      throw new Error(`${name} must be boolean`);
    }
  }
  return rules;
}

function validatePattern(rule) {
  requireObject(rule.pattern, `Custom rule ${rule.id} pattern`);
  if (!['kind', 'text'].some((key) => typeof rule.pattern[key] === 'string')) {
    throw new Error(
      `Custom rule ${rule.id} needs a kind or literal text pattern`
    );
  }
  if (rule.pattern.text === '') {
    throw new Error('Empty literal patterns are forbidden');
  }
  if (
    rule.languages &&
    (!Array.isArray(rule.languages) ||
      rule.languages.some((id) => typeof id !== 'string'))
  ) {
    throw new Error('Rule languages must be an array of ids');
  }
}

function customConfig(customRules = []) {
  if (!Array.isArray(customRules) || customRules.length > 100) {
    throw new Error('customRules must be an array of at most 100 rules');
  }
  const names = new Set([
    'syntax',
    'unsupported-analysis',
    'duplicate-tokens',
    ...Object.keys(defaultRules),
  ]);
  for (const rule of customRules) {
    requireObject(rule, 'Custom rule');
    if (
      typeof rule.id !== 'string' ||
      !/^[\w/-]+$/.test(rule.id) ||
      names.has(rule.id)
    ) {
      throw new Error('Custom rules need a unique id');
    }
    if (
      typeof rule.message !== 'string' ||
      !rule.message ||
      !severities.includes(rule.severity || 'warning')
    ) {
      throw new Error('Custom rules need a message and valid severity');
    }
    names.add(rule.id);
    validatePattern(rule);
  }
  return customRules;
}

function clonesConfig(input) {
  if (input === undefined || input === false) {
    return false;
  }
  requireObject(input, 'clones');
  const config = {
    minTokens: 50,
    ignoreIdentifiers: false,
    ignoreLiterals: false,
    suppressionComments: false,
    ...input,
  };
  for (const key of Object.keys(config)) {
    if (
      ![
        'minTokens',
        'ignoreIdentifiers',
        'ignoreLiterals',
        'suppressionComments',
      ].includes(key)
    ) {
      throw new Error(`Unknown clone option: ${key}`);
    }
  }
  positiveInteger(config.minTokens, 'clones.minTokens', 1000);
  for (const key of [
    'ignoreIdentifiers',
    'ignoreLiterals',
    'suppressionComments',
  ]) {
    if (typeof config[key] !== 'boolean') {
      throw new Error(`clones.${key} must be boolean`);
    }
  }
  // Explicit false and absence retain the pre-suppression method fingerprint.
  if (!config.suppressionComments) {
    delete config.suppressionComments;
  }
  return config;
}

export function validateConfig(config = {}) {
  requireObject(config, 'Configuration');
  for (const key of Object.keys(config)) {
    if (
      ![
        'rules',
        'limits',
        'exclude',
        'customRules',
        'failOn',
        'adapters',
        'clones',
      ].includes(key)
    ) {
      throw new Error(`Unknown configuration key: ${key}`);
    }
  }
  const failOn = config.failOn || 'warning';
  if (!severities.includes(failOn)) {
    throw new Error('failOn must be note, warning or error');
  }
  const exclude = config.exclude || [];
  if (
    !Array.isArray(exclude) ||
    exclude.some((value) => typeof value !== 'string' || !value)
  ) {
    throw new Error('exclude must contain nonempty path prefixes');
  }
  if (config.adapters && !Array.isArray(config.adapters)) {
    throw new Error('adapters must be an array');
  }
  return {
    ...config,
    limits: limitsConfig(config.limits),
    rules: rulesConfig(config.rules),
    failOn,
    exclude,
    customRules: customConfig(config.customRules),
    clones: clonesConfig(config.clones),
  };
}

export function safePath(path) {
  if (
    typeof path !== 'string' ||
    !path ||
    path.includes('\0') ||
    path.includes('\\') ||
    path.startsWith('/') ||
    /^[a-z]:/i.test(path)
  ) {
    throw new Error(
      `Expected a relative portable file path: ${JSON.stringify(path)}`
    );
  }
  if (path.split('/').some((part) => ['..', '.', ''].includes(part))) {
    throw new Error(
      `Expected a relative portable file path: ${JSON.stringify(path)}`
    );
  }
  return path;
}
