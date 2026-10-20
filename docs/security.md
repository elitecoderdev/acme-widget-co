# Security model

Designed, implemented & documented by **elitecoderdev — Luis Jimenez**.

This application exposes a product catalog and computes anonymous quotes. It does not collect credentials, card details, customer records, or addresses. The public deployment option is an explicit product choice, not an authentication bypass for an order-management system.

## Trust boundaries

The browser is untrusted. The server selects product prices and applies offers and delivery rules from its own configuration. Invalid product codes, invalid quantities, and oversized baskets must fail validation. A quote is informational and cannot authorize payment or reserve stock.

The domain accepts validated inputs and works in integer cents. The HTTP layer owns content-type, shape, and size validation. Browser behavior and client-side validation improve usability; they are not security controls. Tests cover both accepted requests and rejected input.

The application and frontend share an origin in production. A deployment should not add wildcard CORS rules to solve local configuration problems. If authenticated actions are introduced later, define authentication, authorization, session handling, and CSRF protections together with those actions.

## Supply chain and build

Node and pnpm versions are pinned. The committed pnpm lockfile captures the dependency graph, and CI and Docker install it with `--frozen-lockfile`. pnpm is a reproducibility tool; using it alone does not make a dependency safe. Review dependency changes, installation scripts, advisories, and maintainer provenance.

The workflow fails on high or critical package advisories and runs without cloud credentials. External GitHub Actions use full commit hashes. Dependabot proposes dependency, action, container, and provider updates; updates still need review and tests.

Build output is isolated from runtime. A separate frozen installation selects the API's production dependency graph. The image contains the compiled application, that dependency tree, and the small domain workspace package needed to preserve valid dependency links. The domain is inlined into the server bundle and is not imported as TypeScript at runtime. Repository metadata, environment files, test reports, Terraform state, and credentials are excluded from the Docker context or source control. Cloud Run receives an immutable application digest, which makes the deployed artifact identifiable and rollback reproducible.

## Runtime and cloud identity

The container runs without root privileges. The Compose configuration also makes the filesystem read-only, removes Linux capabilities, prevents privilege escalation, limits processes, and exposes the application only on loopback. Cloud Run supplies its managed sandbox; Compose-specific flags are local deployment controls, not a claim that those flags configure Cloud Run.

The runtime identity has no Google Cloud project roles. Image publishing and infrastructure deployment use separate operator privileges. There are no service-account key files. If a future feature needs a cloud API, grant the narrow resource permission to the runtime identity and load any secrets through Secret Manager.

`public_access=false` is the Terraform default. Setting it to `true` grants `roles/run.invoker` to `allUsers` on this service. Private deployments need an authenticated caller or an approved access proxy. TLS is terminated by Cloud Run; the container listens on its internal HTTP port.

## Abuse and operational limits

The API bounds request work through a maximum basket size. Only `POST /api/quotes` is rate limited, using the fixed key `instance` with an aggregate allowance of 1,000 requests per minute per instance. Catalog, asset, and health requests do not consume that allowance. The application does not trust proxy headers to identify clients, so a caller cannot select a new quota bucket by spoofing `X-Forwarded-For`.

This control protects aggregate work on one process; it is not a per-user quota or a global limit. Autoscaling increases the aggregate allowance as new instances start. Client-aware edge enforcement requires Cloud Armor with an external HTTP load balancer, which the base Terraform module does not configure. Autoscaling is capped to control resource use, but an instance cap is not a hard spending limit. Set billing alerts and observe request rates.

Do not log request bodies, tokens, or future customer details. Keep production diagnostics limited to the information needed to correlate failures and operate the service. Access to cloud logs and Terraform state belongs to operators, not the anonymous application identity.

## Reporting a vulnerability

Use the repository's private vulnerability reporting channel when enabled, addressed to `elitecoderdev`. Avoid including secrets or customer information in a public issue. A report should contain the affected revision, reproduction steps, expected boundary, and observed result. Rotate exposed credentials immediately; fixing the code does not revoke a leaked secret.
