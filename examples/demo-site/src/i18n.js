// UI strings are lino-i18n catalogues (`src/locales/*.lino`), bundled as text.
import {
  createI18n,
  detectLanguage,
  parseLinoCatalog,
} from 'lino-i18n/browser';
import en from './locales/en.lino?raw';
import ru from './locales/ru.lino?raw';

const locales = Object.fromEntries(
  [en, ru].map((text) => {
    const { locale, translations } = parseLinoCatalog(text);
    return [locale, translations];
  })
);

export const supportedLanguages = Object.keys(locales);

export function initialLocale(search = globalThis.location?.search ?? '') {
  return detectLanguage(
    new globalThis.URLSearchParams(search).get('lang') ?? 'auto',
    {
      supportedLanguages,
      defaultLocale: 'en',
    }
  );
}

export function createTranslator(locale) {
  const i18n = createI18n({ locales, defaultLocale: locale, fallback: ['en'] });
  return (key, params) => i18n.t(key, params);
}
