import { createServer as httpServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { analyzeFiles } from './core.js';
import { extractEvolution } from './evolution.js';
import { languages } from './languages.js';
import { positiveInteger } from './config.js';

export const apiDescription = {
  openapi: '3.1.0',
  info: { title: 'Code Quality API', version: '1.0.0' },
  paths: {
    '/health': {
      get: { responses: { 200: { description: 'Service ready' } } },
    },
    '/v1/languages': {
      get: {
        responses: { 200: { description: 'Language and parser inventory' } },
      },
    },
    '/v1/analyze': {
      post: {
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['files'],
                properties: {
                  files: {
                    type: 'array',
                    minItems: 1,
                    maxItems: 1000,
                    items: {
                      type: 'object',
                      required: ['path', 'content'],
                      properties: {
                        path: { type: 'string' },
                        content: { type: 'string' },
                        language: { type: 'string' },
                      },
                      additionalProperties: false,
                    },
                  },
                  config: { type: 'object' },
                },
                additionalProperties: false,
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Completed analysis, including passed and findings',
          },
          400: { description: 'Invalid source or configuration' },
          413: { description: 'Request byte budget exceeded' },
          429: { description: 'Concurrent request budget exceeded' },
        },
      },
    },
    '/v1/evolution': {
      post: {
        description:
          'Read-only Git analysis of the workspace configured at startup. No request-supplied filesystem roots.',
        responses: {
          200: { description: 'Bounded evolution report' },
          400: { description: 'Invalid revision or history' },
          404: { description: 'No workspace configured' },
        },
      },
    },
  },
};

async function readJson(request, limit) {
  if (
    !/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')
  ) {
    throw Object.assign(new Error('Content-Type must be application/json'), {
      status: 415,
    });
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > limit) {
      throw Object.assign(new Error('Request byte budget exceeded'), {
        status: 413,
      });
    }
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function authorize(header, token) {
  if (!token) {
    return true;
  }
  const actual = Buffer.from(header || '');
  const expected = Buffer.from(`Bearer ${token}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function objectWithKeys(value, keys) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key))
  ) {
    throw new Error('Unknown or invalid request fields');
  }
}

async function analyzeRequest(path, body, root) {
  if (path === '/v1/analyze') {
    objectWithKeys(body, ['files', 'config']);
    if (body.config?.adapters) {
      throw new Error('HTTP analysis cannot execute command adapters');
    }
    if (Array.isArray(body.files)) {
      body.files.forEach((file) =>
        objectWithKeys(file, ['path', 'content', 'language'])
      );
    }
    return await analyzeFiles(body.files, { config: body.config });
  } else {
    objectWithKeys(body, ['from', 'to', 'maxCommits']);
    return await extractEvolution(root, body);
  }
}

export function createQualityServer({
  token,
  root,
  maxBodyBytes = 20_971_520,
  maxConcurrent = 2,
} = {}) {
  positiveInteger(maxBodyBytes, 'maxBodyBytes', 20_971_520);
  positiveInteger(maxConcurrent, 'maxConcurrent', 4);
  let active = 0;
  const server = httpServer(async (request, response) => {
    const send = (status, value) => {
      if (!response.writableEnded) {
        response.writeHead(status, {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
        });
        response.end(JSON.stringify(value));
      }
    };
    const path = request.url;
    if (path === '/health' && request.method === 'GET') {
      send(200, { status: 'ok' });
      return;
    }
    if (!authorize(request.headers.authorization, token)) {
      send(401, { error: 'Unauthorized' });
      request.resume();
      return;
    }
    if (path === '/openapi.json' && request.method === 'GET') {
      send(200, apiDescription);
      return;
    }
    if (path === '/v1/languages' && request.method === 'GET') {
      send(200, { languages });
      return;
    }
    if (
      !['/v1/analyze', '/v1/evolution'].includes(path) ||
      request.method !== 'POST' ||
      (path === '/v1/evolution' && !root)
    ) {
      send(404, { error: 'Not found' });
      request.resume();
      return;
    }
    if (active >= maxConcurrent) {
      send(429, { error: 'Concurrent request budget exceeded' });
      request.resume();
      return;
    }
    active++;
    try {
      const body = await readJson(request, maxBodyBytes);
      send(200, await analyzeRequest(path, body, root));
    } catch (error) {
      send(error.status || 400, { error: error.message });
    } finally {
      active--;
    }
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5000;
  server.maxRequestsPerSocket = 100;
  return server;
}
