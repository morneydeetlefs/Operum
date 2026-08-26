-- ── Condition Monitoring migration — operum_main ─────────────────────────────
-- Merges DiagnosticWand schema into operum_main.
-- Run with:
--   npx wrangler d1 execute operum_main --remote --env="" --file=migration_condition_monitoring.sql
--
-- Safe to run multiple times — all statements use IF NOT EXISTS / IF column missing.

-- 1. Add baseline columns to assets (condition monitoring state lives here)
ALTER TABLE assets ADD COLUMN baseline_rms    REAL NOT NULL DEFAULT 0;
ALTER TABLE assets ADD COLUMN baseline_set_at TEXT;

-- 2. diagnostic_logs — one row per sensor reading, references assets.id
CREATE TABLE IF NOT EXISTS diagnostic_logs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id      TEXT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  device_id     TEXT NOT NULL,
  recorded_by   TEXT REFERENCES employees(id),   -- JWT sub — already populated
  timestamp     TEXT NOT NULL,
  rms_accel     REAL NOT NULL,
  peak_g        REAL NOT NULL,
  crest_factor  REAL NOT NULL,
  kurtosis      REAL,
  sound_db      REAL NOT NULL,
  snapshot_url  TEXT
);

-- 3. Indexes — keeps reads fast as log volume grows
CREATE INDEX IF NOT EXISTS idx_diag_asset_ts  ON diagnostic_logs(asset_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_diag_timestamp ON diagnostic_logs(timestamp DESC);
