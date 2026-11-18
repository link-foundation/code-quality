import { StrictMode, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { UiView } from '@link-foundation/ui-react';
import { Comparison } from './components/Comparison.jsx';
import { Playground } from './components/Playground.jsx';
import { documentSource } from './document.js';
import { createTranslator, initialLocale } from './i18n.js';
import { samples } from './samples.js';
import { DemoContext } from './state.js';
import { themes } from './theme.js';
import css from './styles.css?raw';

const components = { playground: Playground, comparison: Comparison };

function initialState() {
  return {
    sample: samples[0].id,
    files: Object.fromEntries(samples.map((s) => [s.id, s.files])),
    configs: Object.fromEntries(samples.map((s) => [s.id, s.config])),
    format: 'text',
    report: null,
    error: null,
    running: false,
  };
}

function App() {
  const [locale, setLocale] = useState(initialLocale);
  const [state, setState] = useState(initialState);
  const t = useMemo(() => createTranslator(locale), [locale]);
  const source = useMemo(() => documentSource(t, locale), [t, locale]);
  const switchTo = (next) => () => {
    setLocale(next);
    document.documentElement.lang = next;
    const url = new URL(globalThis.location.href);
    url.searchParams.set('lang', next);
    globalThis.history.replaceState(null, '', url);
  };
  const actions = useMemo(
    () => ({ 'locale-en': switchTo('en'), 'locale-ru': switchTo('ru') }),
    []
  );
  const context = useMemo(() => ({ t, state, setState }), [t, state]);
  return (
    <DemoContext.Provider value={context}>
      <UiView
        source={source}
        themes={themes}
        css={css}
        actions={actions}
        components={components}
        setTitle={false}
      />
    </DemoContext.Provider>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
