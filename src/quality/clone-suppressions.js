import { lineLocator } from './lines.js';

// Segments prevent a match from crossing an omitted region. Parsing and all
// other rules still see the original source; only clone tokens are omitted.
export function cloneFile(file, config, context) {
  const locate = config.suppressionComments ? lineLocator(file.content) : null;
  let tokens = [];
  let start;
  const flush = () => {
    if (tokens.length) {
      context.files.push({ path: file.path, language: file.language, tokens });
      tokens = [];
    }
  };
  return {
    comment(text, offset) {
      if (!locate) {
        return;
      }
      for (const marker of text.matchAll(/\bCPD-(OFF|ON)\b/g)) {
        if (++context.suppressionMarkers > 10_000) {
          throw new Error('Clone suppression marker budget exceeded');
        }
        const index = offset + marker.index;
        if (marker[1] === 'OFF') {
          if (start !== undefined) {
            throw new Error(`${file.path}: nested clone suppression comment`);
          }
          flush();
          start = index + marker[0].length;
        } else {
          if (start === undefined) {
            throw new Error(`${file.path}: unmatched clone suppression CPD-ON`);
          }
          const first = locate(start);
          const end = locate(index);
          context.suppressions.push({
            path: file.path,
            start,
            end: index,
            line: first.line,
            column: first.column,
            endLine: end.line,
            endColumn: end.column,
          });
          start = undefined;
        }
      }
    },
    add(token) {
      if (start === undefined) {
        tokens.push(token);
      }
    },
    finish() {
      if (start !== undefined) {
        throw new Error(`${file.path}: unterminated clone suppression CPD-OFF`);
      }
      flush();
    },
  };
}
