// See tree-sitter.js: the Bash runtime is a separately pinned web-tree-sitter.
import Parser from '../../../../node_modules/web-tree-sitter-bash-runtime/tree-sitter.js';
import wasm from '../../../../node_modules/web-tree-sitter-bash-runtime/tree-sitter.wasm?url';

const init = Parser.init.bind(Parser);
Parser.init = (options = {}) => init({ locateFile: () => wasm, ...options });

export default Parser;
