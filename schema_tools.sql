-- ─────────────────────────────────────────────────────────────────────────────
-- Tools Register — schema migration
-- Operum · MD Works · September 2026
--
-- Apply with:
--   npx wrangler d1 execute operum_main --remote --file=schema_tools.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- ── tools ─────────────────────────────────────────────────────────────────────
-- One row per physical tool, instrument, lifting tackle item, or PPE item.
-- ID prefix is category-specific:
--   LFT-YYYY-NNN  lifting tackle  (DMR Regulation 18)
--   INS-YYYY-NNN  calibrated instruments  (GSR 6 / ISO 9001)
--   PPE-YYYY-NNN  PPE stock  (GSR 9)
--   TLS-YYYY-NNN  general tools
--
-- ownership = 'personal' means the tool belongs to an artisan.
-- Personal tools are registered for visibility and inspection tracking but
-- are not issuable from stores — they come with the person.
--
-- status = 'condemned' is set automatically by the Worker when an inspection
-- records result = 'condemned'. It cannot be overridden. The item must be
-- physically destroyed or rendered unusable per DMR requirements.

CREATE TABLE IF NOT EXISTS tools (
  id                      TEXT PRIMARY KEY,       -- LFT/INS/PPE/TLS-YYYY-NNN
  category                TEXT NOT NULL,          -- lifting_tackle | instrument | general_tool | ppe
  name                    TEXT NOT NULL,          -- e.g. "Chain Block 2T", "Fluke 87V Multimeter"
  description             TEXT,                   -- freetext detail, nullable
  tag_number              TEXT,                   -- physical tag / barcode on the item, nullable
  serial_number           TEXT,                   -- manufacturer serial, nullable
  manufacturer            TEXT,
  model                   TEXT,

  -- Ownership
  ownership               TEXT NOT NULL DEFAULT 'site',  -- site | personal
  owner_emp_id            TEXT REFERENCES employees(id), -- set when ownership = personal

  -- Location (site-owned tools belong to a location node in the asset register)
  location_id             TEXT REFERENCES assets(id),    -- nullable for personal tools

  -- Lifting tackle specific (DMR Reg 18)
  wll_kg                  REAL,                   -- working load limit, nullable
  wll_unit                TEXT DEFAULT 'kg',      -- kg | t

  -- Current calibration / inspection metadata (latest values — full history in tool_inspections)
  last_inspected_at       TEXT,                   -- ISO date
  next_inspection_due     TEXT,                   -- ISO date — alert when approaching / overdue
  inspection_interval_days INTEGER,               -- e.g. 365 for annual
  inspector_name          TEXT,
  certificate_ref         TEXT,                   -- certificate number / reference string
  certificate_url         TEXT,                   -- URL to certificate document (Google Drive etc.)

  -- PPE specific (GSR 9)
  ppe_spec                TEXT,                   -- size, standard e.g. "SANS 1397 Class E Size L"
  assigned_emp_id         TEXT REFERENCES employees(id), -- PPE assigned to a specific person

  -- Status
  -- in_service   — available for issue
  -- out_of_service — temporarily removed, hard-blocked from issue
  -- condemned    — permanently blocked; set automatically on condemned inspection result
  -- lost         — reported lost, hard-blocked from issue
  status                  TEXT NOT NULL DEFAULT 'in_service',

  -- Audit
  created_by              TEXT,
  created_at              TEXT DEFAULT (datetime('now')),
  updated_at              TEXT DEFAULT (datetime('now'))
);

-- ── tool_inspections ──────────────────────────────────────────────────────────
-- Full inspection history for every tool.
-- Recording a new inspection automatically updates the parent tools row:
--   last_inspected_at, next_inspection_due, inspector_name,
--   certificate_ref, certificate_url
-- If result = 'condemned', the Worker also sets tools.status = 'condemned'.
-- That status change is permanent — no endpoint allows reverting a condemned tool.

CREATE TABLE IF NOT EXISTS tool_inspections (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  tool_id         TEXT NOT NULL REFERENCES tools(id),
  inspected_at    TEXT NOT NULL,            -- ISO date of inspection
  inspector_name  TEXT NOT NULL,
  result          TEXT NOT NULL,            -- pass | fail | condemned
  findings        TEXT,                     -- freetext — defects noted, actions taken
  certificate_ref TEXT,
  certificate_url TEXT,                     -- URL to new certificate document
  next_due        TEXT,                     -- ISO date; written to tools.next_inspection_due
  recorded_by     TEXT,                     -- actor.sub
  created_at      TEXT DEFAULT (datetime('now'))
);

-- ── tool_issues ───────────────────────────────────────────────────────────────
-- Issue and return records.
-- swp_id is nullable — issues can be against a SWP (job) or an employee (onboarding).
-- At least one of swp_id or issued_to_emp must be present (enforced in Worker).
--
-- Issue hard-blocks:
--   tools.status IN ('condemned', 'out_of_service', 'lost')
--   tools.next_inspection_due < today  (overdue inspection)
--
-- Return: recorded per item individually — tools come back at different times.
-- return_condition: good | damaged | lost
--   damaged → Worker sets tools.status = 'out_of_service' automatically
--   lost    → Worker sets tools.status = 'lost' automatically

CREATE TABLE IF NOT EXISTS tool_issues (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  tool_id          TEXT NOT NULL REFERENCES tools(id),
  swp_id           TEXT REFERENCES swps(id),            -- nullable — job context
  issued_to_emp    TEXT NOT NULL REFERENCES employees(id),
  issued_by        TEXT NOT NULL,                        -- actor.sub
  issued_at        TEXT NOT NULL DEFAULT (datetime('now')),
  expected_return  TEXT,                                 -- ISO datetime, nullable
  returned_at      TEXT,                                 -- null = still out on job
  return_condition TEXT,                                 -- good | damaged | lost
  return_notes     TEXT,
  returned_by      TEXT                                  -- actor.sub at return
);

-- ── swp_resources ─────────────────────────────────────────────────────────────
-- Resources required to execute a SWP — tools, spares, equipment,
-- consumables, and chemicals. Links the SWP to the tools and chemicals registers.
--
-- resource_source:
--   freetext  — common hand tools / consumables; artisan acknowledges they have it
--   register  — links to tools.id (tools/equipment/PPE) or chemicals.id
--   personal  — links to a personal-ownership tools.id; no issue transaction needed
--
-- resource_type:
--   tool | spare | equipment | consumable | chemical
--
-- ref_id:
--   tools.id    when resource_type IN ('tool','equipment','ppe') and source != 'freetext'
--   chemicals.id when resource_type = 'chemical' and source != 'freetext'
--   NULL         when resource_source = 'freetext'
--
-- acknowledged:
--   For freetext and personal items — artisan confirms they have the item.
--   For register items — set automatically when issue transaction is created.

CREATE TABLE IF NOT EXISTS swp_resources (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  swp_id           TEXT NOT NULL REFERENCES swps(id) ON DELETE CASCADE,
  resource_type    TEXT NOT NULL,                        -- tool | spare | equipment | consumable | chemical
  resource_source  TEXT NOT NULL DEFAULT 'freetext',     -- freetext | register | personal
  description      TEXT NOT NULL,                        -- display label, always required
  quantity         REAL,
  unit             TEXT,                                  -- each | L | kg | m | set etc.
  ref_id           TEXT,                                  -- tools.id or chemicals.id, nullable
  acknowledged     INTEGER NOT NULL DEFAULT 0,            -- 0 | 1 — artisan sign-off for freetext/personal
  acknowledged_by  TEXT,                                  -- actor.sub
  acknowledged_at  TEXT,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT DEFAULT (datetime('now'))
);

-- ── indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tools_category       ON tools(category);
CREATE INDEX IF NOT EXISTS idx_tools_status         ON tools(status);
CREATE INDEX IF NOT EXISTS idx_tools_owner_emp      ON tools(owner_emp_id);
CREATE INDEX IF NOT EXISTS idx_tools_location       ON tools(location_id);
CREATE INDEX IF NOT EXISTS idx_tools_next_insp      ON tools(next_inspection_due);
CREATE INDEX IF NOT EXISTS idx_tool_inspections_tool ON tool_inspections(tool_id);
CREATE INDEX IF NOT EXISTS idx_tool_issues_tool     ON tool_issues(tool_id);
CREATE INDEX IF NOT EXISTS idx_tool_issues_swp      ON tool_issues(swp_id);
CREATE INDEX IF NOT EXISTS idx_tool_issues_emp      ON tool_issues(issued_to_emp);
CREATE INDEX IF NOT EXISTS idx_tool_issues_open     ON tool_issues(returned_at) WHERE returned_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_swp_resources_swp    ON swp_resources(swp_id);
CREATE INDEX IF NOT EXISTS idx_swp_resources_ref    ON swp_resources(ref_id);
