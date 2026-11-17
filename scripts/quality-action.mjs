import { appendFile, mkdtemp, realpath, rm } from 'node:fs/promises';
import {
  dirname,
  delimiter,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import { fileURLToPath } from 'node:url';
import { runQualityCli } from '../src/quality/cli.js';
import { installShellTools } from '../src/quality/toolchain.js';
import { safePath } from '../src/quality/config.js';
import { readJsonFile } from '../src/quality/persistence.js';
import { saveReport } from '../src/quality/report.js';

function boolean(value, name) {
  if (!['true', 'false'].includes(value)) {
    throw new Error(`${name} must be true or false`);
  }
  return value === 'true';
}

function settings(env) {
  const command = env.QUALITY_COMMAND || 'check';
  if (!['check', 'qa'].includes(command)) {
    throw new Error('Action command must be check or qa');
  }
  if (command === 'qa' && env.GITHUB_EVENT_NAME === 'pull_request_target') {
    throw new Error(
      'Trusted shell QA must use pull_request, not pull_request_target'
    );
  }
  const enforceBase = boolean(
    env.QUALITY_ENFORCE_BASE || 'true',
    'enforce-base'
  );
  const installTools = boolean(
    env.QUALITY_INSTALL_TOOLS || 'true',
    'install-tools'
  );
  return { command, enforceBase, installTools };
}

async function projectRoot(env) {
  const workspace = await realpath(env.GITHUB_WORKSPACE || '.');
  const root = await realpath(resolve(workspace, env.QUALITY_ROOT || '.'));
  const local = relative(workspace, root);
  if (local === '..' || local.startsWith(`..${sep}`) || isAbsolute(local)) {
    throw new Error('Action root must be inside the checked out workspace');
  }
  if (
    [...root].some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
    )
  ) {
    throw new Error('Action root contains a control character');
  }
  return root;
}

async function commandArguments(env, root, { command, enforceBase }) {
  const reports = safePath(env.QUALITY_REPORTS || 'quality-reports');
  const args = [command, root, '--reports', reports];
  if (command === 'qa') {
    args.push(
      '--baseline-path',
      safePath(env.QUALITY_BASELINE || 'quality-baseline.json')
    );
    args.push('--jobs', env.QUALITY_JOBS || '1');
    args.push('--timeout-ms', env.QUALITY_TIMEOUT_MS || '30000');
    if (enforceBase && env.GITHUB_EVENT_NAME === 'pull_request') {
      args.push('--baseline-ref', await baseCommit(env));
    }
  }
  return args;
}

async function baseCommit(env) {
  const event = await readJsonFile(env.GITHUB_EVENT_PATH);
  const sha = event.pull_request?.base?.sha;
  if (typeof sha !== 'string' || !/^[a-f0-9]{40}$/.test(sha)) {
    throw new Error(
      'Cannot establish the PR base commit for baseline enforcement'
    );
  }
  return sha;
}

export async function qualityAction(
  env = process.env,
  { cli = runQualityCli, install = installShellTools } = {}
) {
  const config = settings(env);
  const root = await projectRoot(env);
  const reportDirectory = join(
    root,
    safePath(env.QUALITY_REPORTS || 'quality-reports')
  );
  if (env.GITHUB_OUTPUT) {
    await appendFile(
      env.GITHUB_OUTPUT,
      `reports=${reportDirectory}\nmanifest=${join(reportDirectory, 'latest.json')}\n`
    );
  }
  const previousPath = process.env.PATH;
  let owned;
  try {
    const args = await commandArguments(env, root, config);
    if (config.command === 'qa' && config.installTools) {
      if (!env.RUNNER_TEMP) {
        throw new Error('RUNNER_TEMP is required for shell tool installation');
      }
      owned = await mkdtemp(join(env.RUNNER_TEMP, 'code-quality-action-'));
      const tools = await install(join(owned, 'tools'));
      process.env.PATH = [
        ...Object.values(tools.executables).map(dirname),
        previousPath,
      ].join(delimiter);
    }
    return await cli(args);
  } catch (error) {
    await saveReport(undefined, reportDirectory, { error });
    throw error;
  } finally {
    if (previousPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = previousPath;
    }
    if (owned) {
      await rm(owned, { recursive: true, force: true });
    }
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    process.exitCode = await qualityAction();
  } catch (error) {
    console.error(`Code quality action: ${error.message}`);
    process.exitCode = 2;
  }
}
