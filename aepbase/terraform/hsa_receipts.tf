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
      # TODO(file-uploads): in PocketBase this was a required FileField
      # (10MB, jpeg/png/webp/gif/pdf, with 100x100 and 400x400 thumbnails).
      # aepbase has no file storage — see aepbase/README.md. For now this is
      # a URL string; the required constraint is preserved below.
      receipt_file = { type = "string", description = "URL to receipt file (image or PDF)" }
      notes        = { type = "string" }
      created_by   = { type = "string" }
    }
    required = ["merchant", "service_date", "amount", "category", "status", "receipt_file"]
  })
}
