import { performance } from 'node:perf_hooks';

const maximumRequests = 60;
const timeoutMs = 5000;
const maximumResponseBytes = 65536;
const unexpectedOrigin = 'https://security-smoke.invalid';
const validItems = [
  { code: 'B01', quantity: 2 },
  { code: 'R01', quantity: 3 },
];
const validBody = JSON.stringify({ items: validItems });
const publicErrors = new Map([
  [
    'INVALID_REQUEST',
    [400, 'Provide valid product codes and whole-number quantities from 1 to 100.'],
  ],
  ['UNKNOWN_PRODUCT', [422, 'The requested product does not exist.']],
  ['BASKET_LIMIT_EXCEEDED', [422, 'A basket may contain at most 100 items.']],
  ['FORBIDDEN', [403, 'This resource is not accessible.']],
  ['NOT_FOUND', [404, 'This resource does not exist.']],
  ['PAYLOAD_TOO_LARGE', [413, 'The request exceeds the allowed size.']],
  ['UNSUPPORTED_MEDIA_TYPE', [415, 'Use application/json for basket requests.']],
]);

function readOrigin() {
  let url;
  try {
    url = new URL(process.env.SECURITY_ORIGIN ?? 'http://127.0.0.1:4173');
  } catch {
    throw new Error('SECURITY_ORIGIN must be an absolute HTTP(S) origin.');
  }

  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      'SECURITY_ORIGIN must be an HTTP(S) origin without credentials, a path, query, or fragment.',
    );
  }

  return url.origin;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function expectStatus(response, accepted) {
  const statuses = Array.isArray(accepted) ? accepted : [accepted];
  assert(
    statuses.includes(response.status),
    `Expected HTTP ${statuses.join(' or ')}; received HTTP ${response.status}.`,
  );
}

function parseJson(response) {
  assert(
    /^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? ''),
    'Expected the application/json content type.',
  );
  try {
    return JSON.parse(response.text);
  } catch {
    throw new Error('Expected a JSON response.');
  }
}

function expectSafeError(response) {
  const body = parseJson(response);
  assert(
    body !== null && typeof body === 'object' && !Array.isArray(body),
    'Expected an error object.',
  );
  assert(
    Object.keys(body).length === 1 && Object.hasOwn(body, 'error'),
    'Unexpected fields in the error envelope.',
  );
  const error = body.error;
  assert(
    error !== null && typeof error === 'object' && !Array.isArray(error),
    'Expected safe error details.',
  );
  assert(
    Object.keys(error).length === 2 &&
      Object.hasOwn(error, 'code') &&
      Object.hasOwn(error, 'message'),
    'Unexpected fields in error details.',
  );
  assert(
    typeof error.code === 'string' && /^[A-Z][A-Z0-9_]+$/.test(error.code),
    'Expected a machine-readable error code.',
  );
  assert(
    typeof error.message === 'string' && error.message.length <= 256,
    'Expected a bounded error message.',
  );
  const expected = publicErrors.get(error.code);
  assert(
    expected?.[0] === response.status && expected?.[1] === error.message,
    'The response does not match the public error contract.',
  );
  assert(
    !/(?:stacktrace|"stack"|node_modules|[A-Za-z]:[\\/]|\/(?:home|Users|app|usr|var)\/|\bat\s+[\w$.]+\s*\()/i.test(
      response.text,
    ),
    'The error response appears to expose implementation details.',
  );
  expectSecurityHeaders(response);
}

function expectQuote(response) {
  expectStatus(response, 200);
  const quote = parseJson(response);
  assert(
    quote?.currency === 'USD' && quote?.itemCount === 5 && quote?.totalCents === 9827,
    'The authoritative quote changed unexpectedly.',
  );
  assert(
    quote.subtotalCents === 11475 &&
      quote.discountCents === 1648 &&
      quote.merchandiseCents === 9827 &&
      quote.deliveryCents === 0,
    'The authoritative pricing breakdown changed unexpectedly.',
  );
  assert(
    Array.isArray(quote.items) && quote.items.length === 2,
    'The quote must contain exactly two product lines.',
  );
  for (const expected of [
    {
      code: 'B01',
      quantity: 2,
      unitPriceCents: 795,
      subtotalCents: 1590,
      discountCents: 0,
      totalCents: 1590,
    },
    {
      code: 'R01',
      quantity: 3,
      unitPriceCents: 3295,
      subtotalCents: 9885,
      discountCents: 1648,
      totalCents: 8237,
    },
  ]) {
    const matches = quote.items.filter((item) => item?.code === expected.code);
    assert(
      matches.length === 1 &&
        Object.entries(expected).every(([key, value]) => matches[0][key] === value),
      'The authoritative product-line pricing changed unexpectedly.',
    );
  }
  assert(
    response.headers.get('cache-control') === 'no-store',
    'Quote responses must use Cache-Control: no-store.',
  );
}

function expectSecurityHeaders(response) {
  const policy = response.headers.get('content-security-policy');
  assert(typeof policy === 'string' && policy.length > 0, 'Content-Security-Policy is missing.');
  const directives = new Map();
  for (const entry of policy.split(';').filter((value) => value.trim())) {
    const [rawName, ...values] = entry.trim().split(/\s+/);
    const name = rawName.toLowerCase();
    assert(!directives.has(name), 'CSP contains duplicate directives.');
    directives.set(name, values);
  }
  for (const name of ['default-src', 'script-src', 'style-src', 'connect-src', 'base-uri']) {
    assert(directives.get(name)?.join(' ') === "'self'", `Expected ${name} to allow only self.`);
  }
  assert(directives.get('object-src')?.join(' ') === "'none'", 'Embedded objects must be denied.');
  assert(directives.get('frame-ancestors')?.join(' ') === "'none'", 'Framing must be denied.');
  assert(
    !policy.toLowerCase().includes("'unsafe-inline'") &&
      !policy.toLowerCase().includes("'unsafe-eval'"),
    'CSP must not allow unsafe inline code or evaluation.',
  );
  assert(
    response.headers.get('x-content-type-options') === 'nosniff',
    'MIME sniffing protection is missing.',
  );
  assert(
    ['DENY', 'SAMEORIGIN'].includes(response.headers.get('x-frame-options')),
    'Legacy framing protection is missing.',
  );
  assert(
    response.headers.get('referrer-policy') === 'no-referrer',
    'Expected a restrictive referrer policy.',
  );
  assert(
    response.headers.get('cross-origin-opener-policy') === 'same-origin',
    'Cross-origin opener protection is missing.',
  );
  assert(
    response.headers.get('cross-origin-embedder-policy') === 'require-corp',
    'Cross-origin embedder protection is missing.',
  );
  assert(!response.headers.has('x-powered-by'), 'The server advertises its implementation.');
}

async function readBoundedBody(response) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximumResponseBytes) {
        await reader.cancel();
        throw new Error('The response exceeded the security smoke response-size limit.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  const origin = readOrigin();
  const results = [];
  let requestCount = 0;
  const started = performance.now();

  async function request(path, options = {}) {
    requestCount += 1;
    assert(requestCount <= maximumRequests, 'The security smoke request budget was exceeded.');
    const response = await fetch(`${origin}${path}`, {
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
      ...options,
    });
    return {
      status: response.status,
      headers: response.headers,
      text: await readBoundedBody(response),
    };
  }

  async function check(name, action) {
    const checkStarted = performance.now();
    try {
      await action();
      results.push({
        name,
        passed: true,
        elapsedMs: Math.round((performance.now() - checkStarted) * 100) / 100,
      });
    } catch (error) {
      const failure =
        error instanceof Error && error.name === 'TimeoutError'
          ? 'Request timed out.'
          : error instanceof Error
            ? error.message
            : 'Unknown check failure.';
      results.push({
        name,
        passed: false,
        elapsedMs: Math.round((performance.now() - checkStarted) * 100) / 100,
        failure,
      });
    }
    return results[results.length - 1].passed;
  }

  async function rejectedQuote(name, body, status = 400, contentType = 'application/json') {
    await check(name, async () => {
      const response = await request('/api/quotes', {
        method: 'POST',
        headers: { 'content-type': contentType },
        body: typeof body === 'string' ? body : JSON.stringify(body),
      });
      expectStatus(response, status);
      expectSafeError(response);
    });
  }

  const reachable = await check('Service is healthy before testing', async () => {
    const response = await request('/healthz');
    expectStatus(response, 200);
    assert(parseJson(response)?.status === 'ok', 'The health response is invalid.');
  });

  if (reachable) {
    await check('Known basket uses authoritative prices and no-store', async () => {
      const response = await request('/api/quotes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: validBody,
      });
      expectQuote(response);
      expectSecurityHeaders(response);
    });

    await check('Storefront has restrictive security headers', async () => {
      const response = await request('/');
      expectStatus(response, 200);
      assert(
        /^text\/html(?:\s*;|$)/i.test(response.headers.get('content-type') ?? ''),
        'The storefront must be served as HTML.',
      );
      assert(
        /<!doctype\s+html>/i.test(response.text) &&
          /<div\s+id=["']root["']\s*>/i.test(response.text),
        'The storefront response is missing its HTML application shell.',
      );
      expectSecurityHeaders(response);
    });

    await rejectedQuote('Rejects an injected unit price', {
      items: [{ code: 'R01', quantity: 2, unitPriceCents: 1 }],
    });
    await rejectedQuote('Rejects a client-supplied total', { items: validItems, totalCents: 1 });
    await rejectedQuote('Rejects a client-supplied discount', {
      items: validItems,
      discountCents: 11475,
    });
    await rejectedQuote('Rejects an injected line discount', {
      items: [{ code: 'R01', quantity: 2, discountCents: 6590 }],
    });
    await rejectedQuote(
      'Rejects an unknown product code',
      { items: [{ code: 'X99', quantity: 1 }] },
      422,
    );

    for (const [name, quantity] of [
      ['negative', -1],
      ['zero', 0],
      ['fractional', 1.5],
      ['string', '2'],
      ['unsafe integer', Number.MAX_SAFE_INTEGER + 1],
      ['null', null],
      ['boolean', true],
      ['oversized', 101],
    ]) {
      await rejectedQuote(`Rejects a ${name} quantity`, { items: [{ code: 'R01', quantity }] });
    }

    await rejectedQuote(
      'Rejects an aggregate quantity above 100',
      {
        items: [
          { code: 'R01', quantity: 100 },
          { code: 'B01', quantity: 1 },
        ],
      },
      422,
    );
    await rejectedQuote(
      'Rejects duplicate lines exceeding the basket limit',
      {
        items: [
          { code: 'R01', quantity: 60 },
          { code: 'R01', quantity: 41 },
        ],
      },
      422,
    );
    await rejectedQuote('Rejects a request with more than 100 product lines', {
      items: Array.from({ length: 101 }, () => ({ code: 'B01', quantity: 1 })),
    });
    await rejectedQuote('Rejects malformed JSON', '{"items":[');
    await rejectedQuote(
      'Rejects top-level prototype poisoning',
      '{"__proto__":{"securitySmokePolluted":true},"items":[]}',
    );
    await rejectedQuote(
      'Rejects constructor prototype poisoning',
      '{"constructor":{"prototype":{"securitySmokePolluted":true}},"items":[]}',
    );
    await rejectedQuote(
      'Rejects nested prototype poisoning',
      '{"items":[{"code":"R01","quantity":1,"__proto__":{"securitySmokePolluted":true}}]}',
    );
    await rejectedQuote(
      'Rejects nested constructor prototype poisoning',
      '{"items":[{"code":"R01","quantity":1,"constructor":{"prototype":{"securitySmokePolluted":true}}}]}',
    );
    await rejectedQuote('Rejects SQL-like product code injection', {
      items: [{ code: "R01'; DROP TABLE products;--", quantity: 1 }],
    });
    await rejectedQuote('Rejects HTML and script in a product code', {
      items: [{ code: '<svg onload=alert("security-smoke")>', quantity: 1 }],
    });
    await rejectedQuote('Rejects command-like product code injection', {
      items: [{ code: 'R01; echo security-smoke', quantity: 1 }],
    });
    await rejectedQuote('Rejects executable-code fields', {
      items: validItems,
      execute: 'process.exit(1)',
    });
    await rejectedQuote(
      'Rejects a request body larger than 16 KiB',
      JSON.stringify({ items: [], padding: 'x'.repeat(17 * 1024) }),
      413,
    );
    await rejectedQuote(
      'Rejects an XML request body',
      '<items><item code="R01" quantity="1" /></items>',
      415,
      'application/xml',
    );

    await check('Unsupported HTTP method cannot mutate a quote', async () => {
      const response = await request('/api/quotes', { method: 'DELETE' });
      expectStatus(response, 404);
      expectSafeError(response);
    });

    for (const [name, path] of [
      ['environment file', '/.env'],
      ['Git metadata', '/.git/config'],
      ['package manager configuration', '/.npmrc'],
      ['package metadata', '/package.json'],
      ['source file', '/src/main.tsx'],
      ['encoded slash traversal', '/..%2f..%2fpackage.json'],
      ['encoded backslash traversal', '/..%5c..%5cpackage.json'],
      ['nested encoded traversal', '/assets/%2e%2e%2f%2e%2e%2fpackage.json'],
    ]) {
      await check(`Denies ${name} access without source leakage`, async () => {
        const response = await request(path);
        expectStatus(response, [403, 404]);
        expectSafeError(response);
      });
    }

    await check('Unexpected origin receives no CORS permission', async () => {
      const response = await request('/api/quotes', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: unexpectedOrigin },
        body: validBody,
      });
      expectQuote(response);
      assert(
        !response.headers.has('access-control-allow-origin'),
        'The unexpected origin received CORS permission.',
      );
      assert(
        !response.headers.has('access-control-allow-credentials'),
        'The unexpected origin received credential permission.',
      );
    });

    await check('Unexpected-origin preflight receives no CORS permission', async () => {
      const response = await request('/api/quotes', {
        method: 'OPTIONS',
        headers: {
          origin: unexpectedOrigin,
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'content-type',
        },
      });
      expectStatus(response, 404);
      expectSafeError(response);
      assert(
        !response.headers.has('access-control-allow-origin'),
        'The preflight response granted CORS permission.',
      );
      assert(
        !response.headers.has('access-control-allow-credentials'),
        'The preflight response granted credential permission.',
      );
    });

    await check('Service remains healthy after hostile inputs', async () => {
      const response = await request('/healthz');
      expectStatus(response, 200);
      assert(parseJson(response)?.status === 'ok', 'The service did not remain healthy.');
    });

    await check('Readiness remains available after hostile inputs', async () => {
      const response = await request('/readyz');
      expectStatus(response, 200);
      assert(parseJson(response)?.status === 'ready', 'The service did not remain ready.');
    });

    await check('Pricing remains correct after hostile inputs', async () => {
      const response = await request('/api/quotes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: validBody,
      });
      expectQuote(response);
    });
  }

  const failures = results.filter((result) => !result.passed).length;
  process.stdout.write(
    `${JSON.stringify(
      {
        assessment: 'scoped-application-security-smoke',
        recordedAt: new Date().toISOString(),
        origin,
        runtime: process.version,
        passed: failures === 0,
        requestCount,
        maximumRequests,
        checkCount: results.length,
        failureCount: failures,
        elapsedMs: Math.round((performance.now() - started) * 100) / 100,
        checks: results,
      },
      null,
      2,
    )}\n`,
  );

  if (failures > 0) process.exitCode = 1;
}

void main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'Security smoke testing failed.'}\n`,
  );
  process.exitCode = 1;
});
