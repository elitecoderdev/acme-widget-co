# Operations

Designed, implemented & documented by **elitecoderdev — Luis Jimenez**.

## Health and diagnosis

| Signal                           | Purpose                               | First action                                            |
| -------------------------------- | ------------------------------------- | ------------------------------------------------------- |
| `/readyz` fails                  | Instance is not ready to serve        | Check startup logs, port, and frontend asset path       |
| `/healthz` fails                 | Process is unhealthy                  | Inspect errors and restart behavior                     |
| Quote requests fail validation   | Caller submitted unsupported input    | Inspect status codes and reproduce using a valid basket |
| Elevated 5xx responses           | Application or platform failure       | Correlate the first failure with the active revision    |
| Rising latency or instance count | Demand, CPU pressure, or a regression | Compare request volume, CPU, memory, and p95 latency    |

For local production logs and status:

```sh
docker compose ps
docker compose logs --tail=100 app
```

For Cloud Run logs, substitute the chosen project and region:

```sh
gcloud run services logs read acme-widget-co --project=your-project-id --region=us-central1 --limit=100
gcloud run revisions list --service=acme-widget-co --project=your-project-id --region=us-central1
```

Cloud Run collects standard output and error streams. Monitor request volume, 4xx/5xx ratio, p50/p95/p99 latency, instance count, CPU, memory, and startup failures. Establish an SLO from measured behavior and business needs. The repository does not claim a load-tested production throughput or a measured availability target.

## Smoke check

After startup or release, check the home page, the catalog, and all four challenge examples. Confirm that two red widgets cost $54.37 and that an empty basket has zero delivery. Check that a malformed request fails cleanly and that the application can serve a second valid request afterward.

Use `pnpm check` and `pnpm test:e2e` before publishing an image. Run the container checks as well: a development server passing tests does not prove the final image contains all runtime dependencies and frontend assets.

## Rollback

Retain each successful image digest with its commit and deployment record. Reapply the Terraform configuration with `image` set to the previous successful digest, while preserving the other environment variables. The service creates a revision using that known artifact. Recheck health and the challenge baskets.

For an immediate incident response, an operator can route traffic to an existing healthy revision:

```sh
gcloud run services update-traffic acme-widget-co --project=your-project-id --region=us-central1 --to-revisions=PREVIOUS_REVISION=100
```

That command changes state outside Terraform. Follow it by reconciling the desired image and traffic configuration through Terraform before the next regular deployment, or a future apply can restore the undesired revision.

## Capacity changes

The default cloud limits are one CPU, 512 MiB, 80 concurrent requests per instance, zero minimum instances, and 20 maximum instances. Increase minimum instances to reduce cold-start impact if measurements justify the steady-state cost. Tune concurrency and maximum instances using a representative load test rather than assuming linear scaling.

The pricing service has no database connection pool or durable state to coordinate. All replicas must run the same pricing version during a release if callers require exact consistency; rolling revisions can temporarily expose both old and new policies. For a real checkout, carry an accepted pricing version into durable order creation.

Each process accepts at most 1,000 quote requests per minute through the aggregate `instance` rate-limit bucket. A 429 response can therefore affect unrelated visitors on the same instance. It does not indicate a per-user limit, and forwarded IP headers cannot change the bucket. Monitor 429 responses before increasing traffic. Add Cloud Armor with an external HTTP load balancer when client-aware edge quotas are required; those resources are not part of the supplied Terraform module.

## Maintenance and cleanup

Review dependency updates and package advisories regularly. Rebuild images to pick up base-image security updates and record their new digests. Preserve the image used by the current release and the rollback candidate before deleting older artifacts.

Terraform deliberately leaves enabled APIs active on destroy. Cloud Run deletion protection must be explicitly disabled and applied before service removal. Destroying infrastructure removes application availability and may remove stored images. Review the plan and the environment before running a destroy operation.

No application backup is needed for computed quotes. Terraform state and the deployment records do need protected storage and recovery procedures. A future feature that stores orders changes that requirement.
