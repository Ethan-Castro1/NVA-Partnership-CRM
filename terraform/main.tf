# This app on its lab school tenant (the workspace: exdtemplate or exttemplate).
# Its tenant, nodes, ECR repo, URL and cert come from its "home" entry under the
# template school in duplocloud-infrastructure config/exttenant/schools.tfvars.
module "labapp" {
  source = "git::https://github.com/playlab-education/duplocloud-infrastructure.git//components/labapp?ref=labschools-domain"
  name   = "home" # its key under the school's apps in schools.tfvars
  tag    = var.tag
  port   = 3000
}

# Printed by the deploy as "Your app is live at ...".
output "url" {
  value = module.labapp.url
}
