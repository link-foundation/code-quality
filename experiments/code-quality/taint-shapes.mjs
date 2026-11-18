// Finite original syntax observations; no project execution or upstream examples.
import { withSyntax } from '../../src/quality/syntax.js';

const cases = [
  [
    'javascript',
    'function route(value) { const copy = value; execute(copy); return copy; }',
  ],
  [
    'javascript',
    'let item = input.read(); item = clean(item); execute("prefix" + item);',
  ],
  [
    'typescript',
    'export function route(value: string): void { const copy = value as string; execute(copy!); }',
  ],
  ['tsx', 'function route(value: string) { execute(value); }'],
  ['javascript', 'const joined = `label:${input()}`; execute(joined);'],
];
for (const [language, content] of cases) {
  const tree = await withSyntax(language, content, ({ root }) => {
    let remaining = 1000;
    const describe = (node, depth = 0) => {
      if (--remaining < 0 || depth > 32) {
        throw new Error('Finite syntax observation exceeds budget');
      }
      return {
        type: node.type,
        text: node.namedChildCount ? undefined : node.text,
        fields: Object.fromEntries(
          [
            'name',
            'value',
            'left',
            'right',
            'function',
            'arguments',
            'parameters',
            'body',
            'object',
            'property',
            'operator',
          ].flatMap((field) => {
            const child = node.childForFieldName(field);
            return child ? [[field, child.type]] : [];
          })
        ),
        children: node.namedChildren.map((child) => describe(child, depth + 1)),
      };
    };
    return describe(root);
  });
  console.log(JSON.stringify({ language, content, tree }));
}
