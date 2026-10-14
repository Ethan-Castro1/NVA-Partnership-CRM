variable "tag" {
  description = "The image tag to deploy."
  type        = string
  default     = "latest"
  validation {
    condition     = can(regex("^[a-zA-Z0-9-]+$", var.tag))
    error_message = "The tag must be letters, digits and dashes."
  }
}
