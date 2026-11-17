import { appendFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { installShellTools } from '../../src/quality/index.js';

if (!process.env.RUNNER_TEMP || !process.env.GITHUB_PATH) {
  throw new Error('This CI example requires RUNNER_TEMP and GITHUB_PATH');
}
const tools = await installShellTools(
  join(process.env.RUNNER_TEMP, 'quality-tools')
);
await appendFile(
  process.env.GITHUB_PATH,
  `${Object.values(tools.executables).map(dirname).join('\n')}\n`
);
console.log(JSON.stringify(tools, null, 2));
