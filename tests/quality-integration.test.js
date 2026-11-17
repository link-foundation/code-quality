import { describe, it } from 'test-anywhere';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  symlink,
} from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { fileURLToPath, URL } from 'node:url';
import {
  analyzeProject,
  createQualityServer,
  runAdapter,
  importFindings,
  parseLcov,
  parseTap,
  shellMutants,
} from '../src/quality/index.js';
import { runProcess } from '../src/quality/process.js';
import { executableHash } from '../src/quality/executable.js';
import { runQualityCli } from '../bin/code-quality.js';
import { itUnless, sandboxed } from './helpers/skip.js';

async function fixture(fn) {
  const root = await mkdtemp(join(tmpdir(), 'quality-contract-'));
  try {
    return await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe('project, command and report integration', () => {
  it('fingerprints changed executable bytes even when version text is unchanged', async () =>
    fixture(async (root) => {
      const path = join(root, 'tool');
      await writeFile(path, '#!/bin/sh\necho fixed-version\n', { mode: 0o755 });
      const before = await executableHash(path);
      await writeFile(
        path,
        '#!/bin/sh\necho fixed-version\n# changed implementation\n'
      );
      const after = await executableHash(path);
      assert.match(before, /^[a-f0-9]{64}$/);
      assert.notEqual(before, after);
    }));
  itUnless(sandboxed)(
    'keeps the existing browser entry point free of Node-only module dependencies',
    async () => {
      const result = await runProcess('node', [
        '--experimental-vm-modules',
        '--input-type=module',
        '-e',
        `import { SourceTextModule } from 'node:vm';
         import { readFile } from 'node:fs/promises';
         const source = await readFile(process.argv[1], 'utf8');
         const entry = new SourceTextModule(source);
         await entry.link(specifier => { throw new Error('Unexpected browser dependency: ' + specifier); });
         await entry.evaluate();
         if (entry.namespace.add(2, 3) !== 5 || entry.namespace.multiply(2, 3) !== 6) process.exit(1);`,
        fileURLToPath(new URL('../src/index.js', import.meta.url)),
      ]);
      assert.equal(result.code, 0, result.stderr);
    }
  );
  it('scans a bounded workspace, honors exclusions and returns CLI JSON and exit codes', async () =>
    fixture(async (root) => {
      await mkdir(join(root, 'src'));
      await mkdir(join(root, 'vendor'));
      await writeFile(join(root, 'src/a.js'), 'export const answer = 42;\n');
      await writeFile(join(root, 'vendor/ignored.js'), 'broken {');
      const report = await analyzeProject(root);
      assert.equal(report.passed, true);
      assert.equal(report.files[0].path, 'src/a.js');
      let output = '';
      let error = '';
      const io = {
        stdout: (value) => {
          output += value;
        },
        stderr: (value) => {
          error += value;
        },
      };
      assert.equal(
        await runQualityCli(['check', root, '--format', 'json'], io),
        0
      );
      assert.equal(JSON.parse(output).passed, true);
      assert.equal(error, '');
      await writeFile(join(root, 'src/a.js'), 'eval("userInput");\n');
      assert.equal(
        await runQualityCli(
          [
            'check',
            root,
            '--output',
            join(root, 'result.json'),
            '--format',
            'json',
          ],
          io
        ),
        1
      );
      assert.equal(
        JSON.parse(await readFile(join(root, 'result.json'), 'utf8'))
          .findings[0].ruleId,
        'unsafe-eval'
      );
      assert.equal(await runQualityCli(['check', root, '--bad'], io), 2);
      assert.match(error, /Unknown option/);
    }));

  itUnless(
    process.platform === 'win32' &&
      'Windows developer mode is required for links'
  )('refuses source symlinks and outside workspace reads', async () =>
    fixture(async (root) => {
      await writeFile(join(root, 'outside.txt'), 'const hidden = 1;\n');
      await symlink(join(root, 'outside.txt'), join(root, 'alias.js'));
      await assert.rejects(() => analyzeProject(root), /[Ss]ymlinks/);
    })
  );
});

describe('external analyzer contracts', () => {
  it('imports independent SARIF and analyzer fixtures and fails closed on malformed output', () => {
    const sarif = {
      version: '2.1.0',
      runs: [
        {
          results: [
            {
              ruleId: 'security/test',
              level: 'error',
              message: { text: 'Synthetic documented-contract case' },
              locations: [
                {
                  physicalLocation: {
                    artifactLocation: { uri: 'src/a%20b.js' },
                    region: { startLine: 3, startColumn: 2 },
                  },
                },
              ],
            },
          ],
        },
      ],
    };
    assert.equal(
      importFindings(sarif, { id: 'scanner', format: 'sarif' })[0].path,
      'src/a b.js'
    );
    assert.equal(
      importFindings(
        [
          {
            file: 'a.sh',
            line: 1,
            column: 1,
            code: 2086,
            level: 'warning',
            message: 'Quote expansion',
          },
        ],
        { format: 'shellcheck' }
      )[0].ruleId,
      'external/SC2086'
    );
    assert.throws(
      () =>
        importFindings({ version: '2.1.0', runs: [{}] }, { format: 'sarif' }),
      /results/
    );
    assert.throws(
      () =>
        importFindings({
          findings: [{ path: '../escape.js', message: 'x', severity: 'error' }],
        }),
      /path/
    );
    assert.throws(
      () =>
        importFindings({
          findings: [
            { path: 'a.js', message: 'x', severity: 'error', line: -1 },
          ],
        }),
      /Malformed/
    );
    assert.throws(() => importFindings({}), /findings/);
  });

  itUnless(sandboxed)(
    'executes argv literally, bounds subprocesses and rejects failed tool execution',
    async () => {
      const literal = '$(never-run) ; echo injected';
      const result = await runProcess('node', [
        '-e',
        'console.log(process.argv[1])',
        literal,
      ]);
      assert.equal(result.stdout.trim(), literal);
      for (const input of ['cmake', 'whitespace']) {
        const probe = await runProcess(
          'node',
          [
            '--max-old-space-size=128',
            '--stack-size=512',
            'experiments/code-quality/input-budgets.mjs',
            input,
          ],
          { timeoutMs: 5000 }
        );
        assert.equal(probe.code, 0, probe.stderr);
      }
      await assert.rejects(
        () =>
          runProcess(
            'node',
            [
              '-e',
              'console.error("tool diagnostic"); setInterval(()=>{},1000)',
            ],
            {
              timeoutMs: 500,
            }
          ),
        (error) =>
          /timeout/.test(error.message) &&
          error.stderr.includes('tool diagnostic') &&
          error.command === 'node'
      );
      await assert.rejects(
        () =>
          runProcess('node', ['-e', 'console.log("x".repeat(2000))'], {
            maxOutputBytes: 1000,
          }),
        /output budget/
      );
      const findings = await runAdapter({
        id: 'fixture',
        command: 'node',
        args: ['-e', 'console.log(JSON.stringify({findings: []}))'],
        format: 'json',
      });
      assert.deepEqual(findings, []);
      await assert.rejects(
        () =>
          runAdapter({
            id: 'fixture',
            command: 'node',
            args: ['-e', 'console.log("{}");process.exit(1)'],
            format: 'json',
          }),
        /findings/
      );
      await assert.rejects(
        () =>
          runAdapter({
            id: 'missing',
            command: 'code-quality-nonexistent-command',
            args: [],
            format: 'json',
          }),
        { code: 'ENOENT' }
      );
    }
  );
});

describe('measurement formats', () => {
  it('validates coverage/TAP completeness and derives shell mutants from syntax and excludes comments', async () => {
    const coverage = parseLcov(
      'TN:contract\nSF:src/example.sh\nDA:1,1\nDA:2,0\nDA:3,1\nLF:3\nLH:2\nend_of_record\n'
    );
    assert.deepEqual(
      [coverage.total, coverage.covered, coverage.linePercent],
      [3, 2, 66.66]
    );
    for (const invalid of [
      '',
      'SF:a\nDA:1,0\n',
      'SF:a\nDA:0,1\nend_of_record\n',
      'SF:a\nDA:1,1\nDA:1,0\nend_of_record\n',
      'SF:a\nDA:1,1\nLF:2\nLF:1\nend_of_record\n',
      'SF:a\nDA:1,1\nLH:0\nLH:1\nend_of_record\n',
    ]) {
      assert.throws(() => parseLcov(invalid));
    }
    assert.deepEqual(parseTap('1..2\nok 1 first\nnot ok 2 second\n'), {
      total: 2,
      failed: 1,
    });
    for (const invalid of [
      '1..0\n',
      '1..2\nok 1 only\n',
      '1..1\nok 1 # skip missing\n',
      '1..1\nok 2 wrong\n',
    ]) {
      assert.throws(() => parseTap(invalid));
    }
    const mutants = await shellMutants({
      path: 'a.sh',
      content: '# return 0 && 1\nif [[ "$1" -eq 1 ]]; then return 0; fi\n',
    });
    assert.equal(mutants.length, 3);
    assert.ok(mutants.every((entry) => entry.line === 2));
    for (const max of [0, -1, Infinity, 0.5, 1002]) {
      await assert.rejects(
        () => shellMutants({ path: 'a.sh', content: 'return 0' }, max),
        /integer/
      );
    }
  });
});

describe('HTTP API', () => {
  itUnless(sandboxed)(
    'analyzes source, authorizes calls and rejects filesystem roots, commands and oversized input',
    async () => {
      const server = createQualityServer({
        token: 'test-local-token',
        maxBodyBytes: 1024,
      });
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
      const url = `http://127.0.0.1:${server.address().port}`;
      const post = (path, body) =>
        fetch(`${url}${path}`, {
          method: 'POST',
          headers: {
            authorization: 'Bearer test-local-token',
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
        });
      try {
        assert.equal((await fetch(`${url}/health`)).status, 200);
        assert.equal((await fetch(`${url}/v1/languages`)).status, 401);
        const response = await post('/v1/analyze', {
          files: [{ path: 'a.py', content: 'def compute(x):\n    return x\n' }],
        });
        assert.equal(response.status, 200);
        assert.equal((await response.json()).passed, true);
        assert.equal((await post('/v1/analyze', { root: '/etc' })).status, 400);
        assert.equal(
          (await post('/v1/analyze', { files: [], config: { adapters: [] } }))
            .status,
          400
        );
        assert.equal(
          (
            await post('/v1/analyze', {
              files: [{ path: 'a.js', content: 'x'.repeat(2000) }],
            })
          ).status,
          413
        );
        assert.equal((await post('/v1/evolution', {})).status, 404);
        const spec = await fetch(`${url}/openapi.json`, {
          headers: { authorization: 'Bearer test-local-token' },
        });
        assert.equal((await spec.json()).openapi, '3.1.0');
      } finally {
        server.closeAllConnections();
        await new Promise((done) => server.close(done));
      }
    }
  );

  it('rejects unbounded server configuration', () => {
    assert.throws(() => createQualityServer({ maxConcurrent: 100 }), /integer/);
    assert.throws(
      () => createQualityServer({ maxBodyBytes: Infinity }),
      /integer/
    );
  });
});
