# Gift cards domain — mirrors pb_migrations collections `gift_cards` and
# `gift_card_transactions`. PB relations are stored as string fields holding
# the referenced resource `path` (AEP convention). File fields store URLs.

resource "aep_aep-resource-definition" "gift_card" {
  singular             = "gift-card"
  plural               = "gift-cards"
  description          = "A stored-value gift card owned by the household."
  user_settable_create = true
  schema = jsonencode({
    type = "object"
    properties = {
      merchant    = { type = "string" }
      card_number = { type = "string" }
      pin         = { type = "string" }
      amount      = { type = "number" }
      notes       = { type = "string" }
      archived    = { type = "boolean" }
      # TODO(file-uploads): in PocketBase these were native FileField uploads
      # (5MB, jpeg/png/webp/gif, with auto-generated 100x100 and 400x400
      # thumbnails). aepbase has no file storage or multipart handling, so
      # these are plain strings holding an external URL for now. Revisit once
      # we pick a storage strategy (S3/R2 + presigned PUT, sidecar service,
      # or upstream aepbase FileField support).
      front_image = { type = "string", description = "URL to front image" }
      back_image  = { type = "string", description = "URL to back image" }
      created_by  = { type = "string", description = "users/{user_id}" }
    }
    required = ["merchant", "card_number", "amount"]
  })
}

resource "aep_aep-resource-definition" "transaction" {
  singular             = "transaction"
  plural               = "transactions"
  description          = "A balance change recorded against a gift card."
  user_settable_create = true
  parents              = ["gift-card"]
  depends_on           = [aep_aep-resource-definition.gift_card]
  schema = jsonencode({
    type = "object"
    properties = {
      transaction_type = { type = "string", description = "one of: decrement, set" }
      previous_amount  = { type = "number" }
      new_amount       = { type = "number" }
      amount_changed   = { type = "number" }
      notes            = { type = "string" }
      created_by       = { type = "string" }
    }
    required = ["transaction_type", "previous_amount", "new_amount", "amount_changed"]
  })
}
