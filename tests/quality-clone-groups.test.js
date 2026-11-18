import { describe, it } from 'test-anywhere';
import assert from 'node:assert/strict';
import {
  analyzeFiles,
  createBaseline,
  checkBaseline,
  formatReport,
} from '../src/quality/index.js';
import { qualityFixtures } from './fixtures/quality-languages.js';

const config = (extra = {}) => ({
  clones: { minTokens: 7, ...extra },
  rules: { 'duplicate-function': false },
});
const copies = (content) =>
  ['c.js', 'a.js', 'b.js'].map((path) => ({ path, content }));

describe('native clone occurrence groups', () => {
  it('collects three locations once while preserving all pair findings', async () => {
    const files = copies('emit(value + 2);\n');
    const report = await analyzeFiles(files, { config: config() });
    assert.equal(report.clones.length, 3);
    assert.equal(report.findings.length, 3);
    assert.equal(report.passed, false);
    assert.equal(report.cloneGroups.length, 1);
    const [group] = report.cloneGroups;
    assert.equal(group.language, 'javascript');
    assert.equal(group.tokens, 7);
    assert.equal(group.signature, report.clones[0].signature);
    assert.deepEqual(
      group.occurrences.map((entry) => entry.path),
      ['a.js', 'b.js', 'c.js']
    );
    assert.deepEqual(group.occurrences[0], report.clones[0].first);
    assert.equal(JSON.stringify(group).includes('emit'), false);
    const reversed = await analyzeFiles([...files].reverse(), {
      config: config(),
    });
    assert.deepEqual(reversed.cloneGroups, report.cloneGroups);
    assert.deepEqual(reversed.findings, report.findings);
    assert.equal(reversed.method, report.method);
    assert.equal(checkBaseline(reversed, createBaseline(report)).passed, true);
  });

  it('keeps different token signatures separate and follows explicit normalization', async () => {
    const files = [
      { path: 'a.js', content: 'emit(left + 2);\n' },
      { path: 'b.js', content: 'emit(left + 2);\n' },
      { path: 'c.js', content: 'emit(right + 3);\n' },
      { path: 'd.js', content: 'emit(right + 3);\n' },
    ];
    const exact = await analyzeFiles(files, { config: config() });
    assert.equal(exact.cloneGroups.length, 2);
    assert.ok(
      exact.cloneGroups.every(
        (group) => group.tokens === 7 && group.occurrences.length === 2
      )
    );
    assert.notEqual(
      exact.cloneGroups[0].signature,
      exact.cloneGroups[1].signature
    );
    const normalized = await analyzeFiles(files, {
      config: config({ ignoreIdentifiers: true, ignoreLiterals: true }),
    });
    assert.equal(normalized.cloneGroups.length, 1);
    assert.equal(normalized.cloneGroups[0].occurrences.length, 4);
    assert.equal(normalized.clones.length, 6);
  });

  it('retains different maximal lengths and their exact source ranges', async () => {
    const report = await analyzeFiles(
      [
        { path: 'a.js', content: 'alpha();shared();\n' },
        { path: 'b.js', content: 'alpha();shared();\n' },
        { path: 'c.js', content: 'shared();\n' },
      ],
      { config: config({ minTokens: 4 }) }
    );
    assert.deepEqual(
      report.cloneGroups.map((group) => [
        group.tokens,
        group.occurrences.length,
      ]),
      [
        [8, 2],
        [4, 3],
      ]
    );
    assert.deepEqual(
      report.cloneGroups[1].occurrences.map(({ path, start, end }) => [
        path,
        start,
        end,
      ]),
      [
        ['a.js', 8, 17],
        ['b.js', 8, 17],
        ['c.js', 0, 9],
      ]
    );
  });

  it('deduplicates same-file occurrences without discarding shifted maximal pairs', async () => {
    const report = await analyzeFiles(
      [{ path: 'repeat.js', content: 'tick(value);\n'.repeat(3) }],
      { config: config({ minTokens: 5 }) }
    );
    assert.equal(report.clones.length, 7);
    assert.equal(report.cloneGroups.length, 5);
    const complete = report.cloneGroups.find((group) =>
      group.occurrences.some((entry) => entry.start === 0)
    );
    assert.deepEqual(
      complete.occurrences.map(({ start, end }) => [start, end]),
      [
        [0, 12],
        [13, 25],
        [26, 38],
      ]
    );
    assert.ok(
      report.clones.every((clone) => clone.first.end <= clone.second.start)
    );
  });

  it('keeps audited suppression regions separate from group metadata', async () => {
    const report = await analyzeFiles(
      copies('// CPD-OFF\nhidden(value);\n// CPD-ON\nemit(value + 2);\n'),
      { config: config({ suppressionComments: true }) }
    );
    assert.equal(report.cloneSuppressions.length, 3);
    assert.equal(report.cloneGroups.length, 1);
    assert.ok(
      report.cloneGroups[0].occurrences.every(({ line }) => line === 4)
    );
    const sarif = JSON.parse(formatReport(report, 'sarif'));
    assert.deepEqual(sarif.runs[0].properties.cloneGroups, report.cloneGroups);
    assert.deepEqual(
      sarif.runs[0].properties.cloneSuppressions,
      report.cloneSuppressions
    );
  });

  it('exports group evidence in JSON, SARIF and text while preserving pair results', async () => {
    const report = await analyzeFiles(copies('emit(value + 2);\n'), {
      config: config(),
    });
    assert.deepEqual(
      JSON.parse(formatReport(report, 'json')).cloneGroups,
      report.cloneGroups
    );
    const sarif = JSON.parse(formatReport(report, 'sarif')).runs[0];
    assert.deepEqual(sarif.properties.cloneGroups, report.cloneGroups);
    assert.equal(sarif.results.length, 3);
    assert.match(formatReport(report), /1 clone group, 3 occurrences/);
    const plain = await analyzeFiles(copies('emit(value + 2);\n'));
    assert.equal(Object.hasOwn(plain, 'cloneGroups'), false);
    const empty = await analyzeFiles(
      [{ path: 'a.js', content: 'emit(value + 2);\n' }],
      { config: config() }
    );
    assert.deepEqual(empty.cloneGroups, []);
  });
});

describe('clone groups across language domains', () => {
  for (const [language, fixture] of Object.entries(qualityFixtures)) {
    it(`${language}: combines three independently parsed locations`, async () => {
      const files = ['c', 'a', 'b'].map((prefix) => ({
        ...fixture,
        path: `${prefix}/${fixture.path}`,
      }));
      const report = await analyzeFiles(files, {
        config: config({ minTokens: 5 }),
      });
      assert.equal(report.incomplete, false);
      assert.equal(report.clones.length, 3);
      assert.equal(report.cloneGroups.length, 1);
      assert.equal(report.cloneGroups[0].language, language);
      assert.deepEqual(
        report.cloneGroups[0].occurrences.map(({ path }) => path),
        ['a', 'b', 'c'].map((prefix) => `${prefix}/${fixture.path}`)
      );
    });
  }

  it('keeps matching spellings in JavaScript and TypeScript in different groups', async () => {
    const files = ['a.js', 'b.js', 'a.ts', 'b.ts'].map((path) => ({
      path,
      content: 'emit(value + 2);\n',
    }));
    const report = await analyzeFiles(files, { config: config() });
    assert.equal(report.cloneGroups.length, 2);
    assert.deepEqual(
      report.cloneGroups.map(({ language }) => language).sort(),
      ['javascript', 'typescript']
    );
    assert.ok(
      report.cloneGroups.every((group) => group.occurrences.length === 2)
    );
  });
});
