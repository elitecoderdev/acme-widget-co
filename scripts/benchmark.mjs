import { performance } from 'node:perf_hooks';

const expectedTotalCents = 9827;
const payload = JSON.stringify({
  items: [
    { code: 'B01', quantity: 2 },
    { code: 'R01', quantity: 3 },
  ],
});

function readInteger(name, fallback, minimum, maximum) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be a whole number between ${minimum} and ${maximum}.`);
  }
  return value;
}

function readConfiguration() {
  let baseUrl;
  try {
    baseUrl = new URL(process.env.BENCHMARK_URL ?? 'http://127.0.0.1:4173');
  } catch {
    throw new Error('BENCHMARK_URL must be an absolute HTTP(S) base URL.');
  }

  if (
    !['http:', 'https:'].includes(baseUrl.protocol) ||
    baseUrl.username ||
    baseUrl.password ||
    baseUrl.search ||
    baseUrl.hash
  ) {
    throw new Error('BENCHMARK_URL must use HTTP(S) without credentials, a query, or a fragment.');
  }

  if (!baseUrl.pathname.endsWith('/')) baseUrl.pathname += '/';

  const requests = readInteger('BENCHMARK_REQUESTS', 400, 1, 900);
  const warmup = readInteger('BENCHMARK_WARMUP', 20, 0, 100);
  if (requests + warmup > 900) {
    throw new Error('BENCHMARK_REQUESTS plus BENCHMARK_WARMUP must not exceed 900.');
  }

  return {
    endpoint: new URL('api/quotes', baseUrl).href,
    concurrency: readInteger('BENCHMARK_CONCURRENCY', 16, 1, 64),
    requests,
    warmup,
    timeoutMs: readInteger('BENCHMARK_TIMEOUT_MS', 5000, 100, 30000),
  };
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function percentile(sortedValues, fraction) {
  if (sortedValues.length === 0) return null;
  return round(sortedValues[Math.ceil(sortedValues.length * fraction) - 1]);
}

async function requestQuote(configuration) {
  const started = performance.now();
  let response;
  try {
    response = await fetch(configuration.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: payload,
      redirect: 'error',
      signal: AbortSignal.timeout(configuration.timeoutMs),
    });
  } catch (error) {
    throw new Error(
      error instanceof Error && error.name === 'TimeoutError'
        ? 'Request timed out.'
        : 'Request failed before a response was received.',
    );
  }

  if (response.status !== 200) {
    await response.body?.cancel();
    throw new Error(`Expected HTTP 200; received HTTP ${response.status}.`);
  }

  let quote;
  try {
    quote = await response.json();
  } catch {
    throw new Error('The response body was not valid JSON.');
  }

  if (
    quote?.currency !== 'USD' ||
    quote?.totalCents !== expectedTotalCents ||
    quote?.itemCount !== 5
  ) {
    throw new Error(`The quote did not match 5 items, USD, and ${expectedTotalCents} cents.`);
  }

  return performance.now() - started;
}

async function runBatch(configuration, sampleCount) {
  const latencies = [];
  const errors = new Map();
  let nextRequest = 0;
  let errorCount = 0;
  const started = performance.now();

  async function worker() {
    while (nextRequest < sampleCount) {
      nextRequest += 1;
      try {
        latencies.push(await requestQuote(configuration));
      } catch (error) {
        errorCount += 1;
        const message = error instanceof Error ? error.message : 'Unknown request failure.';
        errors.set(message, (errors.get(message) ?? 0) + 1);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(configuration.concurrency, sampleCount) }, worker),
  );
  const elapsedMs = performance.now() - started;
  latencies.sort((left, right) => left - right);

  return {
    sampleCount,
    successfulSamples: latencies.length,
    errorCount,
    elapsedMs: round(elapsedMs),
    requestsPerSecond: sampleCount === 0 ? 0 : round(sampleCount / (elapsedMs / 1000)),
    latencyMs: {
      p50: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95),
      p99: percentile(latencies, 0.99),
    },
    errors: [...errors].map(([message, count]) => ({ message, count })),
  };
}

async function main() {
  const configuration = readConfiguration();
  const warmup = await runBatch(configuration, configuration.warmup);
  const measurement =
    warmup.errorCount === 0 ? await runBatch(configuration, configuration.requests) : null;
  const passed = warmup.errorCount === 0 && measurement?.errorCount === 0;

  process.stdout.write(
    `${JSON.stringify(
      {
        benchmark: 'basket-quote',
        recordedAt: new Date().toISOString(),
        runtime: process.version,
        configuration,
        expectedTotalCents,
        passed,
        warmup,
        measurement,
      },
      null,
      2,
    )}\n`,
  );

  if (!passed) process.exitCode = 1;
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Benchmark failed.'}\n`);
  process.exitCode = 1;
});
