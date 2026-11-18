// Material 3 theme packages from @link-foundation/ui-themes, bundled as
// their original Links Notation text (no fetch at run time).
import base from '@link-foundation/ui-themes/themes/base/theme.lino?raw';

const parts = import.meta.glob(
  '../node_modules/@link-foundation/ui-themes/themes/material3/{colors,type,shape,elevation,motion,styles,templates,theme}.lino',
  { query: '?raw', import: 'default', eager: true }
);

export const themes = [base, ...Object.values(parts)].join('\n');
