import { StringDecoder } from 'node:string_decoder';
import { spawn } from 'node:child_process';
import { positiveInteger } from './config.js';

// No shell interpolation. Callers explicitly choose trusted executables.
export function runProcess(
  command,
  args = [],
  {
    cwd,
    timeoutMs = 30_000,
    maxOutputBytes = 4_194_304,
    env = process.env,
  } = {}
) {
  positiveInteger(timeoutMs, 'timeoutMs', 300_000);
  positiveInteger(maxOutputBytes, 'maxOutputBytes', 16_777_216);
  const debug = env.CODE_QUALITY_DEBUG === '1';
  const started = Date.now();
  if (debug) {
    console.error(
      JSON.stringify({ event: 'quality-process-start', command, args, cwd })
    );
  }
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      shell: false,
      windowsHide: true,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const decoders = {
      stdout: new StringDecoder('utf8'),
      stderr: new StringDecoder('utf8'),
    };
    let stdout = '';
    let stderr = '';
    let bytes = 0;
    let failure;
    const stop = (message) => {
      failure ||= new Error(message);
      if (process.platform !== 'win32' && child.pid) {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          child.kill('SIGKILL');
        }
      } else {
        child.kill('SIGKILL');
      }
    };
    const timer = setTimeout(
      () => stop(`${command}: execution timeout`),
      timeoutMs
    );
    const collect = (stream) => (chunk) => {
      bytes += chunk.length;
      if (bytes > maxOutputBytes) {
        stop(`${command}: output budget exceeded`);
        return;
      }
      if (stream === 'stdout') {
        stdout += decoders.stdout.write(chunk);
      } else {
        stderr += decoders.stderr.write(chunk);
      }
    };
    child.stdout.on('data', collect('stdout'));
    child.stderr.on('data', collect('stderr'));
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      stdout += decoders.stdout.end();
      stderr += decoders.stderr.end();
      if (debug) {
        console.error(
          JSON.stringify({
            event: 'quality-process-close',
            command,
            code,
            signal,
            elapsedMs: Date.now() - started,
            stdout,
            stderr,
          })
        );
      }
      if (failure) {
        reject(
          Object.assign(failure, { command, code, signal, stdout, stderr })
        );
      } else if (signal) {
        reject(
          Object.assign(new Error(`${command}: terminated by ${signal}`), {
            command,
            code,
            signal,
            stdout,
            stderr,
          })
        );
      } else {
        resolve({ code, stdout, stderr });
      }
    });
  });
}
