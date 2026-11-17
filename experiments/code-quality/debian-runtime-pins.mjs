// Regenerate distribution metadata from Debian's public HTTPS package indexes.
// This reads packaging metadata, never any competitor implementation or suite.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, stat, writeFile } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { resolve, join } from 'node:path';

const names = new Set([
  'base-files',
  'libbrotli1',
  'libbz2-1.0',
  'libcom-err2',
  'libcurl4',
  'libdb5.3',
  'libdw1',
  'libelf1',
  'libffi8',
  'libgcc-s1',
  'libgmp10',
  'libgnutls30',
  'libgssapi-krb5-2',
  'libhogweed6',
  'libidn2-0',
  'libk5crypto3',
  'libkeyutils1',
  'libkrb5-3',
  'libkrb5support0',
  'libldap-2.5-0',
  'liblzma5',
  'libnettle8',
  'libnghttp2-14',
  'libp11-kit0',
  'libpsl5',
  'librtmp1',
  'libsasl2-2',
  'libsasl2-modules-db',
  'libssh2-1',
  'libssl3',
  'libstdc++6',
  'libtasn1-6',
  'libunistring2',
  'libzstd1',
  'zlib1g',
  'gcc-12-base',
]);
const directory = resolve(process.argv[2] || '.');
assert.notEqual(directory, resolve('.'), 'Supply an owned research directory');
await mkdir(directory, { recursive: true });

async function download(url, path) {
  try {
    const hash = createHash('sha256');
    let bytes = 0;
    for await (const chunk of createReadStream(path)) {
      bytes += chunk.length;
      assert.ok(bytes <= 16_777_216, 'Cached index exceeds 16 MiB');
      hash.update(chunk);
    }
    return {
      sha256: hash.digest('hex'),
      retrievedAt: (await stat(path)).mtime.toISOString(),
    };
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(300_000) });
  assert.ok(response.ok && response.body, `${response.status}: ${url}`);
  const hash = createHash('sha256');
  const output = await open(path, 'wx', 0o600);
  let count = 0;
  try {
    for await (const chunk of response.body) {
      count += chunk.length;
      assert.ok(count <= 16_777_216, 'Compressed index exceeds 16 MiB');
      hash.update(chunk);
      await output.writeFile(chunk);
    }
  } finally {
    await output.close();
  }
  return {
    sha256: hash.digest('hex'),
    retrievedAt: (await stat(path)).mtime.toISOString(),
  };
}

function remember(record, packages, base, arch) {
  if (!names.has(record.Package) || record.Architecture !== arch) {
    return;
  }
  assert.match(record.SHA256, /^[a-f0-9]{64}$/);
  assert.match(record.Filename, /^pool\/[a-zA-Z0-9+._~/-]+\.deb$/);
  const previous = packages.get(record.Package);
  if (previous) {
    const compared = spawnSync('dpkg', [
      '--compare-versions',
      record.Version,
      'gt',
      previous.version,
    ]);
    assert.ok([0, 1].includes(compared.status), compared.stderr?.toString());
    if (compared.status === 1) {
      return;
    }
  }
  packages.set(record.Package, {
    name: record.Package,
    version: record.Version,
    url: `${base}/${record.Filename}`,
    sha256: record.SHA256,
    depends: [record.Depends, record['Pre-Depends']].filter(Boolean).join(', '),
  });
}

async function readIndex(path, packages, base, arch) {
  const child = spawn(
    'xz',
    ['--decompress', '--stdout', '--memlimit-decompress=64MiB', path],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  let stderr = '';
  child.stderr.on('data', (value) => {
    stderr += value;
    if (stderr.length > 65_536) {
      child.kill();
    }
  });
  const finished = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(stderr))
    );
  });
  finished.catch(() => {});
  let bytes = 0;
  let record = {};
  try {
    for await (const line of createInterface({
      input: child.stdout,
      crlfDelay: Infinity,
    })) {
      bytes += Buffer.byteLength(line) + 1;
      assert.ok(
        bytes <= 134_217_728 && line.length <= 131_072,
        `Index byte budget exceeded: ${bytes} total bytes, ${line.length} characters in line`
      );
      if (!line) {
        remember(record, packages, base, arch);
        record = {};
      } else if (line[0] !== ' ') {
        const colon = line.indexOf(':');
        record[line.slice(0, colon)] = line.slice(colon + 2);
      }
    }
    remember(record, packages, base, arch);
  } catch (error) {
    child.kill();
    await finished.catch(() => {});
    throw error;
  }
  await finished;
  return bytes;
}

function validateClosure(packages) {
  assert.equal(packages.size, names.size, 'Missing expected runtime package');
  for (const item of packages.values()) {
    // base-files contributes license texts only, never its programs or scripts.
    if (item.name === 'base-files') {
      continue;
    }
    for (const requirement of item.depends.split(',').filter(Boolean)) {
      const alternatives = requirement.split('|');
      assert.ok(
        alternatives.some((value) => {
          const match = /^(\S+)(?: \((>=|<=|=|<<|>>) (\S+)\))?$/.exec(
            value.trim()
          );
          assert.ok(match, `Unsupported dependency syntax: ${value}`);
          const [, name, operator, minimum] = match;
          const version =
            name === 'libc6' ? '2.36' : packages.get(name)?.version;
          if (!version) {
            return false;
          }
          if (!operator) {
            return true;
          }
          const compared = spawnSync('dpkg', [
            '--compare-versions',
            version,
            operator,
            minimum,
          ]);
          assert.ok(
            [0, 1].includes(compared.status),
            compared.stderr?.toString()
          );
          return compared.status === 0;
        }),
        `${item.name}: missing dependency ${requirement}`
      );
    }
  }
}

const indexes = [];
const pins = {};
for (const arch of ['amd64', 'arm64']) {
  const packages = new Map();
  for (const [base, suite] of [
    ['https://deb.debian.org/debian', 'bookworm'],
    ['https://deb.debian.org/debian-security', 'bookworm-security'],
  ]) {
    const url = `${base}/dists/${suite}/main/binary-${arch}/Packages.xz`;
    const path = join(directory, `${suite}-${arch}.xz`);
    const { sha256, retrievedAt } = await download(url, path);
    const bytes = await readIndex(path, packages, base, arch);
    indexes.push({ url, sha256, retrievedAt, inflatedBytes: bytes });
  }
  validateClosure(packages);
  pins[arch === 'amd64' ? 'x64' : arch] = [...packages.values()].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}
await writeFile(
  join(directory, 'runtime-pins.json'),
  `${JSON.stringify(
    {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      verification:
        'HTTPS Debian package-index SHA-256 fields; no local Debian signing keyring',
      hostDependencies: ['libc6 >= 2.36', 'Bash >= 5.2', 'Python 3'],
      indexes,
      pins,
    },
    null,
    2
  )}\n`,
  { flag: 'w' }
);
console.log(
  JSON.stringify(
    { packages: names.size, architectures: Object.keys(pins), indexes },
    null,
    2
  )
);
