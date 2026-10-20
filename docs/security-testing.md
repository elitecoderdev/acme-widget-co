# Security testing

Designed, implemented & documented by **elitecoderdev — Luis Jimenez**.

The application includes repeatable blackbox security smoke checks for its HTTP boundary. These checks exercise the running production build with a small collection of hostile inputs and verify safe responses. They are scoped defensive tests, not a certified penetration assessment or a claim that the application has no vulnerabilities.

## Run the checks

Start the built application with its frontend available, then run:

```sh
node scripts/security-smoke.mjs
```

The default origin is `http://127.0.0.1:4173`. To test another local port:

```sh
SECURITY_ORIGIN=http://127.0.0.1:8080 node scripts/security-smoke.mjs
```

In PowerShell:

```powershell
$env:SECURITY_ORIGIN = 'http://127.0.0.1:8080'
node scripts/security-smoke.mjs
```

Setting `SECURITY_ORIGIN` explicitly also permits an HTTP(S) service you operate and are authorized to test. The value must be an origin, without credentials, a path, query parameters, or a fragment. Redirects are refused so that the test does not follow the target to another location. No external cloud deployment is included in the local verification results.

The full suite makes 44 requests, sequentially, with a hard limit of 60, a five-second timeout per request, and a 64 KiB response-body limit. It stops immediately if the initial health check fails. It does not write files through the application, change server configuration, delete data, create accounts, or run an exhaustive scanner. Its oversized-body probe is approximately 17 KiB. SQL-like, HTML, command-like, and executable-code strings are sent as inert request data to verify rejection; they are never evaluated by the test runner.

## Verified boundaries

| Area                | Checks                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Price integrity     | Client-supplied unit prices, totals, and discounts are rejected; the known mixed basket remains exactly USD 98.27 with the expected quantities, unit prices, and discounts on each product line.                                                                                                                                                                                                  |
| Product validation  | Unknown SKUs return 422; SQL-like, HTML, and command-like product codes return 400.                                                                                                                                                                                                                                                                                                               |
| Quantity validation | Negative, zero, fractional, string, unsafe integer, null, boolean, and oversized quantities return 400. Aggregate totals above 100 return 422, including repeated product lines.                                                                                                                                                                                                                  |
| JSON safety         | Malformed JSON and raw `__proto__` or `constructor.prototype` payloads are rejected, including nested payloads.                                                                                                                                                                                                                                                                                   |
| Request bounds      | A body exceeding 16 KiB returns 413; more than 100 product lines return 400; XML returns 415; an unsupported quote method returns 404.                                                                                                                                                                                                                                                            |
| File exposure       | Dotfile, Git metadata, source-file, package metadata, and encoded traversal probes return 403 or 404 with safe JSON errors. Encoded separators preserve the traversal payload through URL parsing.                                                                                                                                                                                                |
| Browser isolation   | CSP restricts script and style sources, forbids unsafe inline code and evaluation, and denies framing and embedded objects. Duplicate CSP directives are rejected by the check. MIME-sniffing, referrer, opener, embedder, and legacy frame protections are checked on the storefront, a successful quote, and all tested error responses. The storefront must return its HTML application shell. |
| Cross-origin access | An unexpected origin receives no CORS or credential permission on either an actual request or an OPTIONS preflight.                                                                                                                                                                                                                                                                               |
| Error disclosure    | Rejected requests must use the JSON content type and the exact public error codes, messages, and statuses, without extra fields. Additional checks reject stack traces and common filesystem or dependency locations.                                                                                                                                                                             |
| Recovery            | Health, readiness, and the authoritative quote still work after the hostile-input checks. Quotes use `Cache-Control: no-store`.                                                                                                                                                                                                                                                                   |

The test prints one JSON report containing a pass/fail result for every executed check, request count, timing, runtime version, and target origin. Any failed check produces a nonzero exit status. Response bodies and submitted payloads are not included in failure output, which limits accidental exposure if a file-access check detects an unexpected response. Save the report with the tested commit and deployment configuration; a passing result applies to that build and target. File-access probes establish the observed responses for their listed paths; they do not prove that every possible server path is inaccessible.

## Complementary verification

The blackbox suite complements the unit and integration tests. Rate-limit tests use an injected small limit to prove that the instance bucket cannot be selected or bypassed through forged forwarding headers, while keeping health and catalog routes available. The smoke script deliberately does not send 1,000 requests to exhaust the normal production limit.

Browser end-to-end tests verify the actual storefront, user actions, pricing updates, keyboard interaction, and accessibility assertions. The performance smoke benchmark separately measures a fixed valid workload and verifies every quote. Neither suite substitutes for HTTP security checks.

Dependency auditing, frozen lockfile installation, container hardening, and least-privilege deployment configuration address different risks. Run the repository's dependency and image checks alongside these application checks. A clean dependency audit reports known findings in the available advisory data; it is not proof that dependencies are vulnerability-free.

Cloud IAM, Cloud Armor rules, load-balancer forwarding behavior, public DNS/TLS configuration, remote infrastructure exposure, distributed abuse resistance, and production traffic were not assessed by these local checks. Those controls require verification against the specific deployed environment and its authorization scope.
