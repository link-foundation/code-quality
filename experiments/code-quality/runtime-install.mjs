import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { installShellTools, doctor } from '../../src/quality/index.js';

assert.ok(process.argv[2], 'Supply a new installation directory');
const installation = await installShellTools(resolve(process.argv[2]));
const status = await doctor(
  Object.entries(installation.executables).map(([id, command]) => ({
    id,
    command,
  }))
);
assert.equal(status.passed, true, JSON.stringify(status));
assert.ok(
  status.tools.every((tool) => tool.installation === installation.fingerprint)
);
console.log(JSON.stringify({ installation, status }, null, 2));
