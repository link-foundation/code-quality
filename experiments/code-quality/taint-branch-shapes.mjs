// Original finite branch grammar observations, without executing project code.
import { withSyntax } from '../../src/quality/syntax.js';

for (const language of ['javascript', 'typescript', 'tsx']) {
  const source =
    'function route(flag) { let item = "safe"; if (flag) { item = input.read(); } else if (flag) return; else { item = clean(item); } execute(flag ? item : "safe"); execute(flag && item); }';
  const tree = await withSyntax(language, source, ({ root }) => {
    let remaining = 500;
    function describe(node, depth = 0) {
      if (--remaining < 0 || depth > 32) {
        throw new Error('Finite grammar budget exceeded');
      }
      return {
        type: node.type,
        fields: Object.fromEntries(
          [
            'condition',
            'consequence',
            'alternative',
            'body',
            'left',
            'right',
            'operator',
          ].flatMap((name) => {
            const value = node.childForFieldName(name);
            return value ? [[name, value.type]] : [];
          })
        ),
        children: node.namedChildren.map((child) => describe(child, depth + 1)),
      };
    }
    return describe(root);
  });
  console.log(JSON.stringify({ language, source, tree }));
}
