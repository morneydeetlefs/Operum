INSERT INTO toolbox_talks (id, title, conducted_by, area, shift, talk_date, notes, created_at) VALUES
  ('TBT-2026-001',
   'Working Safely Around Conveyors - Pinch Points and Isolation',
   'emp_sv1', 'Conveyors Bay', 'day',
   date('now', '-3 days'),
   'Focused on CV-101 and CV-102 isolation procedures following recent near-miss at drive end. Attendance mandatory for all Conveyors Bay personnel.',
   datetime('now', '-3 days'));

-- Attendees + sign-off
INSERT INTO talk_attendance (talk_id, emp_id, signed, signed_at) VALUES
  ('TBT-2026-001', 'emp_sv1', 1, datetime('now', '-3 days')),
  ('TBT-2026-001', 'emp_ar1', 1, datetime('now', '-3 days')),
  ('TBT-2026-001', 'emp_op1', 1, datetime('now', '-3 days'));

-- =
-- BBS OBSERVATION
-- =

INSERT INTO bbs_observations (asset_id, swp_id, observed_by, observed_person, area,
                               shift, observed_at, status,
                               conversation_held, followup_required, followup_notes, created_at) VALUES
  ('AST-MCH-CV101', 'SWP-2026-001', 'emp_sv1',
   'Artisan - Conveyors Bay team (3 persons)',
   'CV-101 Drive End',
   'day', datetime('now', '-2 days'), 'closed',
   1, 0, NULL, datetime('now', '-2 days'));

-- =
-- INCIDENT
-- =

INSERT INTO incidents (id, reported_by, reported_at, incident_at,
                       location_asset_id, location_freetext,
                       description, classification,
                       affected_person_name, affected_person_type,
                       status, created_at) VALUES
  ('INC-2026-001',
   'emp_ar2', datetime('now', '-6 days'), datetime('now', '-6 days'),
   'AST-MCH-PMP001', 'PMP-001 - west side access walkway',
   'Artisan slipped on wet floor in pump station while carrying tools. No injury. Floor wet due to minor packing gland weep on PMP-001 that had not been reported. Immediate clean-up completed. Gland weep raised as fault notification.',
   'near_miss',
   'Lungelo Mthembu', 'employee',
   'open', datetime('now', '-6 days'));

-- =
-- DIAGNOSTIC LOGS (condition monitoring baselines)
-- =

INSERT INTO diagnostic_logs (asset_id, device_id, recorded_by, timestamp,
                              rms_accel, peak_g, crest_factor, kurtosis, sound_db) VALUES
  -- CV-101 Gearbox - healthy baseline readings
  ('AST-CMP-CV101-GB', 'WAND-DEV-001', 'emp_ar1', datetime('now', '-7 days'),
   0.42, 1.38, 3.29, 0.81, 72.4),
  ('AST-CMP-CV101-GB', 'WAND-DEV-001', 'emp_ar1', datetime('now', '-4 days'),
   0.44, 1.41, 3.20, 0.75, 71.9),

  -- PMP-001 - elevated vibration trending upward (indicative of seal wear)
  ('AST-MCH-PMP001', 'WAND-DEV-001', 'emp_ar2', datetime('now', '-10 days'),
   0.61, 2.14, 3.51, 1.12, 76.2),
  ('AST-MCH-PMP001', 'WAND-DEV-001', 'emp_ar2', datetime('now', '-6 days'),
   0.79, 3.02, 3.82, 1.89, 78.5),
  ('AST-MCH-PMP001', 'WAND-DEV-001', 'emp_ar2', datetime('now', '-2 days'),
   1.04, 4.37, 4.20, 2.74, 81.3);

