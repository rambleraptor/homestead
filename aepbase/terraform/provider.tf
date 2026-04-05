terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aep = {
      source  = "aep-dev/aep"
      version = "0.2.0"
    }
  }
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
    # aepbase has no auth by default. Add headers here if you front it with a proxy.
  }
}
