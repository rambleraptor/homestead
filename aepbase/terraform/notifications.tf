# Notifications domain — user-facing notifications, their delivery subscriptions,
# and templates for recurring generation.

resource "aep_aep-resource-definition" "notification" {
  singular             = "notification"
  plural               = "notifications"
  description          = "A notification delivered (or scheduled) to a user."
  user_settable_create = true
  schema = jsonencode({
    type = "object"
    properties = {
      user_id                  = { type = "string" }
      person_id                = { type = "string", description = "deprecated, use source_* fields" }
      title                    = { type = "string" }
      message                  = { type = "string" }
      notification_type        = { type = "string", description = "one of: day_of, day_before, week_before, system" }
      scheduled_for            = { type = "string", format = "date-time" }
      sent_at                  = { type = "string", format = "date-time" }
      read                     = { type = "boolean" }
      read_at                  = { type = "string", format = "date-time" }
      recurring_notification_id = { type = "string" }
      source_collection        = { type = "string" }
      source_id                = { type = "string" }
    }
    required = ["user_id", "title", "message", "notification_type"]
  })
}

resource "aep_aep-resource-definition" "notification_subscription" {
  singular             = "notification-subscription"
  plural               = "notification-subscriptions"
  description          = "A web push subscription endpoint for a user."
  user_settable_create = true
  schema = jsonencode({
    type = "object"
    properties = {
      user_id           = { type = "string" }
      subscription_data = { type = "object" }
      enabled           = { type = "boolean" }
    }
    required = ["user_id", "subscription_data"]
  })
}

resource "aep_aep-resource-definition" "recurring_notification" {
  singular             = "recurring-notification"
  plural               = "recurring-notifications"
  description          = "Template that generates notifications on a recurring schedule from a source record."
  user_settable_create = true
  schema = jsonencode({
    type = "object"
    properties = {
      user_id              = { type = "string" }
      source_collection    = { type = "string" }
      source_id            = { type = "string" }
      title_template       = { type = "string" }
      message_template     = { type = "string" }
      reference_date_field = { type = "string" }
      timing               = { type = "string", description = "one of: day_of, day_before, week_before" }
      enabled              = { type = "boolean" }
      last_triggered       = { type = "string", format = "date-time" }
    }
    required = ["user_id", "source_collection", "source_id", "title_template", "message_template", "reference_date_field", "timing"]
  })
}
