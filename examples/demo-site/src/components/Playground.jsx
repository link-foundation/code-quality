import { analyzeFiles } from '../../../../src/quality/core.js';
import { formatReport } from '../../../../src/quality/report-format.js';
import { parseCanonicalLino } from '../../../../src/quality/lino.js';
import { formats, samples } from '../samples.js';
import { useDemo } from '../state.js';
import { Findings } from './Findings.jsx';

export async function runAnalysis(files, configText) {
  const config = configText.trim() ? parseCanonicalLino(configText) : undefined;
  return analyzeFiles(files, { config });
}

function Editors({ sample, edit }) {
  const { t, state } = useDemo();
  const files = state.files[sample.id];
  return (
    <div className="cq-editors">
      {files.map((file, index) => (
        <label key={file.path} className="cq-field">
          <span>
            {t('playground.file')}: <code>{file.path}</code>
          </span>
          <textarea
            spellCheck={false}
            value={file.content}
            rows={Math.min(16, file.content.split('\n').length + 1)}
            onChange={(event) =>
              edit({ file: index, value: event.target.value })
            }
          />
        </label>
      ))}
      <label className="cq-field">
        <span>{t('playground.config')}</span>
        <small>{t('playground.configHint')}</small>
        <textarea
          spellCheck={false}
          data-testid="config"
          value={state.configs[sample.id]}
          rows={Math.min(14, state.configs[sample.id].split('\n').length + 1)}
          onChange={(event) => edit({ config: event.target.value })}
        />
      </label>
    </div>
  );
}

function Output() {
  const { t, state, setState } = useDemo();
  if (state.error) {
    return (
      <div role="alert" className="cq-error">
        <strong>{t('playground.error')}:</strong> {state.error}
      </div>
    );
  }
  if (!state.report) {
    return null;
  }
  return (
    <>
      <Findings report={state.report} />
      <div className="cq-row" role="group" aria-label={t('playground.output')}>
        <span>{t('playground.output')}:</span>
        {formats.map((format) => (
          <button
            key={format}
            type="button"
            aria-pressed={state.format === format}
            onClick={() => setState((old) => ({ ...old, format }))}
          >
            {format}
          </button>
        ))}
      </div>
      <pre className="cq-output" data-testid="output">
        {formatReport(state.report, state.format)}
      </pre>
    </>
  );
}

export function Playground() {
  const { t, state, setState } = useDemo();
  const sample = samples.find((entry) => entry.id === state.sample);
  const edit = ({ file, value, config }) =>
    setState((old) => ({
      ...old,
      ...(config !== undefined && {
        configs: { ...old.configs, [sample.id]: config },
      }),
      ...(file !== undefined && {
        files: {
          ...old.files,
          [sample.id]: old.files[sample.id].map((entry, index) =>
            index === file ? { ...entry, content: value } : entry
          ),
        },
      }),
    }));
  const analyze = async () => {
    setState((old) => ({ ...old, running: true, error: null }));
    try {
      const report = await runAnalysis(
        state.files[sample.id],
        state.configs[sample.id]
      );
      setState((old) => ({ ...old, running: false, report }));
    } catch (error) {
      setState((old) => ({
        ...old,
        running: false,
        report: null,
        error: error.message,
      }));
    }
  };
  return (
    <section className="cq-card" aria-labelledby="cq-playground">
      <h2 id="cq-playground">{t('playground.title')}</h2>
      <div className="cq-row">
        <label>
          {t('playground.sample')}{' '}
          <select
            value={state.sample}
            onChange={(event) =>
              setState((old) => ({
                ...old,
                sample: event.target.value,
                report: null,
                error: null,
              }))
            }
          >
            {samples.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {t(`playground.samples.${entry.id}`)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="cq-primary"
          disabled={state.running}
          onClick={analyze}
        >
          {state.running ? t('playground.running') : t('playground.analyze')}
        </button>
      </div>
      <Editors sample={sample} edit={edit} />
      <Output />
    </section>
  );
}
