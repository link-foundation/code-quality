import { useDemo } from '../state.js';

export function Findings({ report }) {
  const { t } = useDemo();
  const { summary } = report;
  return (
    <div className="cq-findings">
      <h3>
        {t('playground.findings')}{' '}
        <span
          className={report.passed ? 'cq-badge cq-pass' : 'cq-badge cq-fail'}
          data-testid="verdict"
        >
          {report.passed ? t('playground.passed') : t('playground.failed')}
        </span>
      </h3>
      <p>
        {t('playground.summary', {
          files: summary.files,
          errors: summary.errors,
          warnings: summary.warnings,
        })}
      </p>
      {report.findings.length ? (
        <div className="cq-scroll">
          <table>
            <thead>
              <tr>
                <th>{t('playground.column.severity')}</th>
                <th>{t('playground.column.rule')}</th>
                <th>{t('playground.column.location')}</th>
                <th>{t('playground.column.message')}</th>
              </tr>
            </thead>
            <tbody>
              {report.findings.map((finding) => (
                <tr key={finding.fingerprint}>
                  <td>
                    <span className={`cq-badge cq-${finding.severity}`}>
                      {finding.severity}
                    </span>
                  </td>
                  <td>
                    <code>{finding.ruleId}</code>
                  </td>
                  <td>
                    <code>
                      {finding.path}:{finding.line}:{finding.column}
                    </code>
                  </td>
                  <td>{finding.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>{t('playground.none')}</p>
      )}
      <p className="cq-muted">
        {t('playground.method')}: <code>{report.method}</code>
      </p>
    </div>
  );
}
