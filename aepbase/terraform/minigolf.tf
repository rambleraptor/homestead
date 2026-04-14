# Minigolf domain — mini golf games and per-hole score records.
#
# `game` holds the session (players, hole count, location) and `hole` is a
# child under `/games/{id}/holes/{id}` that stores each player's strokes
# for that hole. Players are stored as `people/{id}` resource paths, so
# player identity survives renames in the people module.

resource "aep_aep-resource-definition" "game" {
  singular             = "game"
  plural               = "games"
  description          = "A mini golf game session."
  user_settable_create = true
  schema = jsonencode({
    type = "object"
    properties = {
      location   = { type = "string" }
      played_at  = { type = "string", description = "RFC3339 timestamp" }
      players = {
        type        = "array"
        items       = { type = "string" }
        description = "Player resource paths (people/{id})"
      }
      hole_count = { type = "number" }
      completed  = { type = "boolean" }
      notes      = { type = "string" }
      created_by = { type = "string", description = "users/{user_id}" }
    }
    required = ["players", "hole_count"]
  })
}

resource "aep_aep-resource-definition" "hole" {
  singular             = "hole"
  plural               = "holes"
  description          = "A single hole within a mini golf game."
  user_settable_create = true
  parents              = ["game"]
  depends_on           = [aep_aep-resource-definition.game]
  schema = jsonencode({
    type = "object"
    properties = {
      hole_number = { type = "number" }
      par         = { type = "number" }
      # per-player score entries: [{ player: "people/{id}", strokes: 3 }, ...]
      scores = {
        type = "array"
        items = {
          type = "object"
          properties = {
            player  = { type = "string", description = "people/{id} resource path" }
            strokes = { type = "number" }
          }
        }
      }
      created_by = { type = "string" }
    }
    required = ["hole_number", "par", "scores"]
  })
}
