// The two pinned web-tree-sitter runtimes look for their own `.wasm` next to
// the script. In a bundle that location does not exist, so `init` is given
// the emitted asset URL.
import Parser from '../../../../node_modules/web-tree-sitter/tree-sitter.js';
import wasm from '../../../../node_modules/web-tree-sitter/tree-sitter.wasm?url';

const init = Parser.init.bind(Parser);
Parser.init = (options = {}) => init({ locateFile: () => wasm, ...options });

export default Parser;
