import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runQualityCli } from '../../src/quality/cli.js';
import { hash } from '../../src/quality/syntax.js';

// Independent contract fixture; algorithm names deliberately make no claim of
// equivalent operators, parsers or rounding between the two implementations.
export async function verifyBaselineImport(root, report) {
  const source = {
    $schema:
      'https://raw.githubusercontent.com/ever-guild/quality-bash/v1.0.0-alpha.3/baseline.schema.json',
    files: ['choose.sh'],
    method: {
      coverage: { algorithm: 'independent-original-coverage' },
      mutation: {
        algorithm: 'independent-original-mutation',
        operators: ['original-comparison'],
        parser: { name: 'original-contract', version: '1' },
      },
      tools: { bash: '5.2', bats: '1.14', shellcheck: '0.11', kcov: '43' },
    },
    coverage: { linePercent: report.metrics.linePercent },
    mutation: { score: report.metrics.mutationScore },
  };
  const path = join(root, 'quality-bash-original.json');
  const content = JSON.stringify(source);
  await writeFile(path, content);
  const args = [
    'baseline-update',
    root,
    '--create',
    '--baseline-path',
    'imported-baseline.json',
    '--import-quality-bash',
    path,
    '--migrate',
    'Reviewed independent operators, parser and rounding',
  ];
  let error = '';
  const io = {
    stdout: () => {},
    stderr: (value) => {
      error += value;
    },
  };
  assert.equal(await runQualityCli(args, io), 0, error);
  const created = await readFile(join(root, 'imported-baseline.json'), 'utf8');
  const baseline = JSON.parse(created);
  assert.deepEqual(baseline.metrics, report.metrics);
  assert.equal(baseline.migrations[0].previous, hash(content));
  assert.notEqual(baseline.method, hash(JSON.stringify(source.method)));
  assert.equal(await readFile(path, 'utf8'), content);
  assert.equal(await runQualityCli(args, io), 2);
  assert.match(error, /missing native baseline/);
  assert.equal(
    await readFile(join(root, 'imported-baseline.json'), 'utf8'),
    created
  );
  assert.equal(await readFile(path, 'utf8'), content);
}
