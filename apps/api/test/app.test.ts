import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliCompressSync } from 'node:zlib';
import { createApp, type AppOptions } from '../src/http/app.js';

const apps: Awaited<ReturnType<typeof createApp>>[] = [];
const directories: string[] = [];

async function build(options: AppOptions = {}) {
  const app = await createApp(options);
  apps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe('HTTP basket adapter', () => {
  it('serves the immutable catalog with bounded cache lifetime and security headers', async () => {
    const app = await createApp();
    apps.push(app);
    const response = await app.inject('/api/catalog');
    expect(response.statusCode).toBe(200);
    expect(
      response
        .json()
        .products.map((product: { code: string; priceCents: number }) => [
          product.code,
          product.priceCents,
        ]),
    ).toEqual([
      ['R01', 3295],
      ['G01', 2495],
      ['B01', 795],
    ]);
    expect(response.headers['cache-control']).toBe('public, max-age=300');
    expect(
      response.json().examples.map((example: { totalCents: number }) => example.totalCents),
    ).toEqual([3785, 5437, 6085, 9827]);
    expect(response.json().offer.productCode).toBe('R01');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-security-policy']).toContain("script-src 'self'");
    expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(response.headers['content-security-policy']).not.toContain('unsafe-inline');
  });

  it.each([
    [
      [
        { code: 'B01', quantity: 1 },
        { code: 'G01', quantity: 1 },
      ],
      3785,
    ],
    [[{ code: 'R01', quantity: 2 }], 5437],
    [
      [
        { code: 'R01', quantity: 1 },
        { code: 'G01', quantity: 1 },
      ],
      6085,
    ],
    [
      [
        { code: 'B01', quantity: 2 },
        { code: 'R01', quantity: 3 },
      ],
      9827,
    ],
    [[], 0],
  ])('returns the challenge total for %j', async (items, expected) => {
    const app = await build();
    const response = await app.inject({ method: 'POST', url: '/api/quotes', payload: { items } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ currency: 'USD', totalCents: expected });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('normalizes duplicate items and keeps requests independent', async () => {
    const app = await build();
    const response = await app.inject({
      method: 'POST',
      url: '/api/quotes',
      payload: {
        items: [
          { code: 'R01', quantity: 1 },
          { code: 'R01', quantity: 1 },
        ],
      },
    });
    expect(response.json().items).toHaveLength(1);
    expect(response.json()).toMatchObject({ itemCount: 2, totalCents: 5437 });
    const empty = await app.inject({ method: 'POST', url: '/api/quotes', payload: { items: [] } });
    expect(empty.json().totalCents).toBe(0);
  });

  it.each([
    {},
    { items: null },
    { items: 'R01' },
    { items: [], totalCents: 1 },
    { items: [{ code: 'R01', quantity: 1, priceCents: 1 }] },
    { items: [{ code: 'R01', quantity: '1' }] },
    { items: [{ code: 'R01', quantity: 1.5 }] },
    { items: [{ code: 'R01', quantity: 0 }] },
    { items: [{ code: 'R01', quantity: -1 }] },
    { items: [{ code: 'R01', quantity: 101 }] },
    { items: [{ code: 'R01' }] },
    { items: [{ quantity: 1 }] },
    { items: [{ code: '<script>', quantity: 1 }] },
    { items: [{ code: 'r01', quantity: 1 }] },
    { items: Array.from({ length: 101 }, () => ({ code: 'B01', quantity: 1 })) },
  ])('rejects malformed or tampered input: %j', async (payload) => {
    const app = await build();
    const response = await app.inject({ method: 'POST', url: '/api/quotes', payload });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: 'INVALID_REQUEST',
        message: 'Provide valid product codes and whole-number quantities from 1 to 100.',
      },
    });
  });

  it.each([
    [[{ code: 'Z99', quantity: 1 }], 'UNKNOWN_PRODUCT'],
    [
      [
        { code: 'R01', quantity: 100 },
        { code: 'B01', quantity: 1 },
      ],
      'BASKET_LIMIT_EXCEEDED',
    ],
  ])('maps domain failures without exposing internals', async (items, code) => {
    const app = await build();
    const response = await app.inject({ method: 'POST', url: '/api/quotes', payload: { items } });
    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe(code);
  });

  it('rejects invalid JSON, excessive bodies and unsupported media types', async () => {
    const app = await build();
    for (const [payload, contentType, status] of [
      ['{', 'application/json', 400],
      ['x'.repeat(20_000), 'application/json', 413],
      ['<xml />', 'application/xml', 415],
    ] as const) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/quotes',
        payload,
        headers: { 'content-type': contentType },
      });
      expect(response.statusCode).toBe(status);
      expect(response.json().error).not.toHaveProperty('stack');
    }
  });

  it('rate limits quotes and keeps health checks accessible', async () => {
    const app = await build({ rateLimitMax: 2 });
    const request = { method: 'POST' as const, url: '/api/quotes', payload: { items: [] } };
    await app.inject(request);
    await app.inject(request);
    const blocked = await app.inject(request);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().error.code).toBe('RATE_LIMITED');
    expect(blocked.headers['retry-after']).toBeDefined();
    expect((await app.inject('/healthz')).json()).toEqual({ status: 'ok' });
    expect((await app.inject('/readyz')).json()).toEqual({ status: 'ready' });
  });

  it.each([
    new Error('secret database password'),
    Object.assign(new Error('hidden'), { statusCode: 503 }),
  ])('sanitizes unexpected errors', async (error) => {
    const app = await build({
      quoteService: {
        execute: () => {
          throw error;
        },
      },
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/quotes',
      payload: { items: [] },
    });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'The request could not be completed.' },
    });
    expect(response.body).not.toContain('secret');
  });

  it('returns a consistent not-found response', async () => {
    const app = await build({ logger: true });
    expect((await app.inject('/api/missing')).json().error.code).toBe('NOT_FOUND');
  });

  it('serves built assets with CSP and refuses filesystem traversal', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'acme-static-'));
    directories.push(directory);
    await writeFile(join(directory, 'index.html'), '<!doctype html><title>Acme</title>');
    await writeFile(
      join(directory, 'index.html.br'),
      brotliCompressSync('<!doctype html><title>Acme</title>'),
    );
    await writeFile(join(directory, 'app.js'), 'export const ready = true;');
    await writeFile(join(directory, 'app.js.br'), brotliCompressSync('export const ready = true;'));
    const app = await build({ staticDir: directory });
    const home = await app.inject('/');
    expect(home.statusCode).toBe(200);
    expect(home.headers['content-type']).toContain('text/html');
    expect(home.headers['cache-control']).toBe('no-cache');
    const compressedHome = await app.inject({ url: '/', headers: { 'accept-encoding': 'br' } });
    expect(compressedHome.statusCode).toBe(200);
    expect(compressedHome.headers['content-encoding']).toBe('br');
    expect(compressedHome.headers['cache-control']).toBe('no-cache');
    expect((await app.inject('/app.js')).headers['cache-control']).toBe('public, max-age=86400');
    const compressed = await app.inject({ url: '/app.js', headers: { 'accept-encoding': 'br' } });
    expect(compressed.headers['content-encoding']).toBe('br');
    expect((await app.inject('/.env')).statusCode).toBe(403);
    expect((await app.inject('/%2e%2e/package.json')).statusCode).toBe(404);
  });

  it('refuses a missing or invalid frontend build', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'acme-invalid-static-'));
    directories.push(directory);
    await expect(createApp({ staticDir: directory })).rejects.toThrow();
    await mkdir(join(directory, 'index.html'));
    await expect(createApp({ staticDir: directory })).rejects.toThrow('STATIC_DIR must contain');
  });

  it('does not charge asset or probe requests against the instance quote budget', async () => {
    const app = await build({ rateLimitMax: 1 });
    const request = { method: 'POST' as const, url: '/api/quotes', payload: { items: [] } };
    const first = await app.inject({ ...request, headers: { 'x-forwarded-for': '192.0.2.1' } });
    expect(first.statusCode).toBe(200);
    const second = await app.inject({ ...request, headers: { 'x-forwarded-for': '192.0.2.2' } });
    expect(second.statusCode).toBe(429);
    expect((await app.inject('/api/catalog')).statusCode).toBe(200);
    expect((await app.inject('/readyz')).statusCode).toBe(200);
  });
});
