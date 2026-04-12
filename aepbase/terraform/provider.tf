terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aep = {
      source  = "aep-dev/aep"
      version = "0.2.0"
    }
  }
}

# Bearer token used to authenticate against aepbase. Once EnableUsers is on,
# every endpoint except `/openapi.json` and `POST /users/:login` requires it.
# Set via the standard terraform env var convention:
#   export TF_VAR_aepbase_token=$(curl -sS -X POST http://localhost:8090/users/:login \
#       -H 'Content-Type: application/json' \
#       -d '{"email":"admin@example.com","password":"..."}' | jq -r .token)
variable "aepbase_token" {
  type        = string
  sensitive   = true
  default     = ""
  description = "Bearer token for aepbase. Set via TF_VAR_aepbase_token."
}

# The aep provider is a *dynamic* provider: at init time it reads the OpenAPI
# spec from AEP_OPENAPI and generates a terraform resource for each
# x-aep-resource in the spec. For a vanilla aepbase, that includes
# `aep_aep_resource_definition` (the meta-resource used to register schemas)
# and `aep_operation`.
#
# Set AEP_OPENAPI before running terraform:
#   export AEP_OPENAPI=http://localhost:8090/openapi.json
provider "aep" {
  headers = {
    Authorization = "Bearer ${var.aepbase_token}"
  }
}
