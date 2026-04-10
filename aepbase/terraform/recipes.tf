# Recipes and the cooking log that tracks attempts.

resource "aep_aep-resource-definition" "recipe" {
  singular             = "recipe"
  plural               = "recipes"
  description          = "A recipe — digital, physical (e.g. cookbook page), or family-passed."
  user_settable_create = true
  schema = jsonencode({
    type = "object"
    properties = {
      title            = { type = "string" }
      source_type      = { type = "string", description = "one of: digital, physical, family" }
      source_reference = { type = "string" }
      ingredients      = { type = "object" }
      instructions     = { type = "string", description = "rich text (editor field in PB)" }
      version          = { type = "number" }
      changelog        = { type = "object" }
      last_cooked      = { type = "string", format = "date-time" }
      rating           = { type = "number", description = "1-10 scale" }
      # File field — uploaded via multipart, served back as a download URL.
      # PB used 5MB image/jpeg|png|webp uploads with no thumbnails.
      image = {
        type                   = "binary"
        "x-aepbase-file-field" = true
        description            = "Recipe image (jpeg/png/webp, <=5MB)"
      }
      created_by = { type = "string" }
    }
    required = ["title", "source_type", "version"]
  })
}

resource "aep_aep-resource-definition" "log" {
  singular             = "log"
  plural               = "logs"
  description          = "A single cooking attempt of a recipe with outcome and notes."
  user_settable_create = true
  parents              = ["recipe"]
  depends_on           = [aep_aep-resource-definition.recipe]
  schema = jsonencode({
    type = "object"
    properties = {
      date            = { type = "string", format = "date-time" }
      notes           = { type = "string" }
      success         = { type = "boolean" }
      rating          = { type = "number", description = "1-5 scale" }
      deviated        = { type = "boolean" }
      deviation_notes = { type = "string" }
      created_by      = { type = "string" }
    }
    required = ["date"]
  })
}
