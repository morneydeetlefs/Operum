-- Operum — Schema migration: SWP + BBS
-- Phase 2a — Safe Work Procedures + Behaviour Based Safety Observations
-- Additive only — does not touch existing tables.
-- Apply: npx wrangler d1 execute operum_main --remote --file=schema_swp_bbs.sql

-- ─── Safe Work Procedures ────────────────────────────────────────────────────
-- A SWP is a task document attached to a specific asset.
-- One asset can have many SWPs (one per task type performed on it).
-- status: draft → approved → archived. Only approved SWPs can be used in BBS.
-- approved_by / approved_at are null until a safety_manager or admin approves.
-- Groq LLM draft generation slots in later as a POST /api/swps/:id/generate-draft
-- endpoint — it just populates swp_steps rows. No schema change needed.

CREATE TABLE IF NOT EXISTS swps (
  id            TEXT PRIMARY KEY,              -- SWP-2026-001, SWP-2026-002, etc. — generated
  asset_id      TEXT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  title         TEXT NOT NULL,                 -- e.g. "Greasing NDE Bearing", "Belt Tensioning"
  status        TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','archived')),
  approved_by   TEXT REFERENCES employees(id), -- null until approved
  approved_at   TEXT,                          -- ISO timestamp
  created_by    TEXT REFERENCES employees(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── SWP Steps ───────────────────────────────────────────────────────────────
-- Each step is one discrete, observable action in the procedure.
-- hazards and ppe_required are JSON arrays of freetext strings for now.
-- Future: these resolve against Chemicals Register and PPE catalogue
-- without schema change — the JSON strings become IDs in those tables.
-- step_order controls display sequence; gaps are allowed (reordering without renumbering).

CREATE TABLE IF NOT EXISTS swp_steps (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  swp_id        TEXT NOT NULL REFERENCES swps(id) ON DELETE CASCADE,
  step_order    INTEGER NOT NULL DEFAULT 0,
  description   TEXT NOT NULL,                 -- what to do: "Apply grease gun to zerk fitting"
  hazards       TEXT NOT NULL DEFAULT '[]',    -- JSON: ["pinch point","hot surface"]
  ppe_required  TEXT NOT NULL DEFAULT '[]',    -- JSON: ["nitrile gloves","safety glasses"]
  precautions   TEXT,                          -- freetext: any specific precaution note
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── BBS Observations ────────────────────────────────────────────────────────
-- One observation = one observer watching one task on one asset.
-- observed_person is optional freetext only — never a register lookup.
-- swp_id links the observation to the SWP being observed against.
-- status: open until the observer closes it (adds outcome/followup).
-- conversation_held: was feedback given to the person at the time?
-- followup_required: triggers a follow-up task (future: links to work order).

CREATE TABLE IF NOT EXISTS bbs_observations (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id          TEXT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  swp_id            TEXT NOT NULL REFERENCES swps(id) ON DELETE RESTRICT,
  observed_by       TEXT NOT NULL REFERENCES employees(id),
  observed_person   TEXT,                      -- optional freetext: "3 artisans on pump 7"
  area              TEXT,                      -- freetext location note: "Bay C west side"
  shift             TEXT CHECK(shift IN ('day','night')),
  observed_at       TEXT NOT NULL,             -- ISO timestamp of observation
  status            TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
  conversation_held INTEGER NOT NULL DEFAULT 0, -- 1 = feedback given on the spot
  followup_required INTEGER NOT NULL DEFAULT 0, -- 1 = action required after observation
  followup_notes    TEXT,                      -- what action is needed
  closed_at         TEXT,                      -- ISO timestamp when observer closes it
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── BBS Step Ratings ────────────────────────────────────────────────────────
-- One rating row per SWP step per observation.
-- rating: safe | at_risk | not_applicable
-- comment is optional — used when at_risk to note what was observed.
-- swp_step_id is immutable after submission — historical record is preserved
-- even if the SWP step is later edited or deleted (ON DELETE RESTRICT on swps
-- prevents deletion of SWPs that have observation records against them).

CREATE TABLE IF NOT EXISTS bbs_step_ratings (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  observation_id  INTEGER NOT NULL REFERENCES bbs_observations(id) ON DELETE CASCADE,
  swp_step_id     INTEGER NOT NULL REFERENCES swp_steps(id) ON DELETE RESTRICT,
  rating          TEXT NOT NULL CHECK(rating IN ('safe','at_risk','not_applicable')),
  comment         TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_swps_asset       ON swps(asset_id);
CREATE INDEX IF NOT EXISTS idx_swps_status      ON swps(status);
CREATE INDEX IF NOT EXISTS idx_swp_steps_swp    ON swp_steps(swp_id, step_order);
CREATE INDEX IF NOT EXISTS idx_bbs_asset        ON bbs_observations(asset_id);
CREATE INDEX IF NOT EXISTS idx_bbs_swp          ON bbs_observations(swp_id);
CREATE INDEX IF NOT EXISTS idx_bbs_observer     ON bbs_observations(observed_by);
CREATE INDEX IF NOT EXISTS idx_bbs_date         ON bbs_observations(observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_bbs_status       ON bbs_observations(status);
CREATE INDEX IF NOT EXISTS idx_bbs_ratings_obs  ON bbs_step_ratings(observation_id);
CREATE INDEX IF NOT EXISTS idx_bbs_ratings_step ON bbs_step_ratings(swp_step_id);
