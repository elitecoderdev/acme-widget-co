locals {
  services = toset([
    "artifactregistry.googleapis.com",
    "iam.googleapis.com",
    "run.googleapis.com"
  ])

  labels = {
    application = var.service_name
    managed-by  = "terraform"
  }
}

resource "google_project_service" "required" {
  for_each = local.services

  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

resource "google_artifact_registry_repository" "application" {
  location      = var.region
  repository_id = var.service_name
  description   = "Immutable application images for Acme Widget Co."
  format        = "DOCKER"
  labels        = local.labels

  docker_config {
    immutable_tags = true
  }

  depends_on = [google_project_service.required]
}

resource "google_service_account" "runtime" {
  account_id   = "${var.service_name}-run"
  display_name = "Acme Widget Co. runtime"
  description  = "No project roles: the application does not access Google Cloud APIs."

  depends_on = [google_project_service.required]
}

resource "google_cloud_run_v2_service" "application" {
  count = var.deploy_service ? 1 : 0

  name                = var.service_name
  location            = var.region
  deletion_protection = var.deletion_protection
  ingress             = "INGRESS_TRAFFIC_ALL"
  labels              = local.labels

  scaling {
    min_instance_count = var.min_instances
    max_instance_count = var.max_instances
  }

  template {
    service_account                  = google_service_account.runtime.email
    execution_environment            = "EXECUTION_ENVIRONMENT_GEN2"
    max_instance_request_concurrency = var.concurrency
    timeout                          = "10s"

    containers {
      image = var.image

      ports {
        container_port = 8080
        name           = "http1"
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle          = true
        startup_cpu_boost = true
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }

      env {
        name  = "HOST"
        value = "0.0.0.0"
      }

      env {
        name  = "STATIC_DIR"
        value = "/app/apps/web/dist"
      }

      startup_probe {
        initial_delay_seconds = 0
        period_seconds        = 2
        timeout_seconds       = 1
        failure_threshold     = 15

        http_get {
          path = "/readyz"
          port = 8080
        }
      }

      liveness_probe {
        period_seconds    = 30
        timeout_seconds   = 3
        failure_threshold = 3

        http_get {
          path = "/healthz"
          port = 8080
        }
      }
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  depends_on = [google_project_service.required]
}

resource "google_cloud_run_v2_service_iam_member" "public" {
  count = var.deploy_service && var.public_access ? 1 : 0

  project  = var.project_id
  location = google_cloud_run_v2_service.application[0].location
  name     = google_cloud_run_v2_service.application[0].name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
