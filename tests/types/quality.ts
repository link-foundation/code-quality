import {
  add,
  analyzeFiles,
  createBaseline,
  createQualityServer,
  extractEvolution,
  type Config,
  type Plugin,
} from '@link-foundation/code-quality';
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
const passed: boolean = checkBaseline(report, baseline).passed;
const text: string = formatReport(report, 'sarif');
const total: number = add(1, 2);
const server = createQualityServer({ maxConcurrent: 2 });
server.close();
const history = await extractEvolution('.');
const current: EvolutionIdentity | undefined = history.current[0];
const language: Language | undefined = current?.language;
void [passed, text, total, language];

// @ts-expect-error Unsupported languages must be rejected by consumers' compiler.
const unsupported: Language = 'brainfuck';
// @ts-expect-error Report formats are a finite public contract.
formatReport(report, 'yaml');
// @ts-expect-error The existing arithmetic API retains numeric parameters.
add('1', 2);
void unsupported;
