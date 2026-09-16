-- ── Migration: expand swps.status CHECK constraint ───────────────────────────
-- Adds pending_review, pending_approval, pending_safety to the allowed values.
-- SQLite does not support ALTER TABLE ... MODIFY COLUMN, so we rebuild the
-- table using the standard rename → create → copy → drop pattern.
-- All existing data is preserved. Foreign key references are preserved via
-- ON DELETE RESTRICT / ON DELETE CASCADE on the child tables.
--
-- Run with:
--   npx wrangler d1 execute operum_main --remote --file=migration_swp_chain_status.sql

PRAGMA foreign_keys = OFF;

-- Step 1: rename the existing table
ALTER TABLE swps RENAME TO swps_old;

-- Step 2: recreate with the expanded CHECK constraint + all chain columns
CREATE TABLE swps (
  id               TEXT PRIMARY KEY,
  asset_id         TEXT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  title            TEXT NOT NULL,
  status  TEXT NOT NULL DEFAULT 'draft'
        CHECK(status IN ('draft','pending_review','pending_approval',
                         'pending_safety','approved','archived')),
  submitted_by     TEXT REFERENCES employees(id),
  reviewer_emp_id  TEXT REFERENCES employees(id),
  approver_emp_id  TEXT REFERENCES employees(id),
  rejection_comment TEXT,
  approved_by      TEXT REFERENCES employees(id),
  approved_at      TEXT,
  created_by       TEXT REFERENCES employees(id),
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Step 3: copy all existing data
INSERT INTO swps
  SELECT
    id, asset_id, title, status,
    submitted_by, reviewer_emp_id, approver_emp_id, rejection_comment,
    approved_by, approved_at, created_by, created_at, updated_at
  FROM swps_old;

-- Step 4: drop the old table
DROP TABLE swps_old;

-- Step 5: recreate the index (if it existed)
CREATE INDEX IF NOT EXISTS idx_swps_asset  ON swps(asset_id);
CREATE INDEX IF NOT EXISTS idx_swps_status ON swps(status);

PRAGMA foreign_keys = ON;
