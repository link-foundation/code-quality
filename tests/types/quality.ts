import { add } from '@link-foundation/code-quality';
import {
  analyzeFiles,
  createBaseline,
  createQualityServer,
  readGitBaseline,
  saveReport,
  extractEvolution,
  shellToolManifest,
  installShellTools,
  type Config,
  type Plugin,
} from '@link-foundation/code-quality/quality';
import {
  checkBaseline,
  formatReport,
  type EvolutionIdentity,
  type Language,
} from '@link-foundation/code-quality/quality';

const config: Config = { rules: { complexity: 5 }, failOn: 'error' };
const plugin: Plugin = {
  id: 'example',
  version: '1',
  analyze: ({ language }) => [{ message: language, severity: 'note' }],
};
const report = await analyzeFiles(
  [{ path: 'a.js', content: 'export const answer = 42;\n' }],
  { config, plugins: [plugin] }
);
const baseline = createBaseline(report);
const committed = await readGitBaseline('.', { ref: 'HEAD' });
const manifest = await saveReport(report, '/tmp/quality-reports');
const complete: boolean = manifest.complete;
const passed: boolean = checkBaseline(report, baseline).passed;
const text: string = formatReport(report, 'sarif');
const total: number = add(1, 2);
const server = createQualityServer({ maxConcurrent: 2 });
server.close();
const history = await extractEvolution('.');
const current: EvolutionIdentity | undefined = history.current[0];
const language: Language | undefined = current?.language;
void [passed, text, total, language, committed, complete];
const toolVersion: string = shellToolManifest('linux', 'arm64').kcov.version;
const install: typeof installShellTools = installShellTools;
void [toolVersion, install];

// @ts-expect-error Unsupported languages must be rejected by consumers' compiler.
const unsupported: Language = 'brainfuck';
// @ts-expect-error Report formats are a finite public contract.
formatReport(report, 'yaml');
// @ts-expect-error The existing arithmetic API retains numeric parameters.
add('1', 2);
void unsupported;
