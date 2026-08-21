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

-- Aggregate usage counts. One row per day per event name, and nothing else:
-- no URLs, no addresses, no identifiers. See src/usage.js for why the scanned
-- domain is deliberately not kept even though it would be useful to us.
CREATE TABLE IF NOT EXISTS usage_daily (
  day   TEXT    NOT NULL,
  event TEXT    NOT NULL,
  hits  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, event)
);
