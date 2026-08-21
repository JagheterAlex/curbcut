-- Curbcut Monitor.
--
-- Deliberately small. Everything here is data somebody typed into a form and
-- asked us to keep; nothing is inferred, purchased or tracked.

CREATE TABLE IF NOT EXISTS interest (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  site       TEXT,
  use_case   TEXT,
  source     TEXT,              -- which page the form was on
  created_at TEXT NOT NULL,
  -- Set when the person asks to be removed. The row is deleted outright on
  -- erasure requests; this exists only to stop a re-submission resurrecting a
  -- withdrawn address between requests.
  removed_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS interest_email ON interest (email);
CREATE INDEX IF NOT EXISTS interest_created ON interest (created_at);
