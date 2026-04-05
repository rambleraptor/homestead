# Grocery list items and the stores they're purchased from.

resource "aep_aep-resource-definition" "store" {
  singular             = "store"
  plural               = "stores"
  description          = "A grocery store (used to group grocery items)."
  user_settable_create = true
  schema = jsonencode({
    type = "object"
    properties = {
      name       = { type = "string" }
      sort_order = { type = "number" }
      created_by = { type = "string" }
    }
    required = ["name"]
  })
}

resource "aep_aep-resource-definition" "grocery" {
  singular             = "grocery"
  plural               = "groceries"
  description          = "A single item on the household's shared grocery list."
  user_settable_create = true
  schema = jsonencode({
    type = "object"
    properties = {
      name       = { type = "string" }
      checked    = { type = "boolean" }
      category   = { type = "string" }
      notes      = { type = "string" }
      store      = { type = "string", description = "stores/{store_id}" }
      created_by = { type = "string" }
    }
    required = ["name"]
  })
}
