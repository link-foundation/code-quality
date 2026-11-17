import {
  mkdtemp,
  rm,
  cp,
  readFile,
  readdir,
  lstat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { readProject } from './project.js';
import { analyzeFiles, finalizeReport } from './core.js';
import { validateConfig, positiveInteger } from './config.js';
import { runProcess } from './process.js';
import { doctor, runAdapter, parseLcov } from './adapters.js';
import { withSyntax, walk, hash } from './syntax.js';

export function parseTap(source) {
  const lines = source.split(/\r?\n/);
  const plans = lines.filter((line) => /^1\.\.\d+$/.test(line));
  const tests = lines.filter((line) => /^(?:not )?ok(?:\s|$)/.test(line));
  const count = Number(plans[0]?.slice(3));
  if (
    plans.length !== 1 ||
    !Number.isSafeInteger(count) ||
    count < 1 ||
    count !== tests.length ||
    /Bail out!|#\s*(?:skip|todo)\b/i.test(source)
  ) {
    throw new Error('Incomplete, skipped or malformed TAP test run');
  }
  const numbers = tests.map((line) =>
    Number(line.match(/^(?:not )?ok\s+(\d+)\b/)?.[1])
  );
  if (numbers.some((number, index) => number !== index + 1)) {
    throw new Error('TAP test numbers must be sequential');
  }
  return {
    total: count,
    failed: tests.filter((line) => line.startsWith('not ok')).length,
  };
}

export async function shellMutants(file, max = 100) {
  return await withSyntax('bash', file.content, ({ root }) => {
    const mutants = [];
    for (const node of walk(root)) {
      if (mutants.length >= max) {
        break;
      }
      let replacement;
      if (node.childCount === 0 && ['&&', '||'].includes(node.text)) {
        replacement = node.text === '&&' ? '||' : '&&';
      }
      if (
        node.type === 'test_operator' &&
        ['-eq', '-ne', '-gt', '-ge', '-lt', '-le', '=', '==', '!='].includes(
          node.text
        )
      ) {
        replacement = {
          '-eq': '-ne',
          '-ne': '-eq',
          '-gt': '-le',
          '-ge': '-lt',
          '-lt': '-ge',
          '-le': '-gt',
          '=': '!=',
          '==': '!=',
          '!=': '==',
        }[node.text];
      }
      if (node.type === 'number' && /^[01]$/.test(node.text)) {
        replacement = node.text === '0' ? '1' : '0';
      }
      if (replacement !== undefined) {
        mutants.push({
          path: file.path,
          line: node.startPosition.row + 1,
          start: node.startIndex,
          end: node.endIndex,
          original: node.text,
          replacement,
        });
      }
    }
    return mutants;
  });
}

async function copyWorkspace(source, destination) {
  let bytes = 0;
  let count = 0;
  await cp(source, destination, {
    recursive: true,
    filter: async (path) => {
      const local = relative(source, path);
      if (
        local
          .split(/[\\/]/)
          .some((part) =>
            [
              '.git',
              'node_modules',
              'target',
              'dist',
              'coverage',
              'quality-reports',
            ].includes(part)
          )
      ) {
        return false;
      }
      const stat = await lstat(path);
      if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) {
        throw new Error(`Unsupported workspace entry: ${local}`);
      }
      if (stat.isFile()) {
        count++;
        bytes += stat.size;
        if (count > 2000 || bytes > 33_554_432) {
          throw new Error('Shell workspace copy budget exceeded');
        }
      }
      return true;
    },
  });
}

async function findLcov(root) {
  const matches = [];
  const pending = [root];
  let count = 0;
  while (pending.length) {
    const dir = pending.pop();
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (++count > 2000) {
        throw new Error('Coverage directory budget exceeded');
      }
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        pending.push(path);
      }
      if (entry.isFile() && entry.name === 'coverage.info') {
        matches.push(path);
      }
    }
  }
  const merged = matches.find((path) => path.includes('kcov-merged'));
  if (!merged && matches.length !== 1) {
    throw new Error('Expected one aggregate kcov LCOV report');
  }
  return merged || matches[0];
}

async function controlRun(absolute, sources, tests, timeoutMs, run) {
  for (const file of sources) {
    const syntax = await run('bash', ['-n', '--', file.path], {
      cwd: absolute,
      timeoutMs,
    });
    if (syntax.code) {
      throw new Error(
        `Bash syntax check failed: ${file.path}: ${syntax.stderr}`
      );
    }
  }
  const lint = await runAdapter(
    {
      id: 'shellcheck',
      command: 'shellcheck',
      args: [
        '--format=json',
        '--external-sources',
        '--',
        ...sources.map((file) => file.path),
      ],
      format: 'shellcheck',
      timeoutMs,
    },
    { cwd: absolute, run }
  );
  const control = await run('bats', ['--tap', ...tests], {
    cwd: absolute,
    timeoutMs,
  });
  const controlTests = parseTap(control.stdout);
  if (control.code || controlTests.failed) {
    throw new Error('Bats control run failed');
  }
  return { lint, controlTests };
}

async function measureCoverage(
  absolute,
  sources,
  tests,
  workspace,
  { timeoutMs, totalTests, run }
) {
  const coverageDir = join(workspace, 'coverage');
  const coverageRun = await run(
    'kcov',
    [
      `--include-path=${sources.map((file) => join(absolute, file.path)).join(',')}`,
      coverageDir,
      'bats',
      '--tap',
      ...tests,
    ],
    { cwd: absolute, timeoutMs }
  );
  if (coverageRun.code) {
    throw new Error(`kcov failed: ${coverageRun.stderr}`);
  }
  const tap = parseTap(coverageRun.stdout);
  if (tap.failed || tap.total !== totalTests) {
    throw new Error('Incomplete or failed coverage test run');
  }
  const coverage = parseLcov(
    await readFile(await findLcov(coverageDir), 'utf8')
  );
  const expected = new Set(sources.map((file) => join(absolute, file.path)));
  if (coverage.files.some((path) => !expected.delete(path)) || expected.size) {
    throw new Error(
      'Coverage file inventory differs from the measured source inventory'
    );
  }
  return coverage;
}

async function measureMutants(
  absolute,
  sources,
  tests,
  workspace,
  { timeoutMs, totalTests, maxMutants, run }
) {
  const mutants = [];
  for (const file of sources) {
    mutants.push(...(await shellMutants(file, maxMutants + 1)));
  }
  if (!mutants.length) {
    throw new Error('No eligible shell mutants; mutation score is undefined');
  }
  if (mutants.length > maxMutants) {
    throw new Error(
      `Mutation budget exceeded (${mutants.length} > ${maxMutants}); no partial score is accepted`
    );
  }
  const worktree = join(workspace, 'project');
  let killed = 0;
  const results = [];
  for (const mutant of mutants) {
    await copyWorkspace(absolute, worktree);
    const source = sources.find((file) => file.path === mutant.path).content;
    await writeFile(
      join(worktree, mutant.path),
      source.slice(0, mutant.start) +
        mutant.replacement +
        source.slice(mutant.end)
    );
    const result = await run('bats', ['--tap', ...tests], {
      cwd: worktree,
      timeoutMs,
    });
    const tap = parseTap(result.stdout);
    if (tap.total !== totalTests || (result.code !== 0 && tap.failed === 0)) {
      throw new Error(
        'Mutant test runner failed without a complete assertion result'
      );
    }
    if (tap.failed > 0) {
      killed++;
    }
    results.push({
      ...mutant,
      status: tap.failed > 0 ? 'killed' : 'survived',
    });
    await rm(worktree, { recursive: true, force: true });
  }
  return { results, killed, total: mutants.length };
}

async function assertUnchanged(root, sources) {
  for (const file of sources) {
    if ((await readFile(join(root, file.path), 'utf8')) !== file.content) {
      throw new Error(`Source changed during shell measurement: ${file.path}`);
    }
  }
}

export async function shellQuality(
  root,
  {
    config: inputConfig,
    timeoutMs = 30_000,
    maxMutants = 100,
    run = runProcess,
  } = {}
) {
  const config = validateConfig(inputConfig);
  positiveInteger(maxMutants, 'maxMutants', 1000);
  positiveInteger(timeoutMs, 'timeoutMs', 300_000);
  const absolute = resolve(root);
  const files = (await readProject(absolute, { config: inputConfig })).filter(
    (file) =>
      file.path.endsWith('.sh') ||
      file.path.endsWith('.bash') ||
      file.path.endsWith('.bats')
  );
  const sources = files.filter((file) => !file.path.endsWith('.bats'));
  const tests = files
    .filter((file) => file.path.endsWith('.bats'))
    .map((file) => file.path);
  if (!sources.length || !tests.length) {
    throw new Error('Shell QA requires shell sources and Bats tests');
  }
  if (sources.some((file) => join(absolute, file.path).includes(','))) {
    throw new Error('kcov cannot represent comma-containing source paths');
  }
  const tools = await doctor(
    ['bash', 'shellcheck', 'bats', 'kcov'].map((command) => ({
      id: command,
      command,
    })),
    { cwd: absolute, run }
  );
  if (!tools.passed) {
    throw new Error(
      `Missing shell QA prerequisites: ${JSON.stringify(tools.tools.filter((tool) => !tool.available))}`
    );
  }
  const native = await analyzeFiles(sources, { config: inputConfig });
  if (native.incomplete) {
    throw new Error(
      'Incomplete native syntax analysis prevents shell measurement'
    );
  }
  const { lint, controlTests } = await controlRun(
    absolute,
    sources,
    tests,
    timeoutMs,
    run
  );
  await assertUnchanged(absolute, sources);
  const workspace = await mkdtemp(join(tmpdir(), 'code-quality-shell-'));
  try {
    const coverage = await measureCoverage(
      absolute,
      sources,
      tests,
      workspace,
      { timeoutMs, totalTests: controlTests.total, run }
    );
    await assertUnchanged(absolute, sources);
    const mutants = await measureMutants(absolute, sources, tests, workspace, {
      timeoutMs,
      totalTests: controlTests.total,
      maxMutants,
      run,
    });
    await assertUnchanged(absolute, sources);
    return {
      ...finalizeReport(native.files, [...native.findings, ...lint], config),
      method: hash(
        JSON.stringify({
          native: native.method,
          tools: tools.tools,
          timeoutMs,
          operators: 'bash-boolean-comparison-binary-v1',
          grammar: 'tree-sitter-wasms@0.1.13',
        })
      ),
      metrics: {
        linePercent: coverage.linePercent,
        mutationScore:
          Math.floor((mutants.killed / mutants.total) * 10_000) / 100,
      },
      measurement: {
        tools: tools.tools,
        controlTests: controlTests.total,
        coverage,
        mutants: mutants.results,
      },
      incomplete: false,
    };
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}
