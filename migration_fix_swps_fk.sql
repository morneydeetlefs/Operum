-- ── Migration: fix child table FK references from swps_old → swps ────────────
-- SQLite rewrote child FK references when swps was renamed to swps_old.
-- DROP TABLE swps_old then left all five child tables pointing at a gone table.
-- Fix: rebuild each child table with FK pointing at swps.
-- All existing data is preserved via INSERT INTO ... SELECT *.
-- Run with:
--   npx wrangler d1 execute operum_main --remote --file=migration_fix_swps_fk.sql

PRAGMA foreign_keys = OFF;

-- ── 1. swp_steps ─────────────────────────────────────────────────────────────

ALTER TABLE swp_steps RENAME TO swp_steps_old;

CREATE TABLE swp_steps (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  swp_id        TEXT NOT NULL REFERENCES swps(id) ON DELETE CASCADE,
  step_order    INTEGER NOT NULL DEFAULT 0,
  description   TEXT NOT NULL,
  hazards       TEXT NOT NULL DEFAULT '[]',
  ppe_required  TEXT NOT NULL DEFAULT '[]',
  precautions   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO swp_steps SELECT * FROM swp_steps_old;
DROP TABLE swp_steps_old;

-- ── 2. bbs_observations ──────────────────────────────────────────────────────

ALTER TABLE bbs_observations RENAME TO bbs_observations_old;

CREATE TABLE bbs_observations (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id          TEXT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  swp_id            TEXT NOT NULL REFERENCES swps(id) ON DELETE RESTRICT,
  observed_by       TEXT NOT NULL REFERENCES employees(id),
  observed_person   TEXT,
  area              TEXT,
  shift             TEXT CHECK(shift IN ('day','night')),
  observed_at       TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
  conversation_held INTEGER NOT NULL DEFAULT 0,
  followup_required INTEGER NOT NULL DEFAULT 0,
  followup_notes    TEXT,
  closed_at         TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO bbs_observations SELECT * FROM bbs_observations_old;
DROP TABLE bbs_observations_old;

-- ── 3. swp_resources ─────────────────────────────────────────────────────────

ALTER TABLE swp_resources RENAME TO swp_resources_old;

CREATE TABLE swp_resources (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  swp_id           TEXT NOT NULL REFERENCES swps(id) ON DELETE CASCADE,
  resource_type    TEXT NOT NULL,
  resource_source  TEXT NOT NULL DEFAULT 'freetext',
  description      TEXT NOT NULL,
  quantity         REAL,
  unit             TEXT,
  ref_id           TEXT,
  acknowledged     INTEGER NOT NULL DEFAULT 0,
  acknowledged_by  TEXT,
  acknowledged_at  TEXT,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT DEFAULT (datetime('now'))
);

INSERT INTO swp_resources SELECT * FROM swp_resources_old;
DROP TABLE swp_resources_old;

-- ── 4. swp_status_history ────────────────────────────────────────────────────

ALTER TABLE swp_status_history RENAME TO swp_status_history_old;

CREATE TABLE swp_status_history (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  swp_id       TEXT NOT NULL REFERENCES swps(id),
  from_status  TEXT NOT NULL,
  to_status    TEXT NOT NULL,
  acted_by     TEXT NOT NULL REFERENCES employees(id),
  elevation_id INTEGER REFERENCES employee_scope_elevations(id),
  comment      TEXT,
  acted_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO swp_status_history SELECT * FROM swp_status_history_old;
DROP TABLE swp_status_history_old;

CREATE INDEX IF NOT EXISTS idx_swp_history_swp ON swp_status_history(swp_id, acted_at);

-- ── 5. tool_issues ───────────────────────────────────────────────────────────

ALTER TABLE tool_issues RENAME TO tool_issues_old;

CREATE TABLE tool_issues (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  tool_id          TEXT NOT NULL REFERENCES tools(id),
  type_id          TEXT REFERENCES tool_types(id),
  swp_id           TEXT REFERENCES swps(id),
  issued_to_emp    TEXT NOT NULL REFERENCES employees(id),
  issued_by        TEXT NOT NULL,
  issued_at        TEXT NOT NULL DEFAULT (datetime('now')),
  expected_return  TEXT,
  returned_at      TEXT,
  return_condition TEXT,
  return_notes     TEXT,
  returned_by      TEXT
);

INSERT INTO tool_issues SELECT * FROM tool_issues_old;
DROP TABLE tool_issues_old;

PRAGMA foreign_keys = ON;
