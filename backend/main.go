package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/tursodatabase/go-libsql"
)

func init() {
	// Register the libsql driver name with dbx's SQLite query builder
	// so that dbx generates SQLite-compatible SQL syntax.
	dbx.BuilderFuncMap["libsql"] = dbx.BuilderFuncMap["sqlite3"]
}

func main() {
	app := pocketbase.NewWithConfig(pocketbase.Config{
		DBConnect: libsqlConnect,
	})

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}

// libsqlConnect replaces PocketBase's default SQLite connection with libSQL.
// It supports two modes:
//   - Local embedded: libSQL runs as a local database (drop-in SQLite replacement)
//   - Turso sync: local database syncs with a remote Turso instance (set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN)
func libsqlConnect(dbPath string) (*dbx.DB, error) {
	// Strip any query parameters PocketBase may append to the path
	cleanPath := dbPath
	if idx := strings.Index(dbPath, "?"); idx != -1 {
		cleanPath = dbPath[:idx]
	}

	tursoURL := os.Getenv("TURSO_DATABASE_URL")
	tursoToken := os.Getenv("TURSO_AUTH_TOKEN")

	// Only sync the main data.db with Turso, not the auxiliary database
	isMainDB := strings.HasSuffix(cleanPath, "data.db")

	var connector *libsql.Connector
	var err error

	if tursoURL != "" && isMainDB {
		// Embedded replica mode: local file syncs with remote Turso database
		opts := []libsql.Option{
			libsql.WithAuthToken(tursoToken),
		}
		connector, err = libsql.NewEmbeddedReplicaConnector(cleanPath, tursoURL, opts...)
	} else {
		// Local-only embedded libSQL (no remote sync)
		connector, err = libsql.NewEmbeddedReplicaConnector(cleanPath, "")
	}
	if err != nil {
		return nil, fmt.Errorf("libsql connector for %s: %w", cleanPath, err)
	}

	sqlDB := sql.OpenDB(connector)

	if err := applyPragmas(sqlDB); err != nil {
		sqlDB.Close()
		return nil, err
	}

	return dbx.NewFromDB(sqlDB, "sqlite3"), nil
}

// applyPragmas sets the standard PocketBase SQLite pragmas for performance and safety.
func applyPragmas(db *sql.DB) error {
	pragmas := []string{
		"PRAGMA busy_timeout       = 10000;",
		"PRAGMA journal_mode       = WAL;",
		"PRAGMA journal_size_limit = 200000000;",
		"PRAGMA synchronous        = NORMAL;",
		"PRAGMA foreign_keys       = ON;",
		"PRAGMA temp_store         = MEMORY;",
		"PRAGMA cache_size         = -16000;",
	}
	for _, p := range pragmas {
		if _, err := db.Exec(p); err != nil {
			return fmt.Errorf("pragma %q: %w", p, err)
		}
	}
	return nil
}

// Ensure libsqlConnect satisfies core.DBConnectFunc at compile time.
var _ core.DBConnectFunc = libsqlConnect
