module "extapp" {
  source       = "git::https://github.com/playlab-education/duplocloud-infrastructure.git//components/extapp?ref=labschools-domain"
  name         = "partners" # its key under the nva school's apps in schools.tfvars
  tag          = var.tag
  port         = 3000
  health_check = "/healthcheck"

  # Secret settings: names only. Set the values in Duplo (Secrets Manager,
  # duploservices-<tenant>-partners-secrets), then restart the service.
  secrets = [
    "ANTHROPIC_API_KEY",        # AI assistant and web search for leads
    "BOOTSTRAP_ADMIN_EMAIL",    # first admin account, created once at startup
    "BOOTSTRAP_ADMIN_PASSWORD", # (ignored once an admin exists; clear after)
  ]
}

# Set by CI (TF_VAR_tag): the image tag to deploy.
variable "tag" { type = string }

# Printed by the deploy as "Your app is live at ...".
output "url" {
  value = module.extapp.url
}
