// A small independent all-pairs oracle checks the rolling candidate index.
import assert from 'node:assert/strict';
import { detectTokenClones } from '../../src/quality/clones.js';

function matchingLength(a, x, b, y, limit) {
  let length = 0;
  while (
    length < limit &&
    x + length < a.tokens.length &&
    y + length < b.tokens.length &&
    a.tokens[x + length].value === b.tokens[y + length].value
  ) {
    length++;
  }
  return length;
}

function expected(files, minimum) {
  const result = [];
  for (let right = 0; right < files.length; right++) {
    for (let left = 0; left <= right; left++) {
      const a = files[left];
      const b = files[right];
      for (let x = 0; x < a.tokens.length; x++) {
        for (let y = left === right ? x + 1 : 0; y < b.tokens.length; y++) {
          const limit = left === right ? y - x : Infinity;
          const length = matchingLength(a, x, b, y, limit);
          const extendsLeft =
            x &&
            y &&
            a.tokens[x - 1].value === b.tokens[y - 1].value &&
            length < limit;
          if (length >= minimum && !extendsLeft) {
            result.push([a.path, x, b.path, y, length]);
          }
        }
      }
    }
  }
  return result.sort();
}

let state = 31;
const next = () =>
  (state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0);
for (let trial = 0; trial < 60; trial++) {
  const files = ['a.js', 'b.js'].map((path) => ({
    path,
    language: 'javascript',
    tokens: Array.from({ length: 8 + (next() % 9) }, (_, index) => ({
      value: 1 + ((next() >>> 16) % 4),
      start: index,
      end: index + 1,
      line: 1,
      column: index + 1,
      endLine: 1,
      endColumn: index + 2,
    })),
  }));
  for (const minTokens of [1, 2, 3, 4, 5]) {
    const actual = detectTokenClones(
      { files, values: [null, 1, 2, 3, 4] },
      { minTokens }
    )
      .map((clone) => [
        clone.first.path,
        clone.first.start,
        clone.second.path,
        clone.second.start,
        clone.tokens,
      ])
      .sort();
    assert.deepEqual(
      actual,
      expected(files, minTokens),
      `trial ${trial}, minimum ${minTokens}`
    );
  }
}
console.log(
  '300 finite token-index comparisons agree with an independent all-pairs oracle'
);
