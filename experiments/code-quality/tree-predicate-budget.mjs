import assert from 'node:assert/strict';
import { withSyntax, walk } from '../../src/quality/syntax.js';
import { matchTreePattern } from '../../src/quality/tree-patterns.js';
import { analyzeFiles } from '../../src/quality/index.js';

await withSyntax('javascript', 'dispatch(first, second);\n', ({ root }) => {
  const call = [...walk(root)].find((node) => node.type === 'call_expression');
  const predicate = { all: [{ kind: 'call_expression' }] };
  assert.throws(
    () => matchTreePattern(call, predicate, { remaining: 1 }),
    /comparison budget/
  );
  assert.equal(matchTreePattern(call, predicate, { remaining: 3 }), true);
  assert.throws(
    () =>
      matchTreePattern(
        call,
        {
          capture: 'CALL',
          all: [{ kind: 'call_expression' }],
        },
        { remaining: 3 }
      ),
    /comparison budget/
  );
});

const customRules = Array.from({ length: 100 }, (_, index) => ({
  id: `local/predicate-${index}`,
  message: 'Original finite predicate probe',
  pattern: {
    tree: { kind: 'program', all: [{ capture: 'ROOT' }] },
  },
}));
await assert.rejects(
  () =>
    analyzeFiles([{ path: 'finite.js', content: '0;\n'.repeat(12_000) }], {
      config: { customRules },
    }),
  /Tree pattern comparison budget exceeded/
);
console.log(
  'Shared finite predicate and capture work refuses incomplete analysis'
);
