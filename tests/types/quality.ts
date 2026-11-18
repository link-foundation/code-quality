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
  validateQualityBashBaseline,
  importQualityBashBaseline,
  parseKcov,
  shellQuality,
  shellMutants,
  type Config,
  type Plugin,
} from '@link-foundation/code-quality/quality';
import {
  checkBaseline,
  formatReport,
  type EvolutionIdentity,
  type Language,
} from '@link-foundation/code-quality/quality';

const config: Config = {
  rules: { complexity: 5 },
  failOn: 'error',
  customRules: [
    {
      id: 'local/tree',
      message: 'Review call',
      pattern: {
        tree: {
          kind: 'call_expression',
          children: [
            { capture: 'CALLEE' },
            { kind: 'arguments', children: [{ rest: true }] },
          ],
        },
      },
    },
    {
      id: 'local/operator',
      message: 'Review same operand addition',
      pattern: {
        tree: {
          kind: 'binary_expression',
          fields: {
            operator: { text: '+' },
            left: { capture: 'VALUE' },
            right: { capture: 'VALUE' },
          },
          all: [{ not: { text: '0 + 0' } }],
          any: [{ capture: 'EXPRESSION' }, { text: '1 + 1' }],
          not: { text: '2 + 2' },
        },
      },
    },
  ],
  clones: {
    minTokens: 30,
    suppressionComments: true,
    ignoreAnnotations: true,
    ignoreUsings: true,
  },
};
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
const cloneEnd: number | undefined = report.clones?.[0].second.end;
void cloneEnd;
const groupEnd: number | undefined = report.cloneGroups?.[0].occurrences[0].end;
void groupEnd;
const omittedEnd: number | undefined = report.cloneSuppressions?.[0].end;
void omittedEnd;
const arity: number | null = report.files[0].abstractions[0].parameters;
// @ts-expect-error Unevaluated CMake arity must be checked before numeric use.
const assumedArity: number = report.files[0].abstractions[0].parameters;
void [arity, assumedArity];
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
const libraryVersion: string | undefined = shellToolManifest('linux', 'arm64')
  .kcov.dependencies?.[0]?.version;
type Runtime = Awaited<ReturnType<typeof installShellTools>>['runtime'];
const privateLoader = (runtime: Runtime): string => runtime.loader;
void [toolVersion, install, libraryVersion, privateLoader];
const foreign = validateQualityBashBaseline({});
const imported = importQualityBashBaseline(report, foreign, {
  reason: 'Reviewed independent methodology',
});
const importAudit: string | undefined = imported.migrations?.[0].previous;
void importAudit;
const rounding: NonNullable<Parameters<typeof shellQuality>[1]> = {
  rounding: 'half-up',
  mutationPolicy: 'expanded',
  excludedPaths: ['generated-evidence'],
};
const roundedCoverage = parseKcov({}, { rounding: 'half-up' });
// @ts-expect-error Rounding policies are explicit finite choices.
parseKcov({}, { rounding: 'nearest' });
void [rounding, roundedCoverage];
void shellMutants({ path: 'typed.sh', content: '((7 < 3))\n' }, 10, {
  policy: 'expanded',
});
// @ts-expect-error unsupported mutation policy
void shellMutants({ path: 'typed.sh', content: '' }, 10, { policy: 'unknown' });

// @ts-expect-error Unsupported languages must be rejected by consumers' compiler.
const unsupported: Language = 'brainfuck';
// @ts-expect-error Report formats are a finite public contract.
formatReport(report, 'yaml');
// @ts-expect-error The existing arithmetic API retains numeric parameters.
add('1', 2);
void unsupported;

const ambiguous: Config = {
  customRules: [
    {
      id: 'bad',
      message: 'bad',
      // @ts-expect-error Tree rules cannot silently combine with legacy text matching.
      pattern: { tree: { kind: 'identifier' }, text: 'x' },
    },
  ],
};
void ambiguous;
