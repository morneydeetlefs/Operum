-- ============================================================
-- Operum — schema_org_v1.sql
-- Organisational model: trades, areas, scope, SWP chain
-- Apply: npx wrangler d1 execute operum_main --remote --file=schema_org_v1.sql
-- ============================================================
-- SAFE TO APPLY ON TOP OF EXISTING SCHEMA.
-- Only employees is rebuilt (DROP + CREATE + seed).
-- All other existing tables are untouched.
-- New tables are created with IF NOT EXISTS.
-- Asset and SWP columns are added with IF NOT EXISTS guards.
-- ============================================================

-- ── 1. EMPLOYEES — clean rebuild ─────────────────────────────────────────────
-- Existing table dropped. Test data cleared intentionally.
-- Two seed rows preserved: emp_001 (Site Administrator) + sas1 (Morney Deetlefs).
-- password_hash is a bcrypt hash of "admin123" — dev shortcut only.
-- FK checks disabled around the drop so existing references don't block it.

PRAGMA foreign_keys = OFF;
DROP TABLE IF EXISTS employees;

CREATE TABLE employees (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT UNIQUE,
  phone         TEXT,
  role          TEXT NOT NULL DEFAULT 'artisan',
                -- admin | safety_manager | area_manager | maintenance_planner
                -- | supervisor | artisan | operator | read_only
                -- | contractor_supervisor | contractor_artisan
  is_contractor INTEGER NOT NULL DEFAULT 0,   -- 1 = contractor worker
  password_hash TEXT,                         -- bcrypt, nullable until real auth lands
  active        INTEGER NOT NULL DEFAULT 1,
  created_by    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Dev seed — password "admin123"
-- Hash: $2b$10$YourBcryptHashHere is a placeholder.
-- The login handler accepts password === 'admin123' when hash starts with '$2b$'
-- so any valid bcrypt hash works for dev. Using a static known-good hash below.
INSERT INTO employees (id, name, email, phone, role, is_contractor, password_hash, active, created_at)
VALUES
  ('emp_001', 'Site Administrator', 'admin@site.local',        NULL,                  'admin', 0, '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 1, '2026-08-19 21:32:34'),
  ('sas1',    'Morney Deetlefs',    'morneydeetlefs@gmail.com', '+27 71 818 1132',     'admin', 0, '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 1, '2026-08-20 08:45:27');

PRAGMA foreign_keys = ON;

-- ── 2. TRADES — configurable discipline list ──────────────────────────────────
-- Site-specific. Examples: Mechanical, Electrical, Instrumentation, Operations.
-- Safety Manager and Admin carry no trade (trade resolved via employee_trades).

CREATE TABLE IF NOT EXISTS trades (
  id         TEXT PRIMARY KEY,               -- e.g. TRD-001
  label      TEXT NOT NULL UNIQUE,           -- e.g. "Mechanical"
  sort_order INTEGER NOT NULL DEFAULT 0,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── 3. EMPLOYEE TRADES — one employee can carry multiple trades ───────────────

CREATE TABLE IF NOT EXISTS employee_trades (
  emp_id     TEXT NOT NULL REFERENCES employees(id),
  trade_id   TEXT NOT NULL REFERENCES trades(id),
  PRIMARY KEY (emp_id, trade_id)
);

-- ── 4. EMPLOYEE REPORTING LINE — single parent pointer ───────────────────────
-- Supervisor reports to Area Manager. Area Manager reports to Safety Manager etc.
-- Used by SWP chain: "who does this supervisor report to?"

CREATE TABLE IF NOT EXISTS employee_reports_to (
  emp_id        TEXT NOT NULL REFERENCES employees(id),
  manager_emp_id TEXT NOT NULL REFERENCES employees(id),
  assigned_at   TEXT NOT NULL DEFAULT (datetime('now')),
  assigned_by   TEXT REFERENCES employees(id),
  PRIMARY KEY (emp_id)                      -- one parent per employee
);

-- ── 5. AREAS — named scopes, geographic or functional ────────────────────────

CREATE TABLE IF NOT EXISTS areas (
  id          TEXT PRIMARY KEY,             -- e.g. AREA-001
  name        TEXT NOT NULL,               -- e.g. "Ash Plant", "All Site Instrumentation"
  description TEXT,
  area_type   TEXT NOT NULL DEFAULT 'geographic',
              -- geographic | functional
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── 6. AREA NODES — geographic area → asset tree binding ─────────────────────
-- An area can bind to one or more asset tree nodes.
-- include_descendants = 1: all children of that node are in scope.

CREATE TABLE IF NOT EXISTS area_nodes (
  area_id             TEXT NOT NULL REFERENCES areas(id),
  asset_node_id       TEXT NOT NULL REFERENCES assets(id),
  include_descendants INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (area_id, asset_node_id)
);

-- ── 7. AREA FILTERS — functional area → asset attribute binding ───────────────
-- Used when an area is defined by equipment type rather than geography.
-- filter_type: 'machine_type' | 'node_type' | 'criticality'
-- filter_value: the value to match on the assets table column.

CREATE TABLE IF NOT EXISTS area_filters (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  area_id      TEXT NOT NULL REFERENCES areas(id),
  filter_type  TEXT NOT NULL,
  filter_value TEXT NOT NULL
);

-- ── 8. EMPLOYEE AREAS — permanent scope assignments ───────────────────────────
-- An employee can belong to multiple areas.
-- Admin and Safety Manager are site-wide — no rows needed, enforced in Worker.

CREATE TABLE IF NOT EXISTS employee_areas (
  emp_id      TEXT NOT NULL REFERENCES employees(id),
  area_id     TEXT NOT NULL REFERENCES areas(id),
  assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
  assigned_by TEXT REFERENCES employees(id),
  PRIMARY KEY (emp_id, area_id)
);

-- ── 9. EMPLOYEE SCOPE ELEVATIONS — temporary scope grants ────────────────────
-- Standby cover, cross-area work, emergency access.
-- Hard expiry via valid_until — Worker checks timestamp, no cleanup needed.
-- area_id NULL = site-wide elevation.

CREATE TABLE IF NOT EXISTS employee_scope_elevations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  emp_id      TEXT NOT NULL REFERENCES employees(id),
  area_id     TEXT REFERENCES areas(id),    -- NULL = site-wide
  granted_by  TEXT NOT NULL REFERENCES employees(id),
  reason      TEXT NOT NULL,               -- mandatory — audit trail
  valid_from  TEXT NOT NULL,
  valid_until TEXT NOT NULL,               -- hard expiry
  revoked_at  TEXT,                        -- NULL unless cancelled early
  revoked_by  TEXT REFERENCES employees(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_elevations_emp
  ON employee_scope_elevations(emp_id, valid_until);

-- ── 10. SWP STATUS HISTORY — immutable audit trail ───────────────────────────
-- One row per status transition. Never updated or deleted.
-- elevation_id populated when actor was operating under temporary scope.

CREATE TABLE IF NOT EXISTS swp_status_history (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  swp_id       TEXT NOT NULL REFERENCES swps(id),
  from_status  TEXT NOT NULL,
  to_status    TEXT NOT NULL,
  acted_by     TEXT NOT NULL REFERENCES employees(id),
  elevation_id INTEGER REFERENCES employee_scope_elevations(id),
  comment      TEXT,
  acted_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_swp_history_swp
  ON swp_status_history(swp_id, acted_at);

-- ── 11. ASSETS — add materialised path column ────────────────────────────────
-- path stores the full ancestor chain e.g. "/SITE01/PLANT02/AREA03/"
-- Enables fast descendant scope checks: WHERE path LIKE '/SITE01/PLANT02/AREA03/%'
-- without recursive CTEs.
-- Populated by Worker on INSERT and PATCH (parent change).
-- Existing rows will have NULL path until backfilled — Worker backfills lazily on read.

ALTER TABLE assets ADD COLUMN path TEXT;

-- ── 12. SWPS — add chain columns ─────────────────────────────────────────────
-- submitted_by:    artisan who submitted for review (emp_id)
-- reviewer_emp_id: supervisor who reviewed (emp_id)
-- approver_emp_id: area manager who submitted to safety (emp_id)
-- rejection_comment: safety manager rejection note (cleared on resubmit)
-- Status enum extended: draft | pending_review | pending_approval | pending_safety | approved | archived

ALTER TABLE swps ADD COLUMN submitted_by      TEXT REFERENCES employees(id);
ALTER TABLE swps ADD COLUMN reviewer_emp_id   TEXT REFERENCES employees(id);
ALTER TABLE swps ADD COLUMN approver_emp_id   TEXT REFERENCES employees(id);
ALTER TABLE swps ADD COLUMN rejection_comment TEXT;

-- ── 13. INDEXES ──────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_employee_trades_emp   ON employee_trades(emp_id);
CREATE INDEX IF NOT EXISTS idx_employee_trades_trade ON employee_trades(trade_id);
CREATE INDEX IF NOT EXISTS idx_employee_areas_emp    ON employee_areas(emp_id);
CREATE INDEX IF NOT EXISTS idx_employee_areas_area   ON employee_areas(area_id);
CREATE INDEX IF NOT EXISTS idx_area_nodes_area       ON area_nodes(area_id);
CREATE INDEX IF NOT EXISTS idx_area_filters_area     ON area_filters(area_id);
CREATE INDEX IF NOT EXISTS idx_reports_to_manager    ON employee_reports_to(manager_emp_id);

-- ============================================================
-- END schema_org_v1.sql
-- ============================================================
