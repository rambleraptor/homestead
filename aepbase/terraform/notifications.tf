# Notifications domain — user-facing notifications and their delivery
# subscriptions.
#
# Every resource here is a child of the built-in `user` resource (provided by
# aepbase's EnableUsers). PocketBase enforced "user_id = @request.auth.id" on
# both; making them user-parented gets the same scoping for free —
# regular users can only see/write rows under their own /users/{id}/...
# path, and the explicit user_id field disappears (encoded in the URL).

resource "aep_aep-resource-definition" "notification" {
  singular             = "notification"
  plural               = "notifications"
  description          = "A notification delivered (or scheduled) to a user."
  user_settable_create = true
  parents              = ["user"]
  schema = jsonencode({
    type = "object"
    properties = {
      person_id         = { type = "string", description = "deprecated, use source_* fields" }
      title             = { type = "string" }
      message           = { type = "string" }
      notification_type = { type = "string", description = "one of: day_of, day_before, week_before, system" }
      scheduled_for     = { type = "string", format = "date-time" }
      sent_at           = { type = "string", format = "date-time" }
      read              = { type = "boolean" }
      read_at           = { type = "string", format = "date-time" }
      source_collection = { type = "string" }
      source_id         = { type = "string" }
    }
    required = ["title", "message", "notification_type"]
  })
}

resource "aep_aep-resource-definition" "notification_subscription" {
  singular             = "notification-subscription"
  plural               = "notification-subscriptions"
  description          = "A web push subscription endpoint for a user."
  user_settable_create = true
  parents              = ["user"]
  schema = jsonencode({
    type = "object"
    properties = {
      subscription_data = { type = "object" }
      enabled           = { type = "boolean" }
    }
    required = ["subscription_data"]
  })
}

