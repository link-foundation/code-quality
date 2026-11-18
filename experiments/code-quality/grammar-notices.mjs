import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { URL } from 'node:url';

// Audit dependency notices from the grammar versions in the WASM builder's pinned lock.
const lock = JSON.parse(
  await readFile(
    new URL(
      '../../docs/case-studies/issue-1/data/grammar-provenance.json',
      import.meta.url
    ),
    'utf8'
  )
);
const names =
  /^(bash|c|c-sharp|cpp|go|java|javascript|php|python|rust|typescript)$/;
const notices = [];
for (const [name, { version }] of Object.entries(lock.grammars)) {
  if (!names.test(name.replace('tree-sitter-', ''))) {
    continue;
  }
  const response = await fetch(`https://registry.npmjs.org/${name}/${version}`);
  if (!response.ok) {
    throw new Error(`Metadata unavailable: ${name}`);
  }
  const metadata = await response.json();
  const archive = await fetch(metadata.dist.tarball);
  if (!archive.ok) {
    throw new Error(`Archive unavailable: ${name}`);
  }
  const tar = gunzipSync(Buffer.from(await archive.arrayBuffer()), {
    maxOutputLength: 33_554_432,
  });
  let notice;
  for (let offset = 0; offset + 512 <= tar.length; ) {
    const path = tar
      .subarray(offset, offset + 100)
      .toString()
      .replace(/\0.*$/, '');
    const size =
      parseInt(
        tar
          .subarray(offset + 124, offset + 136)
          .toString()
          .replace(/\0.*$/, '')
          .trim(),
        8
      ) || 0;
    if (/^package\/(?:LICENSE|COPYING)(?:\.\w+)?$/i.test(path)) {
      notice = tar.subarray(offset + 512, offset + 512 + size).toString();
      break;
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  if (!notice) {
    throw new Error(`Missing license: ${name}`);
  }
  notices.push(
    `## ${name} ${version}\n\nRegistry license: ${metadata.license}.\n\n${notice}\n`
  );
}
await writeFile(
  '/tmp/code-quality-issue-1-research/grammar-notices.md',
  notices.join('\n')
);
