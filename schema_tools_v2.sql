-- ─────────────────────────────────────────────────────────────────────────────
-- Tools Register v2 — two-level schema migration
-- Operum · MD Works · September 2026
--
-- Apply with:
--   npx wrangler d1 execute operum_main --remote --file=schema_tools_v2.sql
--
-- Drops all v1 tools tables (test data only — safe to drop).
-- Rebuilds with tool_types + tools (instances) two-level model.
-- swp_resources is also rebuilt — ref_id now points to tool_types.id.
-- tool_inspections unchanged structurally but re-created for clean FK.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Drop v1 tables ────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS swp_resources;
DROP TABLE IF EXISTS tool_issues;
DROP TABLE IF EXISTS tool_inspections;
DROP TABLE IF EXISTS tools;

-- ── tool_types ────────────────────────────────────────────────────────────────
-- The catalogue of tool specifications. One row per type of tool.
-- This is what gets linked to SWP resource lists.
-- ID prefix: TTY-YYYY-NNN (type), separate from instance prefixes.

CREATE TABLE tool_types (
  id                       TEXT PRIMARY KEY,     -- TTY-YYYY-NNN
  category                 TEXT NOT NULL,        -- lifting_tackle | instrument | general_tool | ppe
  name                     TEXT NOT NULL,        -- e.g. "Chain Block 2T"
  description              TEXT,                 -- optional detail
  wll_kg                   REAL,                 -- lifting tackle: working load limit
  wll_unit                 TEXT DEFAULT 'kg',    -- kg | t
  ppe_spec                 TEXT,                 -- PPE: standard/spec e.g. "SANS 1053 Class 1"
  inspection_interval_days INTEGER,              -- default inspection interval for instances
  quantity_unit            TEXT DEFAULT 'each',  -- each | m | set | L | kg
  created_by               TEXT,
  created_at               TEXT DEFAULT (datetime('now'))
);

-- ── tools (instances) ─────────────────────────────────────────────────────────
-- One row per physical item. Linked to a tool_type.
-- ID prefix is derived from type category at creation time:
--   LFT-YYYY-NNN  lifting tackle   (DMR Regulation 18)
--   INS-YYYY-NNN  instruments      (GSR 6 / ISO 9001)
--   PPE-YYYY-NNN  PPE stock        (GSR 9)
--   TLS-YYYY-NNN  general tools
--
-- ownership = 'personal': tool belongs to an artisan (owner_emp_id set).
--   Personal tools are visible in register but not issuable from stores.
--
-- status = 'condemned': set automatically on condemned inspection result.
--   Cannot be overridden. Item must be physically destroyed per DMR Reg 18.

CREATE TABLE tools (
  id                       TEXT PRIMARY KEY,     -- LFT/INS/PPE/TLS-YYYY-NNN
  type_id                  TEXT NOT NULL REFERENCES tool_types(id),
  tag_number               TEXT,                 -- physical tag / barcode on item
  serial_number            TEXT,
  manufacturer             TEXT,
  model                    TEXT,
  ownership                TEXT NOT NULL DEFAULT 'site',  -- site | personal
  owner_emp_id             TEXT REFERENCES employees(id), -- set when personal
  location_id              TEXT REFERENCES assets(id),    -- stores location node
  -- Current inspection metadata (latest values — full history in tool_inspections)
  last_inspected_at        TEXT,
  next_inspection_due      TEXT,                 -- alert when approaching / overdue
  inspector_name           TEXT,
  certificate_ref          TEXT,
  certificate_url          TEXT,                 -- URL to certificate (Google Drive etc.)
  -- PPE only
  assigned_emp_id          TEXT REFERENCES employees(id),
  -- Status
  -- in_service    available for issue
  -- out_of_service temporarily removed; hard-blocked from issue
  -- condemned     permanent; set only via inspection endpoint; cannot be reversed
  -- lost          reported lost; hard-blocked from issue
  status                   TEXT NOT NULL DEFAULT 'in_service',
  created_by               TEXT,
  created_at               TEXT DEFAULT (datetime('now')),
  updated_at               TEXT DEFAULT (datetime('now'))
);

-- ── tool_inspections ──────────────────────────────────────────────────────────
-- Full inspection history per instance.
-- Recording condemned result → Worker sets tools.status = 'condemned' permanently.
-- Recording fail result → Worker sets tools.status = 'out_of_service'.

CREATE TABLE tool_inspections (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  tool_id          TEXT NOT NULL REFERENCES tools(id),
  inspected_at     TEXT NOT NULL,
  inspector_name   TEXT NOT NULL,
  result           TEXT NOT NULL,    -- pass | fail | condemned
  findings         TEXT,
  certificate_ref  TEXT,
  certificate_url  TEXT,
  next_due         TEXT,             -- written to tools.next_inspection_due on save
  recorded_by      TEXT,             -- actor.sub
  created_at       TEXT DEFAULT (datetime('now'))
);

-- ── tool_issues ───────────────────────────────────────────────────────────────
-- Issue and return records per physical instance.
-- swp_id nullable — supports onboarding issue (no SWP context).
-- type_id denormalised for reporting convenience.
--
-- Issue hard-blocks (enforced in Worker):
--   tools.status IN ('condemned', 'out_of_service', 'lost')
--   tools.next_inspection_due < today  (overdue inspection)
--   tool already has open issue (returned_at IS NULL)
--
-- Return condition effects:
--   good    → tools.status = 'in_service'
--   damaged → tools.status = 'out_of_service'
--   lost    → tools.status = 'lost'

CREATE TABLE tool_issues (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  tool_id          TEXT NOT NULL REFERENCES tools(id),   -- specific instance
  type_id          TEXT REFERENCES tool_types(id),       -- denormalised for reporting
  swp_id           TEXT REFERENCES swps(id),             -- nullable — onboarding or ad hoc
  issued_to_emp    TEXT NOT NULL REFERENCES employees(id),
  issued_by        TEXT NOT NULL,                        -- actor.sub
  issued_at        TEXT NOT NULL DEFAULT (datetime('now')),
  expected_return  TEXT,
  returned_at      TEXT,                                 -- null = still out
  return_condition TEXT,                                 -- good | damaged | lost
  return_notes     TEXT,
  returned_by      TEXT                                  -- actor.sub at return
);

-- ── swp_resources ─────────────────────────────────────────────────────────────
-- Resources required to execute a SWP.
-- ref_id for tools points to tool_types.id (the specification).
-- ref_id for chemicals points to chemicals.id.
-- resource_source:
--   freetext  — consumables / common hand tools; artisan acknowledges
--   register  — linked to tool_types.id or chemicals.id; goes through issue flow
--   personal  — linked to a personal-ownership tools instance; no issue transaction

CREATE TABLE swp_resources (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  swp_id           TEXT NOT NULL REFERENCES swps(id) ON DELETE CASCADE,
  resource_type    TEXT NOT NULL,           -- tool | spare | equipment | consumable | chemical
  resource_source  TEXT NOT NULL DEFAULT 'freetext', -- freetext | register | personal
  description      TEXT NOT NULL,           -- display label, always required
  quantity         REAL,
  unit             TEXT,                    -- each | L | kg | m | set etc.
  ref_id           TEXT,                    -- tool_types.id or chemicals.id; NULL for freetext
  acknowledged     INTEGER NOT NULL DEFAULT 0,  -- 0|1 artisan sign-off for freetext/personal
  acknowledged_by  TEXT,
  acknowledged_at  TEXT,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT DEFAULT (datetime('now'))
);

-- ── indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tool_types_category  ON tool_types(category);
CREATE INDEX IF NOT EXISTS idx_tools_type_id        ON tools(type_id);
CREATE INDEX IF NOT EXISTS idx_tools_status         ON tools(status);
CREATE INDEX IF NOT EXISTS idx_tools_owner_emp      ON tools(owner_emp_id);
CREATE INDEX IF NOT EXISTS idx_tools_location       ON tools(location_id);
CREATE INDEX IF NOT EXISTS idx_tools_next_insp      ON tools(next_inspection_due);
CREATE INDEX IF NOT EXISTS idx_tool_insp_tool       ON tool_inspections(tool_id);
CREATE INDEX IF NOT EXISTS idx_tool_issues_tool     ON tool_issues(tool_id);
CREATE INDEX IF NOT EXISTS idx_tool_issues_type     ON tool_issues(type_id);
CREATE INDEX IF NOT EXISTS idx_tool_issues_swp      ON tool_issues(swp_id);
CREATE INDEX IF NOT EXISTS idx_tool_issues_emp      ON tool_issues(issued_to_emp);
CREATE INDEX IF NOT EXISTS idx_tool_issues_open     ON tool_issues(returned_at) WHERE returned_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_swp_resources_swp    ON swp_resources(swp_id);
CREATE INDEX IF NOT EXISTS idx_swp_resources_ref    ON swp_resources(ref_id);
