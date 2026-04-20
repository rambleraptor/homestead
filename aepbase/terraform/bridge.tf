# Bridge domain — a record of one hand of the Bridge card game, capturing
# the final bid per cardinal direction (N, S, E, W).
#
# Each `hand` stores four paired (level, suit) fields — one per bidder —
# plus an optional note. Level is 1-7 (Bridge bidding rules); suit is one
# of: clubs, diamonds, hearts, spades, no-trump. Validation is enforced in
# the frontend because aepbase strips JSON-schema `enum`/`minimum`/`maximum`
# on round-trip (see CLAUDE.md → aepbase Rules).

resource "aep_aep-resource-definition" "hand" {
  singular             = "hand"
  plural               = "hands"
  description          = "A Bridge hand: one final bid per cardinal direction."
  user_settable_create = true
  schema = jsonencode({
    type = "object"
    properties = {
      played_at = { type = "string", description = "RFC3339 timestamp" }
      north_level = {
        type        = "number"
        description = "bid level 1-7 for North"
      }
      north_suit = {
        type        = "string"
        description = "one of: clubs, diamonds, hearts, spades, no-trump"
      }
      south_level = {
        type        = "number"
        description = "bid level 1-7 for South"
      }
      south_suit = {
        type        = "string"
        description = "one of: clubs, diamonds, hearts, spades, no-trump"
      }
      east_level = {
        type        = "number"
        description = "bid level 1-7 for East"
      }
      east_suit = {
        type        = "string"
        description = "one of: clubs, diamonds, hearts, spades, no-trump"
      }
      west_level = {
        type        = "number"
        description = "bid level 1-7 for West"
      }
      west_suit = {
        type        = "string"
        description = "one of: clubs, diamonds, hearts, spades, no-trump"
      }
      notes      = { type = "string" }
      created_by = { type = "string", description = "users/{user_id}" }
    }
    required = [
      "north_level", "north_suit",
      "south_level", "south_suit",
      "east_level", "east_suit",
      "west_level", "west_suit",
    ]
  })
}
