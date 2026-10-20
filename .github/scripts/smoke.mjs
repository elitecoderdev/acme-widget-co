import assert from 'node:assert/strict';

const origin = process.env.SMOKE_ORIGIN ?? 'http://127.0.0.1:8080';
const request = (path, options) =>
  fetch(new URL(path, origin), { ...options, signal: AbortSignal.timeout(5_000) });
const quote = (items) =>
  request('/api/quotes', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ items }),
  });

for (const path of ['/healthz', '/readyz']) {
  const response = await request(path);
  assert.equal(response.status, 200, `${path} must be healthy`);
}

const page = await request('/');
assert.equal(page.status, 200);
assert.match(await page.text(), /<!doctype html>/i);
assert.match(page.headers.get('content-security-policy') ?? '', /default-src 'self'/);

const catalog = await request('/api/catalog');
assert.equal(catalog.status, 200);
assert.equal((await catalog.json()).products.length, 3);

const examples = [
  {
    items: [
      { code: 'B01', quantity: 1 },
      { code: 'G01', quantity: 1 },
    ],
    total: 3785,
  },
  { items: [{ code: 'R01', quantity: 2 }], total: 5437 },
  {
    items: [
      { code: 'R01', quantity: 1 },
      { code: 'G01', quantity: 1 },
    ],
    total: 6085,
  },
  {
    items: [
      { code: 'B01', quantity: 2 },
      { code: 'R01', quantity: 3 },
    ],
    total: 9827,
  },
  { items: [], total: 0 },
];

for (const example of examples) {
  const response = await quote(example.items);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await response.json()).totalCents, example.total);
}

assert.equal((await quote([{ code: 'X99', quantity: 1 }])).status, 422);
assert.equal((await quote([{ code: 'R01', quantity: -1 }])).status, 400);
assert.equal((await quote([{ code: 'R01', quantity: 1 }])).status, 200);
console.log('Production smoke checks passed.');
