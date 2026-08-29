-- ============================================================
-- Operum — Incident Investigation Module
-- Additive migration — safe to apply on top of existing schema
-- OHSA Act 85 of 1993 + General Administrative Regulations
-- ============================================================

-- Core incident record (maps to OHSA Annexure 2)
CREATE TABLE incidents (
  id                           TEXT PRIMARY KEY,         -- e.g. INC-2026-001
  reported_by                  TEXT NOT NULL,            -- actor.sub from JWT
  reported_at                  TEXT NOT NULL DEFAULT (datetime('now')),
  incident_at                  TEXT NOT NULL,            -- when the incident occurred
  location_asset_id            TEXT,                     -- FK → assets (nullable)
  location_freetext            TEXT,                     -- area/zone description
  description                  TEXT NOT NULL,
  classification               TEXT NOT NULL CHECK (classification IN (
                                 'section_24_serious',
                                 'section_24_other',
                                 'medical_treatment',
                                 'near_miss'
                               )),
  affected_person_name         TEXT NOT NULL,
  affected_person_id           TEXT,                     -- FK → employees (nullable for contractors)
  affected_person_type         TEXT NOT NULL CHECK (affected_person_type IN ('employee', 'contractor')),
  body_part                    TEXT,
  injury_effect                TEXT CHECK (injury_effect IN (
                                 'death',
                                 'unconscious',
                                 'limb_loss',
                                 'incapacity_14d',
                                 'dangerous_substance',
                                 'pressure_release',
                                 'machinery_failure',
                                 'machinery_runaway',
                                 'other',
                                 NULL
                               )),
  machinery_involved           TEXT,

  -- External reporting (Section 24 only — NULL for near_miss and medical_treatment)
  immediate_notification_sent  INTEGER NOT NULL DEFAULT 0 CHECK (immediate_notification_sent IN (0,1)),
  immediate_notification_at    TEXT,
  immediate_notification_by    TEXT,                     -- actor.sub
  formal_report_due_at         TEXT,                     -- system-set: reported_at + 7 days
  formal_report_sent           INTEGER NOT NULL DEFAULT 0 CHECK (formal_report_sent IN (0,1)),
  formal_report_sent_at        TEXT,

  status                       TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
                                 'open',
                                 'under_investigation',
                                 'pending_committee',
                                 'closed'
                               )),
  created_at                   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Investigation findings
CREATE TABLE incident_investigations (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id           TEXT NOT NULL REFERENCES incidents(id),
  investigator_id       TEXT NOT NULL,                   -- FK → employees
  assigned_at           TEXT NOT NULL DEFAULT (datetime('now')),
  assigned_by           TEXT NOT NULL,                   -- actor.sub
  investigation_due_at  TEXT NOT NULL,                   -- system-set: incident_at + 3 days
  findings              TEXT,
  root_cause            TEXT,
  corrective_actions    TEXT,
  completed_at          TEXT                             -- NULL until submitted
);

-- Committee review and endorsement (immutable once endorsed)
CREATE TABLE incident_committee_reviews (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id             TEXT NOT NULL REFERENCES incidents(id),
  meeting_date            TEXT NOT NULL,
  chairperson_id          TEXT NOT NULL,                 -- FK → employees
  chairperson_endorsed_at TEXT,                          -- immutable once set
  employer_id             TEXT NOT NULL,                 -- FK → employees (endorsing employer rep)
  employer_endorsed_at    TEXT,                          -- immutable once set
  committee_remarks       TEXT
);

-- Witnesses (preserved for formal inquiry / subpoena purposes)
CREATE TABLE incident_witnesses (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id          TEXT NOT NULL REFERENCES incidents(id),
  witness_name         TEXT NOT NULL,
  witness_employee_id  TEXT,                             -- FK → employees (nullable for contractors)
  contact_details      TEXT NOT NULL,                    -- required — needed for subpoena
  statement            TEXT
);

CREATE INDEX idx_incidents_status     ON incidents(status);
CREATE INDEX idx_incidents_reported   ON incidents(reported_at DESC);
CREATE INDEX idx_incidents_asset      ON incidents(location_asset_id);
CREATE INDEX idx_inv_incident         ON incident_investigations(incident_id);
CREATE INDEX idx_review_incident      ON incident_committee_reviews(incident_id);
CREATE INDEX idx_witness_incident     ON incident_witnesses(incident_id);
