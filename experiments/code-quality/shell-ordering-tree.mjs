// Original finite arithmetic-context and literal-boundary observations.
import { withSyntax, walk } from '../../src/quality/syntax.js';
import { shellMutants } from '../../src/quality/index.js';
const sources = [
  'printf "%s" "$((7 < 3))" "$((7 <= 3))" "$((7 > 3))" "$((7 >= 3))"\n',
  '((7 < 3))\n',
  'for ((count=2; count < 7; count++)); do printf tick; done\n',
  '[[ left < right ]]\n',
  '[[ / == / ]]\n',
  'first && second || third\n',
  'printf "%s" "&&" "||"\n',
  '[[ "$1" == "&&" ]]\n',
  '[[ "*" == "*" ]]\n',
  'printf "%s" "$((5 * 2))"\n',
  'printf "%s" "$(((7 < 3) + 2))" "$((-(7 < 3)))" "$((4 ? 7 < 3 : 2))"\n',
  '[[ -n word && -n other ]]\n',
  'printf "%s" "$((7 && 3 || 2))"\n',
];
for (const source of sources) {
  const nodes = await withSyntax('bash', source, ({ root }) =>
    [...walk(root)]
      .filter(
        (node) =>
          node.childCount === 0 &&
          ['<', '<=', '>', '>=', '*', '+', '/', '&&', '||'].includes(node.text)
      )
      .map((node) => ({
        kind: node.type,
        text: node.text,
        parent: node.parent?.type,
        operator: node.parent?.childForFieldName('operator')?.id === node.id,
        ancestors: (() => {
          const names = [];
          for (
            let parent = node.parent;
            parent && names.length < 16;
            parent = parent.parent
          ) {
            names.push(parent.type);
          }
          return names;
        })(),
      }))
  );
  console.log(
    JSON.stringify({
      source,
      nodes,
      mutants: await shellMutants({ path: 'probe.sh', content: source }),
      expanded: await shellMutants({ path: 'probe.sh', content: source }, 100, {
        policy: 'expanded',
      }),
    })
  );
}
