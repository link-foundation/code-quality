// Pure report formatters (no filesystem), shared by Node, Deno, Bun and browsers.
import { formatLino } from './lino.js';

function sarifLocation(entry) {
  return {
    physicalLocation: {
      artifactLocation: {
        uri: entry.path.split('/').map(encodeURIComponent).join('/'),
        uriBaseId: '%SRCROOT%',
      },
      region: {
        startLine: entry.line,
        startColumn: entry.column,
        ...(entry.endLine && {
          endLine: entry.endLine,
          endColumn: entry.endColumn,
        }),
      },
    },
  };
}

function sarifReport(report) {
  const rules = [...new Set(report.findings.map((entry) => entry.ruleId))];
  return {
    version: '2.1.0',
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    runs: [
      {
        tool: {
          driver: {
            name: 'code-quality',
            informationUri: 'https://github.com/link-foundation/code-quality',
            rules: rules.map((id) => ({ id })),
          },
        },
        invocations: [{ executionSuccessful: !report.incomplete }],
        ...((report.cloneGroups || report.cloneSuppressions) && {
          properties: {
            ...(report.cloneGroups && { cloneGroups: report.cloneGroups }),
            ...(report.cloneSuppressions && {
              cloneSuppressions: report.cloneSuppressions,
            }),
          },
        }),
        results: report.findings.map((entry) => ({
          ruleId: entry.ruleId,
          level: entry.severity,
          message: { text: entry.message },
          partialFingerprints: { 'code-quality/v1': entry.fingerprint },
          locations: [sarifLocation(entry)],
          ...(entry.relatedLocations && {
            relatedLocations: entry.relatedLocations.map((location, id) => ({
              id,
              ...sarifLocation(location),
            })),
          }),
          ...(entry.dataFlow && {
            codeFlows: [
              {
                threadFlows: [
                  {
                    locations: entry.dataFlow.map((location, index) => ({
                      location: {
                        ...sarifLocation(location),
                        message: { text: `${location.kind}: ${location.name}` },
                      },
                      executionOrder: index + 1,
                    })),
                  },
                ],
              },
            ],
          }),
        })),
      },
    ],
  };
}

const structuredFormats = {
  json: (report) => `${JSON.stringify(report, null, 2)}\n`,
  sarif: (report) => `${JSON.stringify(sarifReport(report), null, 2)}\n`,
  lino: formatLino,
};

export function formatReport(report, format = 'text') {
  if (Object.hasOwn(structuredFormats, format)) {
    return structuredFormats[format](report);
  }
  if (format !== 'text') {
    throw new Error(`Unknown report format: ${format}`);
  }
  const lines = report.findings.flatMap((entry) => [
    `${entry.path}:${entry.line}:${entry.column} ${entry.severity} ${entry.ruleId}: ${entry.message}`,
    ...(entry.dataFlow || []).map(
      (location) =>
        `  ${location.kind} ${location.name} at ${location.path}:${location.line}:${location.column}`
    ),
  ]);
  for (const failure of report.baseline?.failures || []) {
    lines.push(`baseline: ${failure}`);
  }
  for (const [name, value] of Object.entries(report.metrics || {})) {
    lines.push(`${name}: ${value}`);
  }
  if (report.cloneSuppressions) {
    lines.push(`${report.cloneSuppressions.length} clone suppression regions`);
  }
  if (report.cloneGroups) {
    const occurrences = report.cloneGroups.reduce(
      (total, group) => total + group.occurrences.length,
      0
    );
    const count = report.cloneGroups.length;
    lines.push(
      `${count} clone group${count === 1 ? '' : 's'}, ${occurrences} occurrences`
    );
  }
  lines.push(
    `${report.summary.files} files, ${report.summary.errors} errors, ${report.summary.warnings} warnings; ${report.passed ? 'passed' : 'failed'}`
  );
  return `${lines.join('\n')}\n`;
}
