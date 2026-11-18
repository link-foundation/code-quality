// Portable UTF-8 byte length so the analysis engine runs in Node, Deno, Bun
// and browsers without depending on the Node-only Buffer global. Lone
// surrogates count as three bytes, matching Buffer.byteLength and TextEncoder.
export function utf8ByteLength(text) {
  let bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (isSurrogatePair(text, index, code)) {
      bytes += 4;
      index += 1;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

function isSurrogatePair(text, index, code) {
  if (code < 0xd800 || code > 0xdbff) {
    return false;
  }
  const next = text.charCodeAt(index + 1);
  return next >= 0xdc00 && next <= 0xdfff;
}
