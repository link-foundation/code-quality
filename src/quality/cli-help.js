const options = {
  config:
    '--config <file>         JSON rules, exclusions, limits and trusted adapter argv',
  output: '--output <file>         Save output here; the default is stdout',
  format: '--format <text|json|sarif>  Report format; default text',
  tools:
    '--tools                 Execute explicitly configured trusted adapters',
  baseline:
    '--baseline <file>       Baseline file; shell QA defaults to <root>/quality-baseline.json',
  'baseline-path':
    '--baseline-path <file>  Root-relative alternative to --baseline',
  'baseline-ref':
    '--baseline-ref <ref>    Additionally enforce this committed Git baseline',
  reports:
    '--reports <directory>   Save fresh evidence; default <root>/quality-reports',
  script:
    '--script <path>         Select a root-relative shell source; repeatable',
  test: '--test <path>           Select a root-relative Bats test; repeatable',
  jobs: '--jobs <auto|1..4>      Mutation workers; default 1, auto uses at most 2',
  'max-mutants':
    '--max-mutants <N>       Maximum eligible mutants, 1..1000; default 100',
  'timeout-ms':
    '--timeout-ms <N>        Per-process budget in milliseconds, 1..300000; default 30000',
  rounding:
    '--rounding <floor|half-up>  Percentage rounding; default floor, fingerprinted',
  create:
    '--create                Explicitly create a missing baseline after fresh QA',
  migrate:
    '--migrate <reason>      Explain an incompatible method migration; compatible floors never decrease',
  'import-quality-bash':
    '--import-quality-bash <file>  Import foreign floors with --create and --migrate',
  from: '--from <ref>            Earliest included first-parent Git revision',
  to: '--to <ref>              Final Git revision; default HEAD',
  'max-commits':
    '--max-commits <N>       Maximum history commits, 1..1000; default 100',
  host: '--host <address>        Bind address; default 127.0.0.1',
  port: '--port <N>              TCP port, 0..65535; default 3000',
};

const shell = [
  'config',
  'format',
  'output',
  'script',
  'test',
  'timeout-ms',
  'reports',
];
const measurement = [...shell, 'jobs', 'max-mutants', 'rounding'];
const baseline = ['baseline', 'baseline-path', 'baseline-ref'];
const definitions = {
  check: [
    'Analyze source without executing project code. Adapters require explicit --tools.',
    ['config', 'format', 'output', 'tools', ...baseline],
  ],
  qa: [
    'Run trusted Bash syntax, ShellCheck, Bats, coverage and mutation; enforce a baseline.',
    [...measurement, ...baseline],
  ],
  lint: [
    'Check trusted Bash syntax and ShellCheck diagnostics.',
    shell.filter((key) => key !== 'test'),
  ],
  test: ['Execute trusted Bats controls after Bash syntax validation.', shell],
  coverage: [
    'Measure trusted Bats controls with kcov; count Bash executable lines.',
    [...shell, 'rounding'],
  ],
  mutation: [
    'Run trusted Bats controls and bounded, isolated shell mutants.',
    measurement,
  ],
  'baseline-check': [
    'Measure fresh trusted shell QA and require both local and selected committed floors.',
    [...measurement, ...baseline],
  ],
  'baseline-update': [
    'Measure fresh trusted shell QA before creating or raising baseline floors.',
    [...measurement, ...baseline, 'create', 'migrate', 'import-quality-bash'],
  ],
  evolution: [
    'Read bounded first-parent Git history and report structural evolution as JSON.',
    ['config', 'output', 'from', 'to', 'max-commits'],
  ],
  serve: [
    'Start the bounded JSON HTTP API. Authentication uses CODE_QUALITY_TOKEN.',
    ['config', 'host', 'port'],
  ],
  languages: ['List the native language parser inventory as JSON.', ['output']],
  rules: ['List default native quality rules as JSON.', ['output']],
  doctor: [
    'Inspect versions and fingerprints of installed tools or configured adapters.',
    ['config', 'output'],
  ],
  'tools-install': [
    'Download checksum-pinned Linux amd64/arm64 shell tools into a new directory. Host Bash >=5.2, glibc >=2.36 and Python 3 are required.',
    ['output'],
  ],
};

export function commandHelp(command) {
  const [description, keys] = definitions[command];
  const name =
    { 'baseline-check': 'baseline check', 'tools-install': 'tools install' }[
      command
    ] || command;
  const argument = command === 'tools-install' ? '<new-directory>' : '[root]';
  return `Usage: code-quality ${name} ${argument} [options]\n${description}\n\nOptions:\n${keys.map((key) => `  ${options[key]}`).join('\n')}\n  --help | --version\n\nExit status: 0 passed, 1 findings/gate failed, 2 invalid input or incomplete check.\nShell commands and adapters execute trusted code as your user.`;
}
