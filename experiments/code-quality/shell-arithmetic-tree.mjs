// Inspect only the public grammar tree of original bounded source.
import { withSyntax, walk } from '../../src/quality/syntax.js';

const source = 'choose() { printf "%s" "$((7 + 3))"; return 2; }\n';
await withSyntax('bash', source, ({ root }) => {
  for (const node of walk(root)) {
    console.log(
      JSON.stringify({
        type: node.type,
        text: node.text,
        parent: node.parent?.type,
        children: node.children.map((child) => child.type),
      })
    );
  }
});
