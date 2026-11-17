function sarifLocation(entry) {
  return {
    physicalLocation: {
      artifactLocation: {
        uri: entry.path.split('/').map(encodeURIComponent).join('/'),
        uriBaseId: '%SRCROOT%',
      },
      region: { startLine: entry.line, startColumn: entry.column },
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
        results: report.findings.map((entry) => ({
          ruleId: entry.ruleId,
          level: entry.severity,
          message: { text: entry.message },
          partialFingerprints: { 'code-quality/v1': entry.fingerprint },
          locations: [sarifLocation(entry)],
        })),
      },
    ],
  };
}

export function formatReport(report, format = 'text') {
  if (format === 'json' || format === 'sarif') {
    return `${JSON.stringify(format === 'json' ? report : sarifReport(report), null, 2)}\n`;
  }
  if (format !== 'text') {
    throw new Error(`Unknown report format: ${format}`);
  }
  const lines = report.findings.map(
    (entry) =>
      `${entry.path}:${entry.line}:${entry.column} ${entry.severity} ${entry.ruleId}: ${entry.message}`
  );
  lines.push(
    `${report.summary.files} files, ${report.summary.errors} errors, ${report.summary.warnings} warnings; ${report.passed ? 'passed' : 'failed'}`
  );
  return `${lines.join('\n')}\n`;
}
