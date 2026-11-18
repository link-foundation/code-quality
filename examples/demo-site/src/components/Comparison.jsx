import { useDemo } from '../state.js';

const rows = [
  ['sonarqube', 'SonarQube'],
  ['semgrep', 'Semgrep'],
  ['codeql', 'GitHub CodeQL'],
  ['pmd', 'PMD/CPD'],
  ['qualitybash', 'quality-bash'],
];

const caseStudy =
  'https://github.com/link-foundation/code-quality/blob/main/docs/case-studies/issue-1/competitors.md';

export function Comparison() {
  const { t } = useDemo();
  return (
    <section className="cq-card" aria-labelledby="cq-comparison">
      <h2 id="cq-comparison">{t('comparison.title')}</h2>
      <p>{t('comparison.intro')}</p>
      <div className="cq-scroll">
        <table>
          <thead>
            <tr>
              <th>{t('comparison.product')}</th>
              <th>{t('comparison.area')}</th>
              <th>{t('comparison.status')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([key, name]) => (
              <tr key={key}>
                <td>{name}</td>
                <td>{t(`comparison.rows.${key}.area`)}</td>
                <td>{t(`comparison.rows.${key}.status`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        <a href={caseStudy} rel="noreferrer">
          {t('comparison.more')}
        </a>
      </p>
    </section>
  );
}
