-- ── Toolbox Talks — schema additions ────────────────────────────────────────
-- Append these statements to schema.sql and run:
--   npx wrangler d1 execute operum_main --remote --env="" --file=safety_talks.sql

CREATE TABLE IF NOT EXISTS toolbox_talks (
  id           TEXT PRIMARY KEY,          -- server-generated e.g. TBT-2026-001
  title        TEXT NOT NULL,
  conducted_by TEXT NOT NULL,             -- employee id (employees.id)
  area         TEXT,                      -- plant area
  shift        TEXT CHECK(shift IN ('day','night') OR shift IS NULL),
  talk_date    TEXT NOT NULL,             -- ISO date YYYY-MM-DD
  notes        TEXT,
  created_at   TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS talk_attendance (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  talk_id   TEXT NOT NULL REFERENCES toolbox_talks(id) ON DELETE CASCADE,
  emp_id    TEXT NOT NULL,               -- employees.id
  signed    INTEGER NOT NULL DEFAULT 0, -- 0 = unsigned, 1 = signed
  signed_at TEXT                         -- ISO timestamp
);

CREATE INDEX IF NOT EXISTS idx_talks_date  ON toolbox_talks(talk_date DESC);
CREATE INDEX IF NOT EXISTS idx_talks_area  ON toolbox_talks(area);
CREATE INDEX IF NOT EXISTS idx_attend_talk ON talk_attendance(talk_id);
CREATE INDEX IF NOT EXISTS idx_attend_emp  ON talk_attendance(emp_id);
