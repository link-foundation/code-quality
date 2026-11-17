import { describe, it } from 'test-anywhere';
import assert from 'node:assert/strict';
import { parseKcov, parseTap, runAdapter } from '../src/quality/index.js';

describe('shell measurement diagnostics', () => {
  it('refuses duplicate coverage filenames and executable-line counters', () => {
    for (const source of [
      '{"coverage":{"a.sh":{"1":0,"1":1}}}',
      '{"coverage":{"a.sh":{"1":0},"a.sh":{"1":1}}}',
      '{"coverage":{"a.sh":{"1":0,"\\u0031":1}}}',
      '{"coverage":{"a.sh":{"1":0}},"coverage":{"a.sh":{"1":1}}}',
    ]) {
      assert.throws(() => parseKcov(source), /Duplicate JSON/);
    }
  });

  it('refuses contradictory analyzer fields before importing findings', async () => {
    await assert.rejects(
      runAdapter(
        {
          id: 'shellcheck',
          command: 'shellcheck',
          args: [],
          format: 'shellcheck',
        },
        {
          run: async () => ({
            code: 0,
            stderr: '',
            stdout:
              '[{"file":"a.sh","line":1,"column":1,"code":2086,"level":"error","level":"info","message":"Original diagnostic"}]',
          }),
        }
      ),
      /Duplicate JSON/
    );
  });

  it('accepts Bats TAP comments and headers but refuses unknown records and malformed test numbers', () => {
    assert.deepEqual(
      parseTap('TAP version 13\n1..1\nok 1 original assertion\n# diagnostic\n'),
      { total: 1, failed: 0 }
    );
    for (const source of [
      '1..1\nok 1 original assertion\nunknown runner record\n',
      '1..1\nok 1.2 invalid identifier\n',
      '1..1\nok 1 original assertion\n1..2 malformed trailing plan\n',
      'TAP version 13\nTAP version 13\n1..1\nok 1\n',
      '1..1\nok 1\nTAP version 13\n',
    ]) {
      assert.throws(() => parseTap(source), /TAP/);
    }
  });
});
