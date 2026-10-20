variable "project_id" {
  description = "Existing Google Cloud project with billing enabled."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id))
    error_message = "Provide a valid Google Cloud project ID."
  }
}

variable "region" {
  description = "Region for Cloud Run and Artifact Registry."
  type        = string
  default     = "us-central1"
}

variable "service_name" {
  description = "Name used for the application and its runtime identity."
  type        = string
  default     = "acme-widget-co"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,22}[a-z0-9]$", var.service_name))
    error_message = "Use 6 to 24 lowercase letters, digits, or hyphens, starting with a letter and ending with a letter or digit."
  }
}

variable "deploy_service" {
  description = "Create Cloud Run after publishing an application image. False bootstraps only the registry and runtime identity."
  type        = bool
  default     = false
}

variable "image" {
  description = "Immutable Artifact Registry application image ending in @sha256 followed by a 64-character digest."
  type        = string
  default     = null

  validation {
    condition     = var.image == null ? !var.deploy_service : can(regex("^[a-z0-9-]+-docker\\.pkg\\.dev/[^[:space:]@]+@sha256:[a-f0-9]{64}$", var.image))
    error_message = "Deploy an Artifact Registry image by immutable sha256 digest; image is required when deploy_service is true."
  }
}

variable "public_access" {
  description = "Allow unauthenticated access to the quote website. False requires Cloud Run IAM authentication."
  type        = bool
  default     = false
}

variable "min_instances" {
  description = "Minimum instances. Zero allows scale to zero; one reduces cold starts."
  type        = number
  default     = 0

  validation {
    condition     = var.min_instances >= 0 && floor(var.min_instances) == var.min_instances
    error_message = "min_instances must be a nonnegative integer."
  }
}

variable "max_instances" {
  description = "Service instance cap; tune with measurements and an agreed cost budget."
  type        = number
  default     = 20

  validation {
    condition     = var.max_instances >= 1 && var.max_instances >= var.min_instances && floor(var.max_instances) == var.max_instances
    error_message = "max_instances must be an integer of at least one and no smaller than min_instances."
  }
}

variable "concurrency" {
  description = "Maximum simultaneous requests per instance."
  type        = number
  default     = 80

  validation {
    condition     = var.concurrency >= 1 && var.concurrency <= 1000 && floor(var.concurrency) == var.concurrency
    error_message = "concurrency must be an integer between 1 and 1000."
  }
}

variable "deletion_protection" {
  description = "Require an explicit configuration change before deleting Cloud Run."
  type        = bool
  default     = true
}
