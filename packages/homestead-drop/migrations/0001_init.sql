-- A box is a place links wait in. Its id is the SHA-256 of the key a shortcut
-- sends, so this database never holds a key — only what a key hashes to.
CREATE TABLE boxes (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

-- A link waiting to be collected. `seq` orders them and is what a collection
-- acknowledges through; `id` is random, so it never repeats even if this
-- database is rebuilt (the collector derives a record id from it).
CREATE TABLE links (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  box TEXT NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  received_at INTEGER NOT NULL
);

CREATE INDEX links_by_box ON links (box, seq);
CREATE INDEX links_by_age ON links (received_at);
