# Performance and responsive verification

Designed, implemented & documented by **elitecoderdev — Luis Jimenez**.

Performance evidence must identify its environment. These measurements are local observations, not cloud capacity guarantees or service-level objectives.

## API benchmark

On October 20, 2026, the compiled Node.js 24.21.0 service was measured on the development Windows machine over loopback. The script used 20 warmup requests and 400 measured requests at concurrency 16. Each response had to return HTTP 200, USD, five items, and exactly 9,827 cents.

| Measurement                  |                    Result |
| ---------------------------- | ------------------------: |
| Successful measured requests |                 400 / 400 |
| Errors                       |                         0 |
| Median latency               |                  14.59 ms |
| p95 latency                  |                  22.00 ms |
| p99 latency                  |                  25.37 ms |
| Measured burst throughput    | 1,047.05 responses/second |

This subsecond burst does not represent sustained throughput. The aggregate instance policy accepts at most 1,000 quotes per minute, regardless of how quickly the process can calculate them. Distributed throughput also depends on concurrency, instance count, network latency, cold starts, quotas, and edge protections. Repeat on representative infrastructure before choosing a production SLO.

Run against a quiet local instance:

```powershell
$env:BENCHMARK_URL = 'http://localhost:8080'
pnpm benchmark
```

Optional environment settings are `BENCHMARK_REQUESTS`, `BENCHMARK_CONCURRENCY`, `BENCHMARK_WARMUP`, and `BENCHMARK_TIMEOUT_MS`; the script validates bounded values. Run only against a service you operate. The combined request cap is 900 to leave headroom under the default rate budget. Repeated immediate runs may receive 429 responses; the script reports those failures instead of hiding them.

## Browser budgets

The application uses system fonts, local SVG product illustrations, and no external browser dependencies. Vite produces one JavaScript entry and one CSS asset. Brotli and gzip variants are generated once at build time; Fastify negotiates them without per-request compression work. HTTP caching handles repeat visits. Quote responses remain uncached.

Browser checks exercise desktop, tablet, modern-phone, and 320px layouts. They verify correct totals, error recovery, keyboard operation, automated WCAG A/AA checks, and the absence of horizontal overflow. The production JavaScript transfer budget is 90 KiB compressed and 300 KiB decoded; the stylesheet budget is 12 KiB compressed. These budgets protect against accidental bundle growth rather than claim a universal load time.

## User-perceived behavior

- The basket link appears on small screens after the first item, avoiding a search below the product list.
- Mobile quantity, remove, and navigation controls have comfortable touch targets.
- Older requests are cancelled and ignored so their responses cannot replace newer selections.
- Requests have a ten-second deadline and retry controls preserve the basket.
- Summary states reserve space to reduce movement while recalculating.
- The currency formatter is reused, and only the API calculates business prices.
- Reduced-motion preferences suppress decorative transitions.

There is no hydration framework, third-party font download, analytics tag, product-image request, database query, or remote pricing call on the critical path. Before adding a new optimization, measure whether it improves the relevant user journey.
