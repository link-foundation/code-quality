import assert from 'node:assert/strict';
import { withSyntax, walk } from '../../src/quality/syntax.js';
import { matchTreePattern } from '../../src/quality/tree-patterns.js';
import { analyzeFiles } from '../../src/quality/index.js';

await withSyntax(
  'javascript',
  'publish(first); publish(second);\n',
  ({ root }) => {
    const nodes = [...walk(root)].filter(
      (node) => node.type === 'call_expression'
    );
    const pattern = { kind: 'call_expression' };
    const budget = { remaining: 1 };
    assert.equal(matchTreePattern(nodes[0], pattern, budget), true);
    assert.throws(
      () => matchTreePattern(nodes[1], pattern, budget),
      /comparison budget/
    );
    assert.throws(
      () => matchTreePattern(root, { capture: 'ROOT' }, { remaining: 3 }),
      /comparison budget/
    );
  }
);

const customRules = Array.from({ length: 100 }, (_, index) => ({
  id: `local/capture-${index}`,
  message: 'Original finite budget probe',
  pattern: { tree: { kind: 'program', capture: 'ROOT' } },
}));
await assert.rejects(
  () =>
    analyzeFiles([{ path: 'finite.js', content: '0;\n'.repeat(12_000) }], {
      config: { customRules },
    }),
  /Tree pattern comparison budget exceeded/
);
console.log(
  'Shared structural comparison budget refuses finite candidate/capture work and 12,000-statement analysis'
);
