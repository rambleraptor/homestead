module github.com/rambleraptor/homeos/backend

go 1.24.7

require (
	github.com/pocketbase/dbx v1.11.0
	github.com/pocketbase/pocketbase v0.34.2
	github.com/tursodatabase/go-libsql v0.0.0-20251219133454-43644db490ff
)

// Replace mattn/go-sqlite3 with a no-op stub to prevent duplicate SQLite
// C symbol conflicts with go-libsql. PocketBase auto-imports mattn/go-sqlite3
// when built with CGO_ENABLED=1, but we use go-libsql instead.
replace github.com/mattn/go-sqlite3 => ./internal/sqlite3stub
