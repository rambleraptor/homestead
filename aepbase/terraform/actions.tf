# Automation actions — reusable scripts and their execution history.

resource "aep_aep-resource-definition" "action" {
  singular             = "action"
  plural               = "actions"
  description          = "A reusable automation action backed by a script."
  user_settable_create = true
  schema = jsonencode({
    type = "object"
    properties = {
      name        = { type = "string" }
      description = { type = "string" }
      script_id   = { type = "string" }
      parameters  = { type = "object" }
      last_run_at = { type = "string", format = "date-time" }
      created_by  = { type = "string" }
    }
    required = ["name", "script_id"]
  })
}

resource "aep_aep-resource-definition" "run" {
  singular             = "run"
  plural               = "runs"
  description          = "An execution record for an action — status, timing, logs, and result."
  user_settable_create = true
  parents              = ["action"]
  depends_on           = [aep_aep-resource-definition.action]
  schema = jsonencode({
    type = "object"
    properties = {
      status         = { type = "string", description = "one of: pending, running, awaiting_input, success, error" }
      started_at     = { type = "string", format = "date-time" }
      completed_at   = { type = "string", format = "date-time" }
      duration_ms    = { type = "number" }
      logs           = { type = "object" }
      error          = { type = "string" }
      result         = { type = "object" }
      input_request  = { type = "object" }
      input_response = { type = "object" }
    }
    required = ["status"]
  })
}
