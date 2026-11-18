#!/usr/bin/env node
// Browser smoke test of the built demo: serve dist/ below a GitHub Pages-like
// subpath, run every playground sample in headless Chromium and check the
// findings, the output formats and the Russian catalogue.
//
// Playwright is not a dependency of the demo; CI installs a pinned copy with
// --no-save. Usage: npm run build && node scripts/smoke.mjs
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { URL, fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const mount = '/code-quality/demo/';
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.wasm': 'application/wasm',
  '.css': 'text/css',
};

const expected = {
  taint: ['example/command-flow'],
  python: ['hardcoded-secret', 'unsafe-eval'],
  shell: ['duplicate-function'],
  polyglot: ['complexity', 'parameters', 'complexity', 'parameters'],
};

function serve() {
  const server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (!path.startsWith(mount)) {
      response.writeHead(404).end();
      return;
    }
    const relative = normalize(path.slice(mount.length) || 'index.html');
    if (relative.startsWith('..')) {
      response.writeHead(400).end();
      return;
    }
    const file = join(dist, relative);
    try {
      if (!(await stat(file)).isFile()) {
        throw new Error('not a file');
      }
      response.writeHead(200, {
        'content-type': types[extname(file)] || 'application/octet-stream',
      });
      response.end(await readFile(file));
    } catch {
      response.writeHead(404).end();
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function check(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function analyze(page, sample) {
  await page.selectOption('select', sample);
  await page.click('.cq-primary');
  await page.waitForSelector('[data-testid="verdict"]', { timeout: 30000 });
  const rules = await page.$$eval(
    '.cq-findings tbody tr td:nth-child(2)',
    (cells) => cells.map((cell) => cell.textContent.trim())
  );
  check(
    JSON.stringify(rules.sort()) ===
      JSON.stringify([...expected[sample]].sort()),
    `${sample}: expected ${expected[sample]}, got ${rules}`
  );
  console.log(`ok ${sample}: ${rules.join(', ')}`);
}

const server = await serve();
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
const errors = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  await page.goto(`${origin}${mount}?lang=en`);
  await page.getByRole('button', { name: 'Analyze' }).waitFor();
  for (const sample of Object.keys(expected)) {
    await analyze(page, sample);
  }
  for (const format of ['json', 'sarif', 'lino']) {
    await page.getByRole('button', { name: format, exact: true }).click();
    const output = await page.textContent('[data-testid="output"]');
    check(
      format === 'lino'
        ? output.includes('schemaVersion 1')
        : JSON.parse(output),
      `${format} output is not usable`
    );
  }
  console.log('ok output formats: json, sarif, lino');
  await page.getByRole('button', { name: 'Русский' }).click();
  await page.getByRole('button', { name: 'Анализировать' }).waitFor();
  check(page.url().includes('lang=ru'), 'locale is not kept in the URL');
  console.log('ok Russian catalogue');
  check(!errors.length, `browser errors: ${errors.join('; ')}`);
} finally {
  await browser.close();
  server.close();
}
