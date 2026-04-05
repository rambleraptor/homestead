# Credit cards domain — cards, their perks, and redemption records.

resource "aep_aep-resource-definition" "credit_card" {
  singular             = "credit-card"
  plural               = "credit-cards"
  description          = "A credit card account tracked for annual-fee value analysis."
  user_settable_create = true
  schema = jsonencode({
    type = "object"
    properties = {
      name             = { type = "string" }
      issuer           = { type = "string" }
      last_four        = { type = "string" }
      card_type        = { type = "string", description = "one of: personal, business" }
      annual_fee       = { type = "number" }
      anniversary_date = { type = "string", format = "date-time" }
      reset_mode       = { type = "string", description = "one of: calendar_year, anniversary" }
      notes            = { type = "string" }
      archived         = { type = "boolean" }
      created_by       = { type = "string" }
    }
    required = ["name", "issuer", "card_type", "annual_fee", "anniversary_date", "reset_mode"]
  })
}

resource "aep_aep-resource-definition" "perk" {
  singular             = "perk"
  plural               = "perks"
  description          = "A benefit/credit attached to a credit card (e.g. monthly dining credit)."
  user_settable_create = true
  parents              = ["credit-card"]
  depends_on           = [aep_aep-resource-definition.credit_card]
  schema = jsonencode({
    type = "object"
    properties = {
      name       = { type = "string" }
      value      = { type = "number" }
      frequency  = { type = "string", description = "one of: monthly, quarterly, semi_annual, annual" }
      category   = { type = "string", description = "one of: travel, dining, streaming, credits, insurance, lounge, other" }
      notes      = { type = "string" }
      created_by = { type = "string" }
    }
    required = ["name", "value", "frequency"]
  })
}

resource "aep_aep-resource-definition" "redemption" {
  singular             = "redemption"
  plural               = "redemptions"
  description          = "A single redemption of a credit card perk during its validity window."
  user_settable_create = true
  parents              = ["perk"]
  depends_on           = [aep_aep-resource-definition.perk]
  schema = jsonencode({
    type = "object"
    properties = {
      period_start = { type = "string", format = "date-time" }
      period_end   = { type = "string", format = "date-time" }
      redeemed_at  = { type = "string", format = "date-time" }
      amount       = { type = "number" }
      notes        = { type = "string" }
      created_by   = { type = "string" }
    }
    required = ["period_start", "period_end", "redeemed_at", "amount"]
  })
}
