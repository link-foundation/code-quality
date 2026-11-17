import { mkdtemp, rm, cp, readFile, lstat, writeFile } from 'node:fs/promises';
import { tmpdir, availableParallelism } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { readProject } from './project.js';
import { analyzeFiles, finalizeReport } from './core.js';
import { validateConfig, positiveInteger, safePath } from './config.js';
import { runProcess } from './process.js';
import { doctor, runAdapter } from './adapters.js';
import { requireBash } from './shell-version.js';
import { parseKcov } from './coverage.js';
import { withSyntax, walk, hash } from './syntax.js';
import { percentage, validateRounding } from './percentage.js';
import {
  captureWorkspace,
  assertWorkspaceUnchanged,
  workspaceExcluded,
} from './shell-workspace.js';

const arithmeticOperators = new Map([
  ['+', '-'],
  ['-', '+'],
  ['*', '/'],
  ['/', '*'],
]);

function tapLines(source) {
  if (Buffer.byteLength(source) > 16_777_216) {
    throw new Error('TAP report exceeds byte budget');
  }
  const lines = source.split(/\r?\n/);
  let content = false;
  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }
    if (line === 'TAP version 13') {
      if (content) {
        throw new Error('TAP version must be the first record');
      }
    } else if (!/^(?:1\.\.\d+$|(?:not )?ok\s+\d+(?:\s|$)|\s*#)/.test(line)) {
      throw new Error('Unknown or malformed Bats TAP record');
    }
    content = true;
  }
  return lines;
}

function tapPlan(source, expectedTotal) {
  const lines = tapLines(source);
  const plans = lines.filter((line) => /^1\.\.\d+$/.test(line));
  const tests = lines.filter((line) => /^(?:not )?ok(?:\s|$)/.test(line));
  const count = Number(plans[0]?.slice(3));
  if (
    plans.length !== 1 ||
    !Number.isSafeInteger(count) ||
    count < 1 ||
    tests.length < 1 ||
    tests.length > count ||
    (expectedTotal !== undefined && count !== expectedTotal) ||
    /Bail out!|#\s*(?:skip|todo)\b/i.test(source)
  ) {
    throw new Error('Incomplete, skipped or malformed TAP test run');
  }
  return { tests, count };
}

export function parseTap(source, { allowAbort = false, expectedTotal } = {}) {
  const { tests, count } = tapPlan(source, expectedTotal);
  const numbers = tests.map((line) =>
    Number(line.match(/^(?:not )?ok\s+(\d+)(?:\s|$)/)?.[1])
  );
  if (numbers.some((number, index) => number !== index + 1)) {
    throw new Error('TAP test numbers must be sequential');
  }
  const aborted = tests.length !== count;
  if (
    aborted &&
    (!allowAbort ||
      !tests.at(-1).startsWith('not ok') ||
      tests.slice(0, -1).some((line) => line.startsWith('not ok')))
  ) {
    throw new Error('Incomplete or malformed TAP assertion prefix');
  }
  return {
    total: count,
    failed: tests.filter((line) => line.startsWith('not ok')).length,
    ...(aborted ? { aborted: true, executed: tests.length } : {}),
  };
}

export async function shellMutants(file, max = 100) {
  positiveInteger(max, 'max', 1001);
  return await withSyntax('bash', file.content, ({ root }) => {
    const mutants = [];
    for (const node of walk(root)) {
      if (mutants.length >= max) {
        break;
      }
      let replacement;
      if (node.childCount === 0 && node.parent?.type === 'binary_expression') {
        replacement = arithmeticOperators.get(node.text);
      }
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

async function copyWorkspace(source, destination, excludedPaths = []) {
  let bytes = 0;
  let count = 0;
  let visited = 0;
  await cp(source, destination, {
    recursive: true,
    filter: async (path) => {
      const local = relative(source, path).split(sep).join('/');
      if (++visited > 100_000) {
        throw new Error('Shell workspace entry budget exceeded');
      }
      if (workspaceExcluded(local, excludedPaths)) {
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

async function controlRun(absolute, sources, tests, timeoutMs, run, stage) {
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
  const lint = ['qa', 'lint'].includes(stage)
    ? await runAdapter(
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
      )
    : [];
  if (stage === 'lint') {
    return { lint };
  }
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
  { timeoutMs, totalTests, run, onCoverage, rounding }
) {
  const coverageDir = join(workspace, 'coverage');
  const coverageRun = await run(
    'kcov',
    [
      `--include-path=${sources.map((file) => join(absolute, file.path)).join(',')}`,
      // kcov otherwise scans the directory containing Bats (often /usr/bin),
      // irrespective of --include-path. Only project source belongs here.
      '--bash-dont-parse-binary-dir',
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
  await onCoverage?.(coverageDir);
  const tap = parseTap(coverageRun.stdout);
  if (tap.failed || tap.total !== totalTests) {
    throw new Error('Incomplete or failed coverage test run');
  }
  const coveragePath = join(coverageDir, 'bats', 'codecov.json');
  if ((await lstat(coveragePath)).size > 16_777_216) {
    throw new Error('kcov coverage report exceeds byte budget');
  }
  const coverage = parseKcov(await readFile(coveragePath, 'utf8'), {
    rounding,
  });
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
  { timeoutMs, totalTests, maxMutants, run, jobs, abort, excludedPaths }
) {
  const mutants = [];
  for (const file of sources) {
    mutants.push(...(await shellMutants(file, maxMutants + 1)));
    if (mutants.length > maxMutants) {
      throw new Error(
        `Mutation budget exceeded (${mutants.length} > ${maxMutants}); no partial score is accepted`
      );
    }
  }
  if (!mutants.length) {
    throw new Error('No eligible shell mutants; mutation score is undefined');
  }
  let killed = 0;
  const results = new Array(mutants.length);
  let next = 0;
  let failure;
  await Promise.all(
    Array.from(
      { length: Math.min(jobs, mutants.length) },
      async (_, worker) => {
        const worktree = join(workspace, `project-${worker}`);
        while (!failure && next < mutants.length) {
          const index = next++;
          const mutant = mutants[index];
          try {
            await copyWorkspace(absolute, worktree, excludedPaths);
            const source = sources.find(
              (file) => file.path === mutant.path
            ).content;
            await writeFile(
              join(worktree, mutant.path),
              source.slice(0, mutant.start) +
                mutant.replacement +
                source.slice(mutant.end)
            );
            const result = await run(
              'bats',
              ['--tap', ...(abort ? ['--abort'] : []), ...tests],
              {
                cwd: worktree,
                timeoutMs,
              }
            );
            const tap = parseTap(result.stdout, {
              allowAbort: abort,
              expectedTotal: totalTests,
            });
            if (result.code !== (tap.failed ? 1 : 0)) {
              throw new Error(
                'Mutant test runner failed without a complete assertion result'
              );
            }
            if (tap.failed > 0) {
              killed++;
            }
            results[index] = {
              ...mutant,
              status: tap.failed > 0 ? 'killed' : 'survived',
            };
          } catch (error) {
            failure ||= error;
          } finally {
            try {
              await rm(worktree, { recursive: true, force: true });
            } catch (error) {
              failure ||= error;
            }
          }
        }
      }
    )
  );
  if (failure) {
    throw failure;
  }
  return { results, killed, total: mutants.length };
}

function selectedFiles(files, selection, label) {
  if (selection === undefined) {
    return files;
  }
  if (
    !Array.isArray(selection) ||
    !selection.length ||
    selection.length > 1000 ||
    new Set(selection).size !== selection.length
  ) {
    throw new Error(`${label} must contain bounded unique project paths`);
  }
  const known = new Map(files.map((file) => [file.path, file]));
  return selection
    .map((path) => {
      safePath(path);
      if (!known.has(path)) {
        throw new Error(`Unknown selected ${label}: ${path}`);
      }
      return known.get(path);
    })
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

function workerCount(jobs) {
  if (jobs === 'auto') {
    return Math.min(2, availableParallelism());
  }
  return positiveInteger(jobs, 'jobs', 4);
}

function supportsAbort(tools) {
  const version = tools.find((tool) => tool.id === 'bats')?.version;
  const match = version?.match(/\bBats (\d+)\.(\d+)\./i);
  return Boolean(
    match &&
    (Number(match[1]) > 1 || (Number(match[1]) === 1 && Number(match[2]) >= 14))
  );
}

async function assertUnchanged(root, sources) {
  for (const file of sources) {
    if ((await readFile(join(root, file.path), 'utf8')) !== file.content) {
      throw new Error(`Source changed during shell measurement: ${file.path}`);
    }
  }
}

async function shellPrerequisites(absolute, sources, stage, run) {
  if (
    ['qa', 'coverage'].includes(stage) &&
    sources.some((file) => join(absolute, file.path).includes(','))
  ) {
    throw new Error('kcov cannot represent comma-containing source paths');
  }
  const tools = await doctor(
    [
      'bash',
      ...(['qa', 'lint'].includes(stage) ? ['shellcheck'] : []),
      ...(stage !== 'lint' ? ['bats'] : []),
      ...(['qa', 'coverage'].includes(stage) ? ['kcov'] : []),
    ].map((command) => ({
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
  requireBash(tools.tools.find((tool) => tool.id === 'bash').version);
  return tools;
}

async function assertToolsUnchanged(absolute, sources, stage, run, tools) {
  const currentTools = await shellPrerequisites(absolute, sources, stage, run);
  if (JSON.stringify(currentTools) !== JSON.stringify(tools)) {
    throw new Error('Shell toolchain changed during measurement');
  }
}

function shellReport(
  native,
  config,
  {
    tools,
    timeoutMs,
    stage,
    tests,
    abort,
    coverage,
    mutants,
    controlTests,
    lint,
    rounding,
    workspace,
  }
) {
  return {
    ...finalizeReport(native.files, [...native.findings, ...lint], config),
    method: hash(
      JSON.stringify({
        native: native.method,
        tools,
        timeoutMs,
        stage,
        tests,
        mutantRunner: abort ? 'bats-abort-prefix-v1' : 'bats-full-tap-v1',
        coverage: 'kcov-codecov-json-no-binary-dir-v2',
        operators: 'bash-boolean-comparison-binary-arithmetic-v2',
        rounding,
        workspace: 'bounded-input-tree-sha256-v1',
        grammar: 'tree-sitter-wasms@0.1.13',
      })
    ),
    metrics: {
      ...(coverage ? { linePercent: coverage.linePercent } : {}),
      ...(mutants
        ? {
            mutationScore: percentage(mutants.killed, mutants.total, rounding),
          }
        : {}),
    },
    measurement: {
      tools,
      stage,
      controlTests: controlTests?.total,
      coverage,
      mutants: mutants?.results,
      rounding,
      workspace,
    },
    incomplete: false,
  };
}

export async function shellQuality(
  root,
  {
    config: inputConfig,
    timeoutMs = 30_000,
    maxMutants = 100,
    stage = 'qa',
    scripts,
    tests: testSelection,
    jobs = 1,
    excludedPaths = [],
    onCoverage,
    rounding,
    run = runProcess,
  } = {}
) {
  const config = validateConfig(inputConfig);
  rounding = validateRounding(rounding);
  positiveInteger(maxMutants, 'maxMutants', 1000);
  positiveInteger(timeoutMs, 'timeoutMs', 300_000);
  const workers = workerCount(jobs);
  if (!['qa', 'lint', 'test', 'coverage', 'mutation'].includes(stage)) {
    throw new Error(`Unknown shell measurement stage: ${stage}`);
  }
  const absolute = resolve(root);
  const files = (await readProject(absolute, { config: inputConfig })).filter(
    (file) =>
      file.path.endsWith('.sh') ||
      file.path.endsWith('.bash') ||
      file.path.endsWith('.bats')
  );
  const sources = selectedFiles(
    files.filter((file) => !file.path.endsWith('.bats')),
    scripts,
    'script'
  );
  const testFiles = selectedFiles(
    files.filter((file) => file.path.endsWith('.bats')),
    testSelection,
    'test'
  );
  const tests = testFiles.map((file) => file.path);
  if (!sources.length || (stage !== 'lint' && !tests.length)) {
    throw new Error('Shell QA requires shell sources and Bats tests');
  }
  const snapshot = await captureWorkspace(
    absolute,
    excludedPaths,
    [...sources, ...testFiles].map((file) => file.path)
  );
  const tools = await shellPrerequisites(absolute, sources, stage, run);
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
    run,
    stage
  );
  const measuredFiles = [...sources, ...testFiles];
  await assertUnchanged(absolute, measuredFiles);
  await assertWorkspaceUnchanged(absolute, snapshot, excludedPaths);
  const abort = supportsAbort(tools.tools);
  const workspace = await mkdtemp(join(tmpdir(), 'code-quality-shell-'));
  try {
    const coverage = ['qa', 'coverage'].includes(stage)
      ? await measureCoverage(absolute, sources, tests, workspace, {
          timeoutMs,
          totalTests: controlTests.total,
          run,
          onCoverage,
          rounding,
        })
      : undefined;
    await assertUnchanged(absolute, measuredFiles);
    await assertWorkspaceUnchanged(absolute, snapshot, excludedPaths);
    const mutants = ['qa', 'mutation'].includes(stage)
      ? await measureMutants(absolute, sources, tests, workspace, {
          timeoutMs,
          totalTests: controlTests.total,
          maxMutants,
          run,
          jobs: workers,
          abort,
          excludedPaths,
        })
      : undefined;
    await assertUnchanged(absolute, measuredFiles);
    await assertWorkspaceUnchanged(absolute, snapshot, excludedPaths);
    await assertToolsUnchanged(absolute, sources, stage, run, tools);
    await assertUnchanged(absolute, measuredFiles);
    await assertWorkspaceUnchanged(absolute, snapshot, excludedPaths);
    return shellReport(native, config, {
      tools: tools.tools,
      timeoutMs,
      stage,
      tests,
      abort,
      coverage,
      mutants,
      controlTests,
      lint,
      rounding,
      workspace: {
        sha256: snapshot.sha256,
        files: snapshot.files,
        bytes: snapshot.bytes,
      },
    });
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}
