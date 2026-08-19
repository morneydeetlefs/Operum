-- Operum — D1 Schema v1.0
-- Platform spine: employees + asset register.
-- Safety, Maintenance, and Add-on module tables stubbed for future build.
-- Apply: npx wrangler d1 execute operum_main --remote --file=schema.sql

-- ─── Drop existing (safe — dev data only) ───────────────────────────────────

DROP TABLE IF EXISTS access_log;
DROP TABLE IF EXISTS documents;
DROP TABLE IF EXISTS assets;
DROP TABLE IF EXISTS employees;

-- ─── Employees ──────────────────────────────────────────────────────────────
-- Every user of the platform is an employee record.
-- role controls which modules and actions are available.
-- areas is a JSON array of area IDs the employee is assigned to.
-- password_hash stores bcrypt hash — plain text never stored.

CREATE TABLE employees (
  id            TEXT PRIMARY KEY,          -- emp_001, emp_002, etc. — set by admin
  name          TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  phone         TEXT,
  role          TEXT NOT NULL DEFAULT 'artisan' CHECK(role IN (
                  'admin','safety_manager','maintenance_planner',
                  'supervisor','artisan','operator','read_only','contractor'
                )),
  areas         TEXT NOT NULL DEFAULT '[]',  -- JSON array: ["bay_a","bay_b"]
  active        INTEGER NOT NULL DEFAULT 1,
  password_hash TEXT,                        -- null until first login set
  created_by    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Asset register ─────────────────────────────────────────────────────────
-- Single self-referencing table — arbitrary depth hierarchy.
-- Proven pattern from DiagnosticWand v4.0.
-- id = full constructed path: "03 CV-180 GB-1"
-- suffix = only the portion the user typed: "GB-1"
-- parent_id = null means root node (a site or plant).
-- node_type is display/filter only — tree logic does not depend on it.
-- is_measurable = 1 means DiagnosticWand readings can attach here.

CREATE TABLE assets (
  id              TEXT PRIMARY KEY,
  parent_id       TEXT REFERENCES assets(id) ON DELETE RESTRICT,
  suffix          TEXT NOT NULL,
  label           TEXT NOT NULL,
  node_type       TEXT NOT NULL DEFAULT 'machine' CHECK(node_type IN (
                    'site','plant','system','machine','component',
                    'auxiliary','consumable','maintainable'
                  )),
  criticality     TEXT NOT NULL DEFAULT 'medium' CHECK(criticality IN (
                    'critical','high','medium','low'
                  )),
  is_measurable   INTEGER NOT NULL DEFAULT 0,
  -- hazards and isolation points — JSON arrays for flexibility
  hazards         TEXT NOT NULL DEFAULT '[]',   -- ["electrical","rotating","hot"]
  isolation_pts   TEXT NOT NULL DEFAULT '[]',   -- ["ISO-01","ISO-02"]
  -- physical location
  plant_area      TEXT,
  lat             REAL,
  lon             REAL,
  alt             REAL,
  -- metadata
  machine_type    TEXT,
  manufacturer    TEXT,
  model           TEXT,
  serial_no       TEXT,
  install_date    TEXT,
  created_by      TEXT REFERENCES employees(id),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Documents ──────────────────────────────────────────────────────────────
-- Attached to any asset node. Stores URL + metadata only — files hosted externally.

CREATE TABLE documents (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id    TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  doc_type    TEXT NOT NULL CHECK(doc_type IN (
                'swp','manual','msds','certificate','drawing','photo','other'
              )),
  title       TEXT NOT NULL,
  url         TEXT NOT NULL,
  uploaded_by TEXT REFERENCES employees(id),
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Access log ─────────────────────────────────────────────────────────────
-- Every significant action logged. Legally defensible audit trail.

CREATE TABLE access_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id TEXT,
  action      TEXT NOT NULL,    -- 'login','view','create','update','delete','export'
  resource    TEXT NOT NULL,    -- 'asset:03 CV-180', 'employee:emp_001'
  detail      TEXT,             -- JSON — extra context
  ip_address  TEXT,
  timestamp   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX idx_assets_parent    ON assets(parent_id);
CREATE INDEX idx_assets_type      ON assets(node_type);
CREATE INDEX idx_assets_crit      ON assets(criticality);
CREATE INDEX idx_docs_asset       ON documents(asset_id);
CREATE INDEX idx_log_employee     ON access_log(employee_id);
CREATE INDEX idx_log_timestamp    ON access_log(timestamp DESC);
CREATE INDEX idx_employees_role   ON employees(role);
CREATE INDEX idx_employees_email  ON employees(email);

-- ─── Seed data — dev only ───────────────────────────────────────────────────
-- One admin user. Password hash is bcrypt of "admin123" — change before production.

INSERT INTO employees (id, name, email, role, areas, password_hash, created_by)
VALUES (
  'emp_001',
  'Site Administrator',
  'admin@site.local',
  'admin',
  '["all"]',
  '$2b$10$placeholder_change_before_prod',
  'system'
);
