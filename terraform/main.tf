module "extapp" {
  source       = "git::https://github.com/playlab-education/duplocloud-infrastructure.git//components/extapp?ref=labschools-domain"
  name         = "example" # its key under the school's apps in schools.tfvars
  tag          = var.tag
  port         = 3000
  health_check = "/healthcheck"
}

# Set by CI (TF_VAR_tag): the image tag to deploy.
variable "tag" { type = string }

# Printed by the deploy as "Your app is live at ...".
output "url" {
  value = module.extapp.url
}
