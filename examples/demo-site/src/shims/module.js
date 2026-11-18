// Browser stand-in for `createRequire(...).resolve(...)`: the analyzer only
// resolves tree-sitter grammar files, which Vite emits as hashed asset URLs.
const grammars = import.meta.glob(
  // Only the grammars src/quality/languages.js loads (Bash ships in-repo).
  '../../../../node_modules/tree-sitter-wasms/out/tree-sitter-{javascript,typescript,tsx,rust,python,go,c_sharp,java,c,cpp,php}.wasm',
  { query: '?url', import: 'default', eager: true }
);
const byName = new Map(
  Object.entries(grammars).map(([path, url]) => [path.split('/').at(-1), url])
);

export function createRequire() {
  return {
    resolve(specifier) {
      const url = byName.get(specifier.split('/').at(-1));
      if (!url) {
        throw new Error(`No bundled asset for ${specifier}`);
      }
      return url;
    },
  };
}

export default { createRequire };
