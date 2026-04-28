# Pictionary domain — game sessions plus per-team rosters.
#
# Each `pictionary-game` represents one Pictionary session. Teams live
# under it as `/pictionary-games/{id}/pictionary-teams/{id}`. Players on
# a team are stored as `people/{id}` resource paths so renames in the
# people module don't break historical games.

resource "aep_aep-resource-definition" "pictionary_game" {
  singular             = "pictionary-game"
  plural               = "pictionary-games"
  description          = "A single Pictionary game session."
  user_settable_create = true
  schema = jsonencode({
    type = "object"
    properties = {
      played_at    = { type = "string", description = "RFC3339 timestamp of the game" }
      location     = { type = "string" }
      winning_word = { type = "string", description = "The clue/word the winning team guessed" }
      notes        = { type = "string" }
      created_by   = { type = "string", description = "users/{user_id}" }
    }
    required = ["played_at"]
  })
}

resource "aep_aep-resource-definition" "pictionary_team" {
  singular             = "pictionary-team"
  plural               = "pictionary-teams"
  description          = "A team within a Pictionary game."
  user_settable_create = true
  parents              = ["pictionary-game"]
  depends_on           = [aep_aep-resource-definition.pictionary_game]
  schema = jsonencode({
    type = "object"
    properties = {
      players = {
        type        = "array"
        items       = { type = "string" }
        description = "Player resource paths (people/{id})"
      }
      won        = { type = "boolean" }
      rank       = { type = "number", description = "1-based position within the game; teams have no name" }
      created_by = { type = "string" }
    }
    required = ["players"]
  })
}
