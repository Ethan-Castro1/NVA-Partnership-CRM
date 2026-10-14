# Providers come from components/labapp. CI (duplocloud-infrastructure's
# app-module.yml, labapp: true) fills in the state location:
# tenant/<workspace>/<repo name>.
terraform {
  backend "s3" {}
}
