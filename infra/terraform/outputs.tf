output "image_repository" {
  description = "Repository prefix to use when tagging application images."
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.application.repository_id}"
}

output "runtime_service_account" {
  description = "Runtime identity, with no Google Cloud project roles."
  value       = google_service_account.runtime.email
}

output "service_url" {
  description = "Cloud Run URL after deploy_service is enabled."
  value       = var.deploy_service ? google_cloud_run_v2_service.application[0].uri : null
}
