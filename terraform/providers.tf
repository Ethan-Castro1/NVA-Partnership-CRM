# Providers come from components/extapp. CI (duplocloud-infrastructure's
# app-module.yml, extapp: true) fills in the state location:
# tenant/<workspace>/<repo name>.
terraform {
  backend "s3" {}
}
