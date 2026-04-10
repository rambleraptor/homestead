# User-scoped child resources.
#
# aepbase's built-in `user` resource (provided by EnableUsers) has a fixed
# schema — email, display_name, type, etc. — and cannot be extended via
# the resource-definition API. PocketBase's `users` collection had extra
# fields added over time (e.g. `map_provider`); we model those as child
# resources living under /users/{user_id}/preferences/{id}.

resource "aep_aep-resource-definition" "user_preference" {
  singular             = "user-preference"
  plural               = "user-preferences"
  description          = "Per-user app preferences. Currently holds map_provider; extend as new user-scoped settings appear."
  user_settable_create = true
  parents              = ["user"]
  schema = jsonencode({
    type = "object"
    properties = {
      # PB migration 1767218201 added this as a TextField with pattern
      # ^(google|apple)$. aepbase strips JSON-schema enum/pattern on
      # round-trip, so the constraint lives in the description.
      map_provider = { type = "string", description = "one of: google, apple" }
    }
  })
}
