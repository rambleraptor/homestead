# Gift cards domain — mirrors pb_migrations collections `gift_cards` and
# `gift_card_transactions`. Shared household data: any authenticated user
# can read and write. `created_by` is informational only (string holding the
# user's resource path, e.g. "users/{user_id}").

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
      # File fields use aepbase's experimental file-field support
      # (EnableFileFields=true in main.go). Uploaded via multipart, served
      # back as a download URL. PB used 5MB image/jpeg|png|webp|gif uploads
      # with 100x100 + 400x400 thumbs; aepbase doesn't generate thumbnails
      # but mime/size constraints can be enforced client-side.
      front_image = {
        type                   = "binary"
        "x-aepbase-file-field" = true
        description            = "Front-of-card image (jpeg/png/webp/gif, <=5MB)"
      }
      back_image = {
        type                   = "binary"
        "x-aepbase-file-field" = true
        description            = "Back-of-card image (jpeg/png/webp/gif, <=5MB)"
      }
      created_by = { type = "string", description = "users/{user_id}" }
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
