// Finite original syntax probes for the pinned grammar/runtime contract.
import { withSyntax, walk } from '../../src/quality/syntax.js';
const sources = [
  ...[
    '+',
    '-',
    '*',
    '/',
    '%',
    '**',
    '<',
    '<=',
    '>',
    '>=',
    '==',
    '!=',
    '&',
    '|',
    '^',
    '<<',
    '>>',
    '&&',
    '||',
  ].map((operator) => `printf '%s' "$((7 ${operator} 3))"\n`),
  ...[
    '! 7',
    '~ 7',
    '- 7',
    '+ 7',
    'value++',
    '++value',
    'value--',
    '--value',
  ].map((expression) => `printf '%s' "$(( ${expression} ))"\n`),
  '[[ -n word ]]\n',
  '[[ -z "" ]]\n',
  '[[ word == word ]]\n',
  '[[ 7 -gt 3 ]]\n',
];
for (const source of sources) {
  try {
    const nodes = await withSyntax('bash', source, ({ root }) =>
      [...walk(root)].map((node) => ({
        kind: node.type,
        text: node.text,
        parent: node.parent?.type,
      }))
    );
    console.log(JSON.stringify({ source, nodes }));
  } catch (error) {
    console.log(JSON.stringify({ source, error: error.message }));
  }
}
