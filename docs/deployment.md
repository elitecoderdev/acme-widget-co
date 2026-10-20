# Local and Google Cloud deployment

Designed, implemented & documented by **elitecoderdev — Luis Jimenez**.

The same production container serves the API and built frontend. Local development uses Node.js 24.21.0 and pnpm 11.25.0. Docker Compose is the simplest production-like local run; GCP deployment is optional and incurs charges in your own project.

## Local production run

Install Docker Engine with Compose v2, or Docker Desktop with Linux containers, then run from the repository root:

```sh
docker compose up --build --detach --wait
docker compose logs --follow app
```

Open [http://localhost:8080](http://localhost:8080). The published port binds to the loopback interface. Stop the application with `docker compose down`.

The image uses a multistage build, a frozen pnpm lockfile, a reusable dependency cache, production API dependencies, and compiled frontend assets. The final process runs as the unprivileged `node` user. Compose adds a read-only root filesystem, a small temporary filesystem, dropped Linux capabilities, a PID limit, resource limits, and `no-new-privileges`.

The production dependency stage performs a separate filtered installation with `--prod --offline --frozen-lockfile`, using the dependency cache populated and verified by the fetch stage. It preserves the workspace layout for pnpm's relative links: the shared store remains under `/app/node_modules`, and API dependencies remain under `/app/apps/api/node_modules`. The build does not resolve a new runtime dependency graph.

Vite builds both the frontend and the Node.js server. Domain code is inlined into the server bundle; Fastify and its plugins remain external production dependencies. The small domain package is also copied to its workspace path so its installed link stays valid. The server executes compiled JavaScript and does not import domain TypeScript at runtime. Frontend/API source, development dependencies, tests, and repository metadata are not copied into the final application directory.

## Runtime contract

| Variable     | Default                           | Meaning                                        |
| ------------ | --------------------------------- | ---------------------------------------------- |
| `NODE_ENV`   | Set to `production` by the image  | Production runtime behavior                    |
| `HOST`       | `0.0.0.0`                         | Listen interface                               |
| `PORT`       | `8080`                            | HTTP port; Cloud Run supplies it automatically |
| `STATIC_DIR` | `/app/apps/web/dist` in the image | Compiled storefront directory                  |

`GET /readyz` is the startup/readiness check. `GET /healthz` is the liveness check. When `STATIC_DIR` is configured, startup requires its `index.html` to exist, so a missing frontend build prevents the server from accepting traffic. No credentials, database, or external service are required to calculate a quote. Cloud Run terminates HTTPS and forwards requests to the container's HTTP port.

The quote endpoint has an aggregate limit of 1,000 requests per minute per instance. It does not identify individual clients or trust forwarded IP headers. Client-aware or global protection requires an additional access layer, such as Cloud Armor with an external HTTP load balancer; the base Terraform module does not provision it.

## GCP prerequisites

Use an existing project with billing enabled, the Google Cloud CLI, Docker, and Terraform 1.16.6 or a compatible newer 1.x release. The provider version is pinned in `infra/terraform/versions.tf`.

The provisioning identity needs permission to enable APIs, create Artifact Registry repositories and service accounts, deploy Cloud Run services, act as the runtime service account, and configure the service's invoker policy. The image publisher needs Artifact Registry write permission. Scope these grants to the project, repository, or service as appropriate. The application runtime service account has no project roles because the application calls no Google Cloud APIs.

Authentication examples below use an interactive developer account. For CI delivery, use Workload Identity Federation with a dedicated deployment identity and an environment approval rule. Do not create or commit a service-account key.

## Bootstrap, publish, deploy

These commands use PowerShell and run from the repository root. They create cloud resources only when explicitly executed. Choose your own project and region.

```powershell
$ProjectId = "your-project-id"
$Region = "us-central1"
gcloud auth login
gcloud auth application-default login
gcloud config set project $ProjectId
terraform -chdir=infra/terraform init
terraform -chdir=infra/terraform plan -var="project_id=$ProjectId" -var="region=$Region" -out=bootstrap.tfplan
terraform -chdir=infra/terraform apply bootstrap.tfplan
```

The first apply creates the repository, runtime service account, and required APIs. `deploy_service` defaults to `false`, so there is no placeholder application deployment. Build and publish the tested commit:

```powershell
pnpm install --frozen-lockfile
pnpm check
pnpm test:e2e
pnpm audit --audit-level=high
$Repository = terraform -chdir=infra/terraform output -raw image_repository
$Revision = git rev-parse HEAD
$ImageTag = "$Repository/web:$Revision"
gcloud auth configure-docker "$Region-docker.pkg.dev"
docker build --platform linux/amd64 --tag $ImageTag .
docker push $ImageTag
$Digest = gcloud artifacts docker images describe $ImageTag --format="value(image_summary.digest)"
$Image = "$Repository/web@$Digest"
```

Deploy the digest, not the tag. `public_access=true` deliberately makes this quote website accessible without authentication. Omit it for an IAM-protected service; the default is private.

```powershell
terraform -chdir=infra/terraform plan -var="project_id=$ProjectId" -var="region=$Region" -var="deploy_service=true" -var="public_access=true" -var="image=$Image" -out=release.tfplan
terraform -chdir=infra/terraform apply release.tfplan
$ServiceUrl = terraform -chdir=infra/terraform output -raw service_url
Invoke-RestMethod "$ServiceUrl/readyz"
Start-Process $ServiceUrl
```

Retain the deployed variable values in your environment's private `.tfvars` file or approved release system. Subsequent plans must include `deploy_service=true` and the desired digest; otherwise Terraform will propose removing the service. Deletion protection is enabled by default to prevent that accidental removal.

Artifact Registry tags are immutable. A repeated publication of the same commit must reuse its existing digest or use a new unique tag. The module accepts only Artifact Registry references containing a full SHA-256 digest. If an organization blocks `allUsers`, keep the service private and use the organization's approved access layer.

## Terraform state

The module defaults to local state for a single developer. Before a shared or production deployment, configure a GCS backend in a separate `backend.tf`:

```hcl
terraform {
  backend "gcs" {
    bucket = "your-existing-private-terraform-state-bucket"
    prefix = "acme-widget-co/production"
  }
}
```

Provision that bucket through your platform's bootstrap process, enable object versioning and uniform bucket-level access, and grant state access only to the deployment operators. Run `terraform init -migrate-state` when migrating an existing local state. State, plan files, `.terraform`, credentials, and private variable files must stay outside Git.

## Release controls

The supplied GitHub Actions workflow verifies code, coverage, browser journeys, the hardened container, dependency advisories, and Terraform syntax. It has read-only repository permission and does not deploy or receive cloud credentials. Action revisions are pinned to full commit hashes; dependency updates are proposed through Dependabot.

Before a live release, inspect the image's current vulnerability report, validate in a staging project, review the Terraform plan, and set budget and error-rate alerts. Deployments use the tested image digest. A failed startup probe prevents an unhealthy revision from serving normally; application behavior still needs a post-deployment smoke check.

See [operations](operations.md) for rollback and [security](security.md) for exposure and trust boundaries. Cloud Run probes follow the [official health-check contract](https://docs.cloud.google.com/run/docs/configuring/healthchecks).
