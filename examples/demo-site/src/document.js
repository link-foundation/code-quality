// The page itself is a Links Notation document rendered by
// @link-foundation/ui. `playground` and `comparison` are custom kinds drawn by
// React components; everything else is a basic ui-dom kind.
export function quote(text) {
  if (!text.includes("'")) {
    return `'${text}'`;
  }
  if (!text.includes('"')) {
    return `"${text}"`;
  }
  throw new Error(`Cannot quote text with both quote kinds: ${text}`);
}

const localeButton = (id, label, active) =>
  `(locale-${id}: button (label ${quote(label)}) (variant ${active ? 'filled' : 'outlined'}) (on press (emit locale-${id})))`;

export function documentSource(t, locale) {
  return `(app: document
  (theme material3)
  (lang ${locale})
  (page: stack
    (direction vertical)
    (gap (token space.medium))
    (header: stack
      (direction horizontal)
      (gap (token space.small))
      (align center)
      (brand: text ${quote(t('app.title'))})
      ${localeButton('en', 'English', locale === 'en')}
      ${localeButton('ru', 'Русский', locale === 'ru')})
    (tagline: text ${quote(t('app.tagline'))})
    (playground: playground)
    (comparison: comparison)
    (footer: text ${quote(t('app.footer'))})))`;
}
