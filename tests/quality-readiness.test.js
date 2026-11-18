import { URL } from 'node:url';
import { describe, it } from 'test-anywhere';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { checkReadiness } from '../scripts/check-quality-readiness.mjs';

const inventory = JSON.parse(
  await readFile(
    new URL('../docs/case-studies/issue-1/readiness.json', import.meta.url),
    'utf8'
  )
);
describe('honest quality readiness inventory', () => {
  it('validates evidence and refuses incomplete parity without enabling Rust', () => {
    assert.equal(checkReadiness(inventory).passed, true);
    const result = checkReadiness(inventory, { strict: true });
    assert.equal(result.passed, false);
    assert.ok(
      result.errors.some((error) => error.includes('competitor-parity'))
    );
    assert.ok(
      result.errors.some((error) => error.includes('quality-bash-parity'))
    );
    assert.equal(inventory.translation.productionRust, false);
  });
  it('rejects omitted requirements, carried behavior and nonexistent evidence', () => {
    const omitted = globalThis.structuredClone(inventory);
    omitted.capabilities.pop();
    assert.equal(checkReadiness(omitted).passed, false);
    assert.equal(
      checkReadiness(inventory, { exists: () => false }).passed,
      false
    );
    const carried = globalThis.structuredClone(inventory);
    carried.capabilities[0].status = 'carried';
    assert.ok(
      checkReadiness(carried, { strict: true }).errors.some((error) =>
        error.includes('carried')
      )
    );
  });
});
