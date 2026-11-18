import { defineConfig } from 'vite';
import { URL, fileURLToPath } from 'node:url';

const shim = (name) =>
  fileURLToPath(new URL(`./src/shims/${name}.js`, import.meta.url));

export default defineConfig({
  // Relative asset URLs work at any mount point, including the GitHub Pages
  // subpath /<repository>/demo/.
  base: './',
  resolve: {
    alias: [
      { find: /^node:crypto$/, replacement: shim('crypto') },
      { find: /^node:path$/, replacement: shim('path') },
      { find: /^node:module$/, replacement: shim('module') },
      { find: /^node:fs\/promises$/, replacement: shim('fs-promises') },
      { find: /^node:url$/, replacement: shim('url') },
      { find: /^web-tree-sitter$/, replacement: shim('tree-sitter') },
      {
        find: /^web-tree-sitter-bash-runtime$/,
        replacement: shim('bash-tree-sitter'),
      },
    ],
  },
  esbuild: { jsx: 'automatic' },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 2048,
  },
  server: { fs: { allow: ['../..'] } },
});
