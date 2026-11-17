import type { Server } from 'node:http';

export type Severity = 'note' | 'warning' | 'error';
export type Language =
  | 'javascript'
  | 'typescript'
  | 'tsx'
  | 'rust'
  | 'python'
  | 'go'
  | 'csharp'
  | 'java'
  | 'c'
  | 'cpp'
  | 'php'
  | 'bash'
  | 'cmake';
export interface SourceFile {
  path: string;
  content: string;
  language?: Language;
}
export interface Finding {
  path: string;
  ruleId: string;
  message: string;
  severity: Severity;
  line: number;
  column: number;
  fingerprint: string;
}
export interface Abstraction {
  kind: 'function' | 'class' | 'macro';
  syntaxKind?: string;
  name: string;
  qualifiedName: string;
  start: number;
  end: number;
  startLine: number;
  endLine: number;
  parameters: number;
  complexity: number;
  hash: string;
  shape: string;
  editHash?: string;
}
export interface FileAnalysis {
  path: string;
  language: Language;
  hash: string;
  lineCount: number;
  abstractions: Abstraction[];
}
export interface Report {
  schemaVersion: 1;
  tool: 'code-quality';
  method: string;
  files: FileAnalysis[];
  findings: Finding[];
  summary: { files: number; errors: number; warnings: number };
  passed: boolean;
  metrics?: Record<string, number>;
  incomplete?: boolean;
  baseline?: { passed: boolean; failures: string[] };
}
export interface CustomRule {
  id: string;
  message: string;
  severity?: Severity;
  languages?: Language[];
  pattern: { kind?: string; text?: string };
}
export interface Adapter {
  id: string;
  command: string;
  args: string[];
  format:
    | 'json'
    | 'sarif'
    | 'eslint'
    | 'shellcheck'
    | 'ruff'
    | 'phpstan'
    | 'cargo'
    | 'golangci'
    | 'exit';
  timeoutMs?: number;
  versionArgs?: string[];
}
export interface Config {
  rules?: Record<string, number | boolean>;
  limits?: { maxFiles?: number; maxFileBytes?: number; maxTotalBytes?: number };
  exclude?: string[];
  customRules?: CustomRule[];
  failOn?: Severity;
  adapters?: Adapter[];
}
export interface Plugin {
  version: string;
  id: string;
  analyze(
    context: SourceFile & {
      language: Language;
      abstractions: Abstraction[];
      root: unknown;
    }
  ): Promise<Partial<Finding>[]> | Partial<Finding>[];
}
export interface AnalysisOptions {
  config?: Config;
  plugins?: Plugin[];
}
export interface Baseline {
  schemaVersion: 1;
  method: string;
  files: string[];
  findings: string[];
  metrics: Record<string, number>;
  migrations?: { reason: string; previous: string }[];
}
export interface ToolStatus {
  id: string;
  available: boolean;
  version?: string;
  sha256?: string;
  reason?: string;
}
export interface EvolutionIdentity extends Partial<Omit<Abstraction, 'kind'>> {
  id: string;
  path: string;
  kind: string;
  qualifiedName: string;
  hash: string;
  shape: string;
  editHash?: string;
  language: Language;
  startLine: number;
  complexity: number;
}
export interface EvolutionEvent {
  commit: string;
  id: string;
  kind: string;
  action: 'added' | 'modified' | 'renamed' | 'deleted';
  matchedBy?: string;
  before?: EvolutionIdentity;
  after?: EvolutionIdentity;
}
export interface EvolutionPattern {
  id: string;
  kind: string;
  beforeShape: string;
  afterShape: string;
  count: number;
  complexityDelta: number;
  evidence: { commit: string; path: string; id: string }[];
}
export interface EvolutionReport {
  schemaVersion: 1;
  algorithm: string;
  from: string;
  to: string;
  truncated: boolean;
  commits: { sha: string; date: string; subject: string }[];
  events: EvolutionEvent[];
  current: EvolutionIdentity[];
  hotspots: { path: string; changes: number }[];
  coupling: { files: string[]; commits: number }[];
  repeatedPatterns: EvolutionPattern[];
  suggestions: {
    patternId: string;
    confidence: 'observational';
    message: string;
    evidence: EvolutionPattern['evidence'];
  }[];
  limitations: string[];
}
export const languages: ReadonlyArray<{
  id: Language;
  extensions: readonly string[];
  grammar: string | null;
}>;
export function detectLanguage(path: string, content?: string): Language | null;
export function analyzeSource(
  file: SourceFile,
  options?: AnalysisOptions
): Promise<FileAnalysis & { findings: Omit<Finding, 'fingerprint'>[] }>;
export function analyzeFiles(
  files: SourceFile[],
  options?: AnalysisOptions
): Promise<Report>;
export function readProject(
  root: string,
  options?: AnalysisOptions
): Promise<SourceFile[]>;
export function analyzeProject(
  root: string,
  options?: AnalysisOptions
): Promise<Report>;
export function formatReport(
  report: Report,
  format?: 'json' | 'text' | 'sarif'
): string;
export function createBaseline(report: Report): Baseline;
export function checkBaseline(
  report: Report,
  baseline: Baseline
): { passed: boolean; failures: string[] };
export function updateBaseline(
  report: Report,
  previous: Baseline,
  options?: { migrate?: string; committed?: Baseline }
): Baseline;
export function readGitBaseline(
  root: string,
  options: { ref: string; path?: string }
): Promise<Baseline>;
export interface ReportManifest {
  schemaVersion: 1;
  run: string;
  complete: boolean;
  passed: boolean;
  files: string[];
}
export function saveReport(
  report: Report | null | undefined,
  directory: string,
  options?: { error?: Error; artifacts?: Record<string, string | Uint8Array> }
): Promise<ReportManifest>;
export function measurementFingerprint(
  files: FileAnalysis[],
  methodology: unknown
): string;
export function importFindings(
  data: unknown,
  options?: { id?: string; format?: Adapter['format']; root?: string }
): Omit<Finding, 'fingerprint'>[];
export function runAdapter(
  adapter: Adapter,
  options?: { cwd?: string }
): Promise<Omit<Finding, 'fingerprint'>[]>;
export function doctor(
  adapters: Pick<Adapter, 'id' | 'command' | 'versionArgs'>[],
  options?: { cwd?: string }
): Promise<{ passed: boolean; tools: ToolStatus[] }>;
export const toolRecipes: Readonly<
  Record<string, readonly [string, string[], string]>
>;
export function parseLcov(source: string): {
  total: number;
  covered: number;
  linePercent: number;
  files: string[];
};
export function parseTap(
  source: string,
  options?: { allowAbort?: boolean; expectedTotal?: number }
): { total: number; failed: number; aborted?: true; executed?: number };
export function parseKcov(source: unknown): {
  total: number;
  covered: number;
  linePercent: number;
  files: string[];
};
export interface ShellMutant {
  path: string;
  line: number;
  start: number;
  end: number;
  original: string;
  replacement: string;
}
export function shellMutants(
  file: SourceFile,
  max?: number
): Promise<ShellMutant[]>;
export function shellQuality(
  root: string,
  options?: {
    config?: Config;
    timeoutMs?: number;
    maxMutants?: number;
    stage?: 'qa' | 'lint' | 'test' | 'coverage' | 'mutation';
    scripts?: string[];
    tests?: string[];
    jobs?: 'auto' | number;
    onCoverage?: (directory: string) => Promise<void> | void;
  }
): Promise<Report & { measurement: unknown; metrics: Record<string, number> }>;
export function extractEvolution(
  root: string,
  options?: {
    from?: string;
    to?: string;
    maxCommits?: number;
    maxFiles?: number;
    maxFileBytes?: number;
    maxTotalBytes?: number;
  }
): Promise<EvolutionReport>;
export function createQualityServer(options?: {
  token?: string;
  root?: string;
  maxBodyBytes?: number;
  maxConcurrent?: number;
}): Server;
export const apiDescription: Record<string, unknown>;
export interface ShellToolPin {
  version: string;
  url: string;
  sha256: string;
  executable: string;
}
export type ShellToolManifest = Record<
  'bats' | 'shellcheck' | 'kcov',
  ShellToolPin
>;
export function shellToolManifest(
  platform?: string,
  arch?: string
): ShellToolManifest;
export function installShellTools(
  directory: string,
  options?: { platform?: string; arch?: string }
): Promise<{
  schemaVersion: 1;
  directory: string;
  platform: string;
  arch: string;
  manifest: ShellToolManifest;
  files: { path: string; sha256: string }[];
  executables: Record<'bats' | 'shellcheck' | 'kcov', string>;
  fingerprint: string;
}>;
