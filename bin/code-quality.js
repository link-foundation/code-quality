#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runQualityCli } from '../src/quality/cli.js';
export { runQualityCli } from '../src/quality/cli.js';

try {
  if (
    process.argv[1] &&
    realpathSync(process.argv[1]) ===
      realpathSync(fileURLToPath(import.meta.url))
  ) {
    process.exitCode = await runQualityCli(process.argv.slice(2));
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 2;
}
