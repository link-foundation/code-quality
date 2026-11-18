import { describe, it } from 'test-anywhere';
import assert from 'node:assert/strict';
import {
  analyzeFiles,
  createBaseline,
  checkBaseline,
} from '../src/quality/index.js';
import { parseCmake } from '../src/quality/cmake.js';

const options = {
  config: { clones: { minTokens: 7 }, rules: { 'duplicate-function': false } },
};

describe('native CMake token-block contracts', () => {
  it('finds a partial definition through the existing bounded pair engine', async () => {
    const files = [
      {
        path: 'a.cmake',
        content: 'function(alpha input)\nmessage("${input}")\nendfunction()\n',
      },
      {
        path: 'b.cmake',
        content: 'function(beta input)\nmessage("${input}")\nendfunction()\n',
      },
    ];
    const report = await analyzeFiles(files, options);
    assert.equal(report.incomplete, false);
    assert.equal(report.clones.length, 1);
    const [clone] = report.clones;
    assert.equal(clone.tokens, 9);
    assert.deepEqual(clone.first, {
      path: 'a.cmake',
      start: 15,
      end: 55,
      line: 1,
      column: 16,
      endLine: 3,
      endColumn: 14,
    });
    assert.deepEqual(clone.second, {
      path: 'b.cmake',
      start: 14,
      end: 54,
      line: 1,
      column: 15,
      endLine: 3,
      endColumn: 14,
    });
    assert.equal(report.passed, false);
    const reversed = await analyzeFiles([...files].reverse(), options);
    assert.deepEqual(reversed.clones, report.clones);
    assert.deepEqual(reversed.findings, report.findings);
  });

  it('records original lexical spans without comments or argument evaluation', () => {
    const content =
      '\uFEFFmessage ( "# literal" #[=[ignored()]=] [==[${name}]==] (one) -Dkey="two words" $(BUILD) )\r\n';
    const parsed = parseCmake(content, { tokens: true });
    assert.deepEqual(parsed.errors, []);
    assert.deepEqual(
      parsed.tokens.map((token) => content.slice(token.start, token.end)),
      [
        'message',
        '(',
        '"# literal"',
        '[==[${name}]==]',
        '(',
        'one',
        ')',
        '-Dkey="two words"',
        '$(BUILD)',
        ')',
      ]
    );
    assert.equal(Object.hasOwn(parseCmake('message(one)\n'), 'tokens'), false);
  });

  it('ignores comments and external whitespace while preserving argument kind and text', async () => {
    const a = { path: 'a.cmake', content: 'message("one two")\n' };
    const b = {
      path: 'b.cmake',
      content: '# before\nmessage ( #[[ note ]] "one two" )\n',
    };
    const config = { clones: { minTokens: 4 } };
    const same = await analyzeFiles([a, b], { config });
    assert.equal(same.incomplete, false);
    assert.equal(same.clones[0].tokens, 4);
    for (const argument of ['"one  two"', '[=[one two]=]']) {
      const changed = await analyzeFiles(
        [a, { ...b, content: `message(${argument})\n` }],
        { config }
      );
      assert.deepEqual(changed.clones, []);
    }
    const cased = await analyzeFiles(
      [a, { ...b, content: 'MESSAGE("one two")\n' }],
      { config }
    );
    assert.deepEqual(cased.clones, []);
  });
});

describe('CMake token normalization and refusal contracts', () => {
  it('normalizes names and static argument literals only when requested', async () => {
    const files = [
      { path: 'a.cmake', content: 'emit("original")\n' },
      { path: 'b.cmake', content: 'other("changed")\n' },
    ];
    for (const flags of [
      {},
      { ignoreIdentifiers: true },
      { ignoreLiterals: true },
    ]) {
      const report = await analyzeFiles(files, {
        config: { clones: { minTokens: 4, ...flags } },
      });
      assert.deepEqual(report.clones, []);
    }
    const normalized = await analyzeFiles(files, {
      config: {
        clones: { minTokens: 4, ignoreIdentifiers: true, ignoreLiterals: true },
      },
    });
    assert.equal(normalized.clones[0].tokens, 4);
  });

  it('keeps dynamic references visible and brackets literal without evaluating either', async () => {
    const report = (a, b) =>
      analyzeFiles(
        [
          { path: 'a.cmake', content: `message(${a})\n` },
          { path: 'b.cmake', content: `message(${b})\n` },
        ],
        {
          config: {
            clones: {
              minTokens: 4,
              ignoreLiterals: true,
              ignoreIdentifiers: true,
            },
          },
        }
      );
    for (const [a, b] of [
      ['"${left}"', '"${right}"'],
      ['$ENV{LEFT}', '$ENV{RIGHT}'],
      ['$CACHE{LEFT}', '$CACHE{RIGHT}'],
      ['"$<BOOL:LEFT>"', '"$<BOOL:RIGHT>"'],
    ]) {
      assert.deepEqual((await report(a, b)).clones, []);
    }
    assert.equal(
      (await report('[=[${left}]=]', '[=[${right}]=]')).clones[0].tokens,
      4
    );
  });

  it('keeps UTF-16 ranges through BOM, CRLF, Unicode and multiline arguments', async () => {
    const content = '\uFEFF# comment\r\nmessage("🦊\r\nvalue")\r\n';
    const result = await analyzeFiles(
      [
        { path: 'a.cmake', content },
        { path: 'b.cmake', content },
      ],
      { config: { clones: { minTokens: 4 } } }
    );
    assert.equal(result.incomplete, false);
    const [clone] = result.clones;
    assert.deepEqual(
      [
        clone.first.line,
        clone.first.column,
        clone.first.endLine,
        clone.first.endColumn,
      ],
      [2, 1, 3, 8]
    );
    assert.equal(
      content.slice(clone.first.start, clone.first.end),
      'message("🦊\r\nvalue")'
    );
  });

  it('finds local nonoverlapping commands and keeps CMake separate from other languages', async () => {
    const report = await analyzeFiles(
      [{ path: 'same.cmake', content: 'emit(value)\nemit(value)\n' }],
      { config: { clones: { minTokens: 4 } } }
    );
    assert.equal(report.clones.length, 1);
    assert.equal(report.clones[0].tokens, 4);
    assert.ok(report.clones[0].first.end <= report.clones[0].second.start);
    const mixed = await analyzeFiles(
      [
        { path: 'a.cmake', content: 'emit(value)\n' },
        { path: 'b.py', content: 'emit(value)\n' },
      ],
      { config: { clones: { minTokens: 4 } } }
    );
    assert.deepEqual(mixed.clones, []);
  });

  it('retains syntax and unresolved-expansion refusals and exact clone baselines', async () => {
    for (const content of [
      'message("unclosed)\n',
      'function(${name} input)\nendfunction()\n',
    ]) {
      const report = await analyzeFiles(
        [{ path: 'bad.cmake', content }],
        options
      );
      assert.equal(report.incomplete, true);
      assert.throws(() => createBaseline(report), /Incomplete/);
    }
    const files = ['a.cmake', 'b.cmake'].map((path) => ({
      path,
      content: 'message("same")\n',
    }));
    const config = { clones: { minTokens: 4 } };
    const original = await analyzeFiles(files, { config });
    const changed = await analyzeFiles(
      files.map((file) => ({ ...file, content: 'message("other")\n' })),
      { config }
    );
    assert.equal(original.clones[0].tokens, changed.clones[0].tokens);
    assert.equal(
      checkBaseline(changed, createBaseline(original)).passed,
      false
    );
  });
});
