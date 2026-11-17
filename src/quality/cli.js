import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join, relative, sep } from 'node:path';
import { URL } from 'node:url';
import {
  analyzeProject,
  languages,
  formatReport,
  extractEvolution,
  createQualityServer,
  createBaseline,
  checkBaseline,
  updateBaseline,
  shellQuality,
  doctor,
  runAdapter,
  toolRecipes,
  readGitBaseline,
  saveReport,
} from './index.js';
import { defaultRules, validateConfig, safePath } from './config.js';
import { finalizeReport } from './core.js';
import { hash } from './syntax.js';
import { atomicWriteFile, readJsonFile, withFileLock } from './persistence.js';
import { readCoverageArtifacts } from './artifacts.js';

const help = `Usage: code-quality <command> [root] [options]
Commands:
  check                  Analyze project source (never executes project code)
  qa                     Run trusted Bash syntax, ShellCheck, Bats, coverage and mutation
  lint | test | coverage | mutation  Run an independent trusted shell stage
  baseline check         Measure fresh shell QA and enforce the baseline
  baseline-update        Measure fresh shell QA and create/raise a baseline
  evolution              Extract bounded Git file/function/class evolution as JSON
  serve                  Start the JSON API (default 127.0.0.1:3000)
  languages | rules      List native language parsers or quality rules
  doctor                 Inspect configured external tool versions
Options:
  --config <file>         JSON rules, exclusions, limits and trusted adapter argv
  --format <text|json|sarif>  Check/QA report format
  --output <file>         Save output (default stdout)
  --baseline <file>       Require baseline; defaults to quality-baseline.json for qa
  --baseline-path <file> Root-relative alternative to --baseline
  --baseline-ref <ref>    Also enforce the committed baseline at this Git revision
  --reports <directory>  Save run evidence (default <root>/quality-reports for shell QA)
  --create               Explicitly create a missing baseline
  --migrate <reason>     Explicit incompatible baseline migration (baseline-update only)
  --script <path> --test <path>  Select project files (repeatable)
  --jobs <auto|1..4>     Mutation workers, default 1; scheduling does not change floors
  --tools                Execute adapters in the chosen trusted config
  --from <ref> --to <ref> --max-commits <N>  Evolution history bounds
  --max-mutants <N> --timeout-ms <N>        Shell execution bounds
  --host <address> --port <N>              API binding; token from CODE_QUALITY_TOKEN
  --help | --version
Exit status: 0 passed, 1 findings/gate failed, 2 invalid input or incomplete check.
Shell commands and adapters execute trusted code as your user.`;

function parseArgs(argv) {
  if (argv[0] === 'baseline' && argv[1] === 'check') {
    argv = ['baseline-check', ...argv.slice(2)];
  }
  const options = {};
  const positional = [];
  const boolean = new Set(['create', 'tools', 'help', 'version']);
  const valued = new Set([
    'config',
    'format',
    'output',
    'baseline',
    'baseline-path',
    'baseline-ref',
    'reports',
    'migrate',
    'script',
    'test',
    'jobs',
    'from',
    'to',
    'max-commits',
    'max-mutants',
    'timeout-ms',
    'host',
    'port',
  ]);
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const repeatable = ['script', 'test'].includes(key);
    if (Object.hasOwn(options, key) && !repeatable) {
      throw new Error(`Repeated option: ${arg}`);
    }
    if (boolean.has(key)) {
      options[key] = true;
    } else if (
      valued.has(key) &&
      argv[index + 1] &&
      !argv[index + 1].startsWith('--')
    ) {
      const value = argv[++index];
      if (repeatable) {
        (options[key] ||= []).push(value);
      } else {
        options[key] = value;
      }
    } else {
      throw new Error(`Unknown option or missing value: ${arg}`);
    }
  }
  if (positional.length > 2) {
    throw new Error('Expected a command and at most one root');
  }
  return { command: positional[0], root: positional[1] || '.', options };
}

async function loadConfig(path) {
  return path ? JSON.parse(await readFile(path, 'utf8')) : {};
}

async function emitOutput(value, context) {
  if (context.options.output) {
    await writeFile(context.options.output, value);
  } else {
    context.stdout(value);
  }
}

async function emitJson(value, context) {
  await emitOutput(`${JSON.stringify(value, null, 2)}\n`, context);
}

function baselineCommand(report, context) {
  const path =
    context.options.baseline || join(context.root, 'quality-baseline.json');
  return withFileLock(path, () => writeBaseline(report, context, path));
}

async function writeBaseline(report, context, path) {
  if (!report.passed) {
    throw new Error(
      'Shell QA must pass syntax and lint before updating a baseline'
    );
  }
  let previous;
  try {
    previous = await readJsonFile(path);
  } catch (error) {
    if (error.code !== 'ENOENT' || !context.options.create) {
      throw error;
    }
  }
  const committed = context.options['baseline-ref']
    ? await committedBaseline(context, path)
    : undefined;
  if (previous === undefined && context.options.migrate !== undefined) {
    throw new Error('Migration requires an existing baseline');
  }
  const baseline =
    previous !== undefined
      ? updateBaseline(report, previous, {
          migrate: context.options.migrate,
          committed,
        })
      : committed
        ? updateBaseline(report, committed)
        : createBaseline(report);
  const content = `${JSON.stringify(baseline, null, 2)}\n`;
  if (Buffer.byteLength(content) > 1_048_576) {
    throw new Error('Baseline exceeds byte budget');
  }
  await atomicWriteFile(path, content, { create: previous === undefined });
  report.baseline = { passed: true, failures: [] };
  report.passed = true;
  await emitOutput(
    `Baseline ${previous ? 'raised' : 'created'}: ${path}\n`,
    context
  );
  return 0;
}

function committedBaseline(context, path) {
  const local = relative(resolve(context.root), resolve(path))
    .split(sep)
    .join('/');
  return readGitBaseline(context.root, {
    ref: context.options['baseline-ref'],
    path: local,
  });
}

async function baselineGate(report, context) {
  const path =
    context.options.baseline || join(context.root, 'quality-baseline.json');
  try {
    report.baseline = checkBaseline(report, await readJsonFile(path));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
    report.baseline = {
      passed: false,
      failures: [
        `Missing baseline: ${path}; use baseline-update --create after reviewing the fresh measurements`,
      ],
    };
  }
  if (context.options['baseline-ref']) {
    const target = checkBaseline(
      report,
      await committedBaseline(context, path)
    );
    report.baseline.failures.push(
      ...target.failures.map((failure) => `Committed baseline: ${failure}`)
    );
    report.baseline.passed &&= target.passed;
  }
  report.passed =
    report.baseline.passed &&
    (!['qa', 'baseline-check'].includes(context.command) || report.passed);
}

async function checkCommand(context) {
  const { command, root, options } = context;
  const directory = options.reports
    ? resolve(root, options.reports)
    : command !== 'check'
      ? join(root, 'quality-reports')
      : null;
  if (directory && resolve(directory) === resolve(root)) {
    throw new Error('Reports directory must differ from the project root');
  }
  let report;
  let failure;
  let artifacts = {};
  context.onCoverage = async (directory) => {
    artifacts = await readCoverageArtifacts(directory);
  };
  if (directory) {
    const local = relative(resolve(root), resolve(directory))
      .split(sep)
      .join('/');
    context.excludedPaths =
      local && !local.startsWith('../') && local !== '..' ? [local] : [];
  }
  try {
    return await measuredCommand(context, (value) => {
      report = value;
    });
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    if (directory) {
      await saveReport(report, directory, { error: failure, artifacts });
    }
  }
}

async function measuredCommand(context, measured) {
  const { command, root, options, config } = context;
  const shellOptions = {
    config,
    maxMutants: Number(options['max-mutants'] || 100),
    timeoutMs: Number(options['timeout-ms'] || 30_000),
    stage: ['qa', 'baseline-update', 'baseline-check'].includes(command)
      ? 'qa'
      : command,
    scripts: options.script,
    tests: options.test,
    jobs: options.jobs === 'auto' ? 'auto' : Number(options.jobs || 1),
    onCoverage: context.onCoverage,
    excludedPaths: context.excludedPaths,
  };
  let report =
    command === 'check'
      ? await analyzeProject(root, { config })
      : await shellQuality(root, shellOptions);
  measured(report);
  if (options.tools) {
    report = await includeAdapters(report, context);
    measured(report);
  }
  if (command === 'baseline-update') {
    return baselineCommand(report, context);
  }
  if (
    options.baseline ||
    options['baseline-ref'] ||
    ['qa', 'baseline-check'].includes(command)
  ) {
    await baselineGate(report, context);
  }
  await emitOutput(formatReport(report, options.format || 'text'), context);
  return report.passed ? 0 : 1;
}

async function includeAdapters(report, { command, root, config }) {
  if (command !== 'check') {
    throw new Error(
      '--tools is supported with check; qa already executes its required tools'
    );
  }
  if (!config.adapters?.length) {
    throw new Error('--tools requires explicit adapters in --config');
  }
  const versions = await doctor(config.adapters, { cwd: resolve(root) });
  if (!versions.passed) {
    throw new Error(
      'Cannot fingerprint adapter tool versions; check doctor output'
    );
  }
  const findings = [...report.findings];
  for (const adapter of config.adapters) {
    findings.push(...(await runAdapter(adapter, { cwd: resolve(root) })));
  }
  const combined = finalizeReport(
    report.files,
    findings,
    validateConfig(config)
  );
  combined.method = hash(
    JSON.stringify({
      native: combined.method,
      adapters: config.adapters,
      versions: versions.tools,
    })
  );
  return combined;
}

async function serveCommand(context) {
  const { root, options, stdout } = context;
  const port = Number(options.port || 3000);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error('port must be in [0, 65535]');
  }
  const server = createQualityServer({
    token: process.env.CODE_QUALITY_TOKEN,
    root: resolve(root),
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, options.host || '127.0.0.1', resolve);
  });
  stdout(
    `Code Quality API listening on ${options.host || '127.0.0.1'}:${server.address().port}\n`
  );
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => server.close());
  }
  return 0;
}

const handlers = {
  check: checkCommand,
  qa: checkCommand,
  lint: checkCommand,
  test: checkCommand,
  coverage: checkCommand,
  mutation: checkCommand,
  'baseline-check': checkCommand,
  'baseline-update': checkCommand,
  serve: serveCommand,
  languages: async (context) => {
    await emitJson(languages, context);
    return 0;
  },
  rules: async (context) => {
    await emitJson(defaultRules, context);
    return 0;
  },
  evolution: async (context) => {
    const options = {
      from: context.options.from,
      to: context.options.to || 'HEAD',
      maxCommits: Number(context.options['max-commits'] || 100),
    };
    await emitJson(await extractEvolution(context.root, options), context);
    return 0;
  },
  doctor: async (context) => {
    const adapters =
      context.config.adapters ||
      Object.entries(toolRecipes).map(([id, [command]]) => ({ id, command }));
    const report = await doctor(adapters, { cwd: resolve(context.root) });
    await emitJson(report, context);
    return report.passed ? 0 : 1;
  },
};

export async function runQualityCli(
  argv,
  {
    stdout = (value) => process.stdout.write(value),
    stderr = (value) => process.stderr.write(value),
  } = {}
) {
  try {
    const parsed = parseArgs(argv);
    const context = { ...parsed, stdout, stderr };
    if (parsed.options.version) {
      const pkg = JSON.parse(
        await readFile(new URL('../../package.json', import.meta.url), 'utf8')
      );
      await emitOutput(`${pkg.version}\n`, context);
      return 0;
    }
    if (!parsed.command || parsed.options.help) {
      await emitOutput(`${help}\n`, context);
      return 0;
    }
    const handler = handlers[parsed.command];
    if (!Object.hasOwn(handlers, parsed.command)) {
      throw new Error(`Unknown command: ${parsed.command}`);
    }
    context.config = await loadConfig(parsed.options.config);
    validateConfig(context.config);
    if (context.options['baseline-path']) {
      if (context.options.baseline) {
        throw new Error('Choose --baseline or --baseline-path');
      }
      context.options.baseline = join(
        context.root,
        safePath(context.options['baseline-path'])
      );
    }
    if (
      context.options.migrate !== undefined &&
      context.command !== 'baseline-update'
    ) {
      throw new Error('--migrate is supported only by baseline-update');
    }
    return await handler(context);
  } catch (error) {
    stderr(`code-quality: ${error.message}\n`);
    return 2;
  }
}
