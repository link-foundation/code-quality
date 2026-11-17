import Parser from 'web-tree-sitter-bash-runtime';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { URL } from 'node:url';

const grammarSha256 =
  'd1844429a58620f306b6f42aebe92298243ca8120cd833a3ab5d87c7a2e7b9fd';
export const bashParserMethod = `web-tree-sitter@0.24.7/tree-sitter-bash@0.23.3/${grammarSha256}`;
let language;

async function loadLanguage() {
  await Parser.init();
  const bytes = await readFile(
    new URL('./grammars/tree-sitter-bash.wasm', import.meta.url)
  );
  if (createHash('sha256').update(bytes).digest('hex') !== grammarSha256) {
    throw new Error('Bash grammar checksum mismatch');
  }
  return await Parser.Language.load(bytes);
}

export async function withBashSyntax(source, callback) {
  language ||= loadLanguage();
  const grammar = await language;
  const parser = new Parser();
  let tree;
  try {
    parser.setLanguage(grammar);
    parser.setTimeoutMicros(2_000_000);
    tree = parser.parse(source);
    if (!tree) {
      throw new Error('Parser budget exceeded');
    }
    return await callback({ root: tree.rootNode, cmake: null });
  } finally {
    tree?.delete();
    parser.delete();
  }
}
