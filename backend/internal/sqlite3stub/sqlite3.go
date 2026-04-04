// Package sqlite3 is a no-op stub that replaces mattn/go-sqlite3.
//
// PocketBase auto-imports mattn/go-sqlite3 when built with CGO_ENABLED=1.
// Since we use go-libsql instead, this stub prevents duplicate SQLite C
// symbol conflicts at link time.
package sqlite3
