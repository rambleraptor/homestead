# Todo items — daily-list style task tracker.

resource "aep_aep-resource-definition" "todo" {
  singular             = "todo"
  plural               = "todos"
  description          = "A household todo item."
  user_settable_create = true
  schema = jsonencode({
    type = "object"
    properties = {
      title      = { type = "string", description = "Todo title." }
      status     = { type = "string", description = "one of: pending, in_progress, do_later, completed, cancelled" }
      created_by = { type = "string", description = "users/{user_id}" }
    }
    required = ["title", "status"]
  })
}
