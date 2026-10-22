PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS pageviews (
  view_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  has_view INTEGER NOT NULL DEFAULT 0 CHECK (has_view IN (0, 1)),
  occurred_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  path TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  referrer TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'direct',
  utm_source TEXT NOT NULL DEFAULT '',
  utm_medium TEXT NOT NULL DEFAULT '',
  utm_campaign TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT 'XX',
  device TEXT NOT NULL DEFAULT 'other',
  browser TEXT NOT NULL DEFAULT 'other',
  is_returning INTEGER NOT NULL DEFAULT 0 CHECK (is_returning IN (0, 1)),
  session_start INTEGER NOT NULL DEFAULT 0 CHECK (session_start IN (0, 1)),
  active_ms INTEGER NOT NULL DEFAULT 0 CHECK (active_ms BETWEEN 0 AND 1800000),
  scroll_depth INTEGER NOT NULL DEFAULT 0 CHECK (scroll_depth BETWEEN 0 AND 100)
);
CREATE INDEX IF NOT EXISTS pageviews_time ON pageviews(has_view, occurred_at);
CREATE INDEX IF NOT EXISTS pageviews_path_time ON pageviews(path, occurred_at);
CREATE INDEX IF NOT EXISTS pageviews_session_time ON pageviews(session_id, occurred_at);
CREATE INDEX IF NOT EXISTS pageviews_visitor_time ON pageviews(visitor_id, occurred_at);

CREATE TABLE IF NOT EXISTS clicks (
  event_id TEXT PRIMARY KEY,
  view_id TEXT NOT NULL,
  occurred_at INTEGER NOT NULL,
  link_host TEXT NOT NULL,
  link_type TEXT NOT NULL CHECK (link_type IN ('outbound', 'download', 'msds')),
  FOREIGN KEY(view_id) REFERENCES pageviews(view_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS clicks_time ON clicks(occurred_at);
CREATE INDEX IF NOT EXISTS clicks_view ON clicks(view_id);

CREATE TABLE IF NOT EXISTS event_receipts (
  event_id TEXT PRIMARY KEY,
  received_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS receipts_time ON event_receipts(received_at);
