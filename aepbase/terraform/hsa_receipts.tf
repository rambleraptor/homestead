# Health Savings Account receipts.

resource "aep_aep-resource-definition" "hsa_receipt" {
  singular             = "hsa-receipt"
  plural               = "hsa-receipts"
  description          = "A receipt for an HSA-eligible expense (for later reimbursement tracking)."
  user_settable_create = true
  schema = jsonencode({
    type = "object"
    properties = {
      merchant     = { type = "string" }
      service_date = { type = "string", format = "date-time" }
      amount       = { type = "number" }
      category     = { type = "string", description = "one of: Medical, Dental, Vision, Rx" }
      patient      = { type = "string" }
      status       = { type = "string", description = "one of: Stored, Reimbursed" }
      # File field — uploaded via multipart, served back as a download URL.
      # PB used a required 10MB jpeg/png/webp/gif/pdf upload with 100x100 +
      # 400x400 thumbs; aepbase doesn't generate thumbnails. The `required`
      # constraint below is enforced by aepbase — empty multipart returns
      # 400 on create.
      receipt_file = {
        type                   = "binary"
        "x-aepbase-file-field" = true
        description            = "Receipt file (jpeg/png/webp/gif/pdf, <=10MB)"
      }
      notes      = { type = "string" }
      created_by = { type = "string" }
    }
    required = ["merchant", "service_date", "amount", "category", "status", "receipt_file"]
  })
}
