-- ─────────────────────────────────────────────────────────────────────────────
-- Chemicals Register — schema migration
-- Operum · MD Works · September 2026
--
-- Apply with:
--   npx wrangler d1 execute operum_main --remote --file=schema_chemicals.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- ── chemicals ────────────────────────────────────────────────────────────────
-- One row per chemical substance / product stocked on site.
-- hazard_classes, ppe_required, incompatible_with are JSON arrays.
-- incompatible_with holds CHM-YYYY-NNN ids of chemically incompatible substances.
-- SDS fields track the current Safety Data Sheet only — version history is
-- recorded via the access_log table (action = 'sds_update').

CREATE TABLE IF NOT EXISTS chemicals (
  id               TEXT PRIMARY KEY,           -- CHM-YYYY-NNN, server-generated
  un_number        TEXT,                        -- UN/NA number e.g. "1203", nullable
  cas_number       TEXT,                        -- CAS registry e.g. "67-64-1", nullable
  common_name      TEXT NOT NULL,               -- e.g. "Acetone"
  chemical_name    TEXT,                        -- IUPAC / full name, nullable
  supplier         TEXT,                        -- supplier name, freetext, nullable
  physical_state   TEXT NOT NULL,               -- liquid | solid | gas | aerosol
  flash_point_c    REAL,                        -- nullable — N/A for non-flammables
  sds_version      TEXT,                        -- version string from the SDS document
  sds_url          TEXT,                        -- URL to current SDS/MSDS document
  sds_issued_at    TEXT,                        -- ISO date of SDS issue
  sds_expires_at   TEXT,                        -- ISO date — surface alert when approaching
  location_stored  TEXT,                        -- freetext, e.g. "Chem store bay 3"
  max_quantity_l   REAL,                        -- maximum permitted quantity on site
  quantity_unit    TEXT NOT NULL DEFAULT 'L',   -- L | kg
  status           TEXT NOT NULL DEFAULT 'active', -- active | archived
  hazard_classes   TEXT NOT NULL DEFAULT '[]',  -- JSON array of GHS hazard class strings
  ppe_required     TEXT NOT NULL DEFAULT '[]',  -- JSON array of PPE item strings
  incompatible_with TEXT NOT NULL DEFAULT '[]', -- JSON array of CHM-YYYY-NNN ids
  created_by       TEXT,                        -- employee id (actor.sub)
  created_at       TEXT DEFAULT (datetime('now')),
  updated_at       TEXT DEFAULT (datetime('now'))
);

-- ── asset_chemicals ──────────────────────────────────────────────────────────
-- Maps which chemicals are present at which asset/location node.
-- HIRA queries this to resolve "chemicals present at this location."
-- quantity_on_hand is maintained by the receipt endpoint — updated in place.

CREATE TABLE IF NOT EXISTS asset_chemicals (
  asset_id         TEXT NOT NULL REFERENCES assets(id),
  chemical_id      TEXT NOT NULL REFERENCES chemicals(id),
  quantity_on_hand REAL,                        -- current on-hand quantity, nullable
  unit             TEXT NOT NULL DEFAULT 'L',   -- L | kg
  last_updated     TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (asset_id, chemical_id)
);

-- ── indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_chemicals_status    ON chemicals(status);
CREATE INDEX IF NOT EXISTS idx_chemicals_un        ON chemicals(un_number);
CREATE INDEX IF NOT EXISTS idx_asset_chemicals_chem ON asset_chemicals(chemical_id);
