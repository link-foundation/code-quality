import { describe, it } from 'test-anywhere';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { utf8ByteLength } from '../src/quality/bytes.js';
import { formatReport } from '../src/quality/report-format.js';
import { analyzeFiles } from '../src/quality/core.js';
import { createHash as shimHash } from '../examples/demo-site/src/shims/crypto.js';
import { basename, extname } from '../examples/demo-site/src/shims/path.js';
import { documentSource, quote } from '../examples/demo-site/src/document.js';

const demo = new URL('../examples/demo-site/', import.meta.url);

// Flattened `a.b.c` keys of an indentation-based lino-i18n catalogue.
function catalogKeys(text) {
  const path = [];
  const keys = [];
  for (const line of text.split('\n').slice(1)) {
    const match = /^( +)(\S+)( .*)?$/.exec(line);
    if (!match) {
      continue;
    }
    const depth = match[1].length / 2 - 1;
    path.length = depth;
    path.push(match[2]);
    if (match[3]) {
      keys.push(path.join('.'));
    }
  }
  return keys.sort();
}

describe('browser demo site', () => {
  it('counts UTF-8 bytes exactly like Buffer without Node globals', () => {
    for (const text of [
      '',
      'ascii',
      'é',
      '€ sign',
      '𝄞 clef',
      'Русский',
      '\ud800 lone',
    ]) {
      assert.equal(utf8ByteLength(text), Buffer.byteLength(text), text);
    }
  });

  it('hashes with the synchronous SHA-256 shim exactly like node:crypto', () => {
    for (const input of [
      '',
      'abc',
      'x'.repeat(55),
      'y'.repeat(64),
      'Песочница 𝄞',
    ]) {
      assert.equal(
        shimHash('sha256').update(input).digest('hex'),
        createHash('sha256').update(input).digest('hex')
      );
    }
    const bytes = new Uint8Array([0, 1, 2, 255]);
    assert.equal(
      shimHash('sha256').update(bytes).digest('hex'),
      createHash('sha256').update(bytes).digest('hex')
    );
  });

  it('keeps the POSIX path shim compatible with the analyzer', () => {
    assert.equal(basename('a/b/c.test.js'), 'c.test.js');
    assert.equal(extname('a/b/c.test.js'), '.js');
    assert.equal(extname('a/.bashrc'), '');
  });

  it('formats reports without importing the filesystem layer', async () => {
    const report = await analyzeFiles([
      { path: 'app.py', content: 'def run(code):\n    return eval(code)\n' },
    ]);
    const lino = formatReport(report, 'lino');
    assert.ok(lino.startsWith('('));
    assert.equal(JSON.parse(formatReport(report, 'sarif')).version, '2.1.0');
    const source = readFileSync(
      new URL('../src/quality/report-format.js', import.meta.url),
      'utf8'
    );
    assert.doesNotMatch(source, /node:fs|from 'fs/);
  });

  it('ships English and Russian catalogues with the same keys', () => {
    const en = readFileSync(new URL('src/locales/en.lino', demo), 'utf8');
    const ru = readFileSync(new URL('src/locales/ru.lino', demo), 'utf8');
    assert.ok(catalogKeys(en).length > 30);
    assert.deepEqual(catalogKeys(ru), catalogKeys(en));
  });

  it('builds a Links Notation page document for each locale', () => {
    assert.equal(quote("it's"), `"it's"`);
    assert.equal(quote('say "hi"'), `'say "hi"'`);
    assert.throws(() => quote(`it's "both"`));
    const source = documentSource((key) => key, 'ru');
    assert.match(source, /^\(app: document/);
    assert.match(source, /\(lang ru\)/);
    assert.match(source, /\(playground: playground\)/);
    assert.match(source, /locale-ru: button .*\(variant filled\)/);
    const opens = source.split('(').length;
    assert.equal(opens, source.split(')').length);
  });
});
