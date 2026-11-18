// Links Notation (LiNo) is the default human-readable interchange of the
// associative tech stack. Reports encode losslessly through lino-objects-codec;
// configuration decodes through it too, but the codec keeps the last of
// repeated keys, so inputs must already be in canonical form: re-encoding the
// decoded value has to reproduce the source. Repeated keys, dropped lines and
// alternative spellings therefore fail closed.
import { decode, encode } from 'lino-objects-codec';

export const linoMediaType = 'text/x-lino';

export function formatLino(value) {
  return `${encode({ obj: value })}\n`;
}

function canonicalLines(text) {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line !== '')
    .join('\n');
}

export function parseCanonicalLino(text) {
  let value;
  try {
    value = decode({ notation: text });
  } catch (error) {
    throw new Error(`Invalid Links Notation: ${error.message}`, {
      cause: error,
    });
  }
  const expected = canonicalLines(encode({ obj: value }));
  if (canonicalLines(text) !== expected) {
    throw new Error(
      `Links Notation input is not canonical (repeated keys or ambiguous layout); expected:\n${expected.split('\n').slice(0, 40).join('\n')}`
    );
  }
  return value;
}
