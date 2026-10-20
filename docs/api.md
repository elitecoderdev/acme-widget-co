# API and Postman

Designed, implemented & documented by **elitecoderdev — Luis Jimenez**.

The production API and storefront share one origin. The default local origin is `http://localhost:8080`. Vite's port 5173 proxies `/api`, `/healthz`, and `/readyz` during development. There is no API key because the service calculates anonymous, nonbinding quotes and has no private resources or purchase operations.

## Import and run the Postman collection

1. Start the application with `docker compose up --build --detach --wait`, or `pnpm build` followed by `pnpm start`.
2. Open Postman and choose **Import**.
3. Select `docs/postman/Acme-Widget-Co.postman_collection.json`.
4. Import `docs/postman/Acme-Widget-Co-Local.postman_environment.json` in the same way.
5. Select **Acme Widget Co - Local** as the active environment.
6. Confirm that `baseUrl` points to your running server. Do not append `/api`; requests already include their paths.
7. Open **Readiness** and click **Send**. Expect status 200 and `{"status":"ready"}`.
8. Open the collection runner, select all requests, and run one iteration. Every request has assertions for the expected status and, where applicable, the calculated total.

The collection uses no credentials or sensitive environment values. For a private Cloud Run deployment, use the organization's approved authenticated proxy; never save a short-lived access token in a committed environment file.

## Catalog

`GET /api/catalog` returns `products`, `deliveryRules`, `offer`, and `examples`. Product prices and sample totals are integer cents. The offer includes display metadata and its product code. The examples are calculated using the same pricing service as normal quotes, so the frontend does not maintain a second price table. The response is public and cacheable for five minutes.

## Quote request

`POST /api/quotes` requires `Content-Type: application/json`:

```json
{
  "items": [{ "code": "R01", "quantity": 2 }]
}
```

`items` can be empty and can contain duplicate product lines. Codes must match the catalog. Quantity must be an integer from 1 to 100; the total quantity across all lines cannot exceed 100. The request cannot contain prices, discounts, totals, or any other additional properties. String quantities are rejected instead of silently coerced. The body limit is 16 KiB.

The two-red-widget response is:

```json
{
  "currency": "USD",
  "items": [
    {
      "code": "R01",
      "name": "Red Widget",
      "quantity": 2,
      "unitPriceCents": 3295,
      "subtotalCents": 6590,
      "discountCents": 1648,
      "totalCents": 4942
    }
  ],
  "itemCount": 2,
  "subtotalCents": 6590,
  "discountCents": 1648,
  "merchandiseCents": 4942,
  "deliveryCents": 495,
  "totalCents": 5437,
  "freeDeliveryRemainingCents": 4058
}
```

`subtotalCents` is the original merchandise price. `discountCents` is the applied savings. `merchandiseCents` is the price after offers; delivery thresholds use this value. `totalCents` adds delivery. `freeDeliveryRemainingCents` reports additional discounted merchandise needed to reach free delivery, not the price of a suggested product. Quote responses use `Cache-Control: no-store`.

PowerShell example:

```powershell
$Body = @{ items = @(@{ code = 'R01'; quantity = 2 }) } | ConvertTo-Json -Depth 4
Invoke-RestMethod -Method Post -Uri 'http://localhost:8080/api/quotes' -ContentType 'application/json' -Body $Body
```

## Errors

```json
{ "error": { "code": "UNKNOWN_PRODUCT", "message": "The requested product does not exist." } }
```

| Status | Meaning                                                      | User action                                    |
| ------ | ------------------------------------------------------------ | ---------------------------------------------- |
| 400    | Invalid JSON, unexpected properties, code shape, or quantity | Correct the request; do not send client prices |
| 403    | Protected static resource                                    | Use a documented public path                   |
| 404    | Resource does not exist                                      | Check the method and path                      |
| 413    | Request body exceeds 16 KiB                                  | Reduce request size                            |
| 415    | Unsupported content type                                     | Send application/json                          |
| 422    | Unknown product or more than 100 total units                 | Use catalog codes and a smaller basket         |
| 429    | Instance quote budget exhausted                              | Wait for Retry-After before retrying           |
| 500    | Unexpected internal failure                                  | Retry later; use operator logs for diagnosis   |

The rate budget is aggregate per instance, not per browser or customer. Forged forwarded-address headers cannot create a new bucket. Error responses do not contain stack traces or request content.

## Health

`GET /healthz` returns `{"status":"ok"}` and `GET /readyz` returns `{"status":"ready"}`. Configured static assets must contain an `index.html` file before the server starts. The service has no external dependencies to probe. Health and catalog requests do not consume the quote rate budget.
