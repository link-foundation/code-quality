// Original finite compatibility probe; candidate stays outside installed dependencies.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const candidate = await import(pathToFileURL(resolve(process.argv[2])).href);
const Parser = candidate.Parser ?? candidate.default;
await Parser.init();
const Language = candidate.Language ?? Parser.Language;
const imports = globalThis.WebAssembly.Module.imports(
  new globalThis.WebAssembly.Module(
    await readFile(
      require.resolve('tree-sitter-wasms/out/tree-sitter-bash.wasm')
    )
  )
);
console.log(JSON.stringify({ imports }));
for (const name of [
  'javascript',
  'typescript',
  'tsx',
  'rust',
  'python',
  'go',
  'c_sharp',
  'java',
  'c',
  'cpp',
  'php',
  'bash',
]) {
  const parser = new Parser();
  let tree;
  try {
    parser.setLanguage(
      await Language.load(
        name === 'bash' && process.argv[3]
          ? resolve(process.argv[3])
          : require.resolve(`tree-sitter-wasms/out/tree-sitter-${name}.wasm`)
      )
    );
    parser.setTimeoutMicros(2_000_000);
    tree = parser.parse(name === 'bash' ? '[[ word == word ]]\n' : '');
    const root = tree.rootNode;
    const hasError =
      typeof root.hasError === 'function' ? root.hasError() : root.hasError;
    assert.equal(hasError, false);
    console.log(
      JSON.stringify({
        name,
        root: root.toString(),
        isNamedType: typeof root.isNamed,
        isMissingType: typeof root.isMissing,
      })
    );
  } finally {
    tree?.delete();
    parser.delete();
  }
}
