INSERT INTO swps (id, asset_id, title, status,
                  submitted_by, reviewer_emp_id, approver_emp_id,
                  approved_by, approved_at, created_by, created_at, updated_at) VALUES
  ('SWP-2026-001', 'AST-CMP-CV101-GB',
   'Drive Gearbox - Planned Oil Change',
   'approved',
   'emp_ar1', 'emp_sv1', 'emp_am1',
   'emp_sm1', datetime('now', '-2 days'),
   'emp_ar1', datetime('now', '-5 days'), datetime('now', '-2 days'));

INSERT INTO swp_steps (swp_id, step_order, description, hazards, ppe_required, precautions) VALUES
  ('SWP-2026-001', 1,
   'Isolate and lock out conveyor drive at MCC panel ISO-CV101-E1 and ISO-CV101-E2. Apply personal lock and tag.',
   '["electrical","stored energy"]',
   '["safety glasses","leather gloves"]',
   'Verify zero energy state with approved test instrument before proceeding.'),

  ('SWP-2026-001', 2,
   'Position oil drain tray (minimum 20L capacity) beneath gearbox drain plug. Confirm tray is stable.',
   '["hot surface","oil under pressure"]',
   '["safety glasses","nitrile gloves","face shield"]',
   'Oil may be hot. Allow gearbox to cool for minimum 30 minutes after shutdown before opening drain.'),

  ('SWP-2026-001', 3,
   'Remove drain plug using 24mm combination spanner. Allow oil to drain fully into tray.',
   '["hot surface","hazardous substance"]',
   '["nitrile gloves","face shield","safety glasses"]',
   'Do not allow oil to contact skin. Dispose of used oil in designated waste oil container only.'),

  ('SWP-2026-001', 4,
   'Replace drain plug. Fill gearbox with EP2 grease via filler point to correct level per OEM specification.',
   '["hazardous substance"]',
   '["nitrile gloves","safety glasses"]',
   'Do not overfill. Check level using dipstick before replacing filler cap.'),

  ('SWP-2026-001', 5,
   'Remove isolation locks and tags in reverse order. Restore power at MCC. Test conveyor at no load for 5 minutes and check for leaks.',
   '["rotating","electrical"]',
   '["safety glasses","hearing protection"]',
   'Ensure all personnel are clear of conveyor before energising. Stand clear of drive end during test run.');

-- Resources for SWP-2026-001
INSERT INTO swp_resources (swp_id, resource_type, resource_source, description, quantity, unit,
                           ref_id, acknowledged, sort_order) VALUES
  ('SWP-2026-001', 'tool',       'register',  'Combination Spanner Set (metric)', 1, 'set',  'TTY-2026-004', 0, 1),
  ('SWP-2026-001', 'chemical',   'register',  'Lithium EP2 Grease',              5, 'kg',   'CHM-2026-001', 0, 2),
  ('SWP-2026-001', 'consumable', 'freetext',  'Oil drain tray 20L',              1, 'each', NULL,           0, 3),
  ('SWP-2026-001', 'consumable', 'freetext',  'Lint-free rags',                  1, 'set',  NULL,           0, 4);

-- Status history for SWP-2026-001 (full chain)
INSERT INTO swp_status_history (swp_id, from_status, to_status, acted_by, elevation_id, comment, acted_at) VALUES
  ('SWP-2026-001', 'draft',            'pending_review',   'emp_ar1', NULL, NULL, datetime('now', '-4 days')),
  ('SWP-2026-001', 'pending_review',   'pending_approval', 'emp_sv1', NULL, NULL, datetime('now', '-3 days')),
  ('SWP-2026-001', 'pending_approval', 'pending_safety',   'emp_am1', NULL, NULL, datetime('now', '-3 days', '+2 hours')),
  ('SWP-2026-001', 'pending_safety',   'approved',         'emp_sm1', NULL, NULL, datetime('now', '-2 days'));

-- -

-- SWP 2: PMP-001 Mechanical Seal Replacement - DRAFT (for testing submit chain)
INSERT INTO swps (id, asset_id, title, status,
                  submitted_by, reviewer_emp_id, approver_emp_id,
                  approved_by, approved_at, created_by, created_at, updated_at) VALUES
  ('SWP-2026-002', 'AST-CMP-PMP001-SK',
   'Mechanical Seal - Replacement',
   'draft',
   NULL, NULL, NULL,
   NULL, NULL,
   'emp_ar2', datetime('now', '-1 day'), datetime('now', '-1 day'));

INSERT INTO swp_steps (swp_id, step_order, description, hazards, ppe_required, precautions) VALUES
  ('SWP-2026-002', 1,
   'Isolate pump at local isolator ISO-PMP001-P1 and close suction/discharge valves ISO-PMP001-V1 and ISO-PMP001-V2. Lock and tag all points.',
   '["pressurised system","hazardous fluid","electrical"]',
   '["chemical resistant gloves","face shield","safety glasses","chemical splash apron"]',
   'Caustic soda process fluid. Any contact with skin or eyes - flush immediately with water for 15 minutes and report to safety officer.'),

  ('SWP-2026-002', 2,
   'Drain pump casing via drain port. Collect all fluid in labelled chemical waste container. Do not mix with other waste streams.',
   '["hazardous fluid","corrosive"]',
   '["chemical resistant gloves","face shield","chemical splash apron"]',
   'Confirm zero pressure on pump casing pressure gauge before opening drain.'),

  ('SWP-2026-002', 3,
   'Remove pump coupling guard. Disconnect coupling halves and move motor clear on slide rails.',
   '["rotating","pinch point"]',
   '["safety glasses","leather gloves"]',
   NULL),

  ('SWP-2026-002', 4,
   'Remove seal gland bolts (4x M16). Slide seal assembly off shaft. Note orientation of all components for reassembly.',
   '["hazardous fluid residue"]',
   '["chemical resistant gloves","safety glasses"]',
   'Photograph seal assembly before removal. Compare new seal to removed seal before fitting.'),

  ('SWP-2026-002', 5,
   'Clean shaft and seal housing with clean solvent wipe. Fit new seal assembly. Torque gland bolts to 45 Nm in cross pattern.',
   '["hazardous substance"]',
   '["nitrile gloves","safety glasses"]',
   'Do not use petroleum-based solvents - incompatible with caustic soda residue. Use water-based degreaser only.'),

  ('SWP-2026-002', 6,
   'Reconnect motor. Refit coupling and coupling guard. Slowly open suction valve and vent pump to remove air. Check seal faces for weeping before opening discharge valve.',
   '["pressurised system","hazardous fluid"]',
   '["chemical resistant gloves","face shield","safety glasses"]',
   'Keep face and body clear of gland area during initial pressurisation. Zero leakage required - do not commission if seal weeps.'),

  ('SWP-2026-002', 7,
   'Remove all locks and tags. Restore power. Run pump for 10 minutes and inspect seal for leaks. Record seal replacement in maintenance history.',
   '["rotating","hazardous fluid","electrical"]',
   '["safety glasses","chemical resistant gloves"]',
   NULL);

-- Resources for SWP-2026-002
INSERT INTO swp_resources (swp_id, resource_type, resource_source, description, quantity, unit,
                           ref_id, acknowledged, sort_order) VALUES
  ('SWP-2026-002', 'tool',       'register',  'Combination Spanner Set (metric)', 1, 'set',  'TTY-2026-004', 0, 1),
  ('SWP-2026-002', 'tool',       'register',  'Vernier Caliper 300mm',            1, 'each', 'TTY-2026-002', 0, 2),
  ('SWP-2026-002', 'consumable', 'freetext',  'Mechanical seal kit (OEM part)',   1, 'each', NULL,           0, 3),
  ('SWP-2026-002', 'consumable', 'freetext',  'Water-based degreaser',            1, 'L',    NULL,           0, 4),
  ('SWP-2026-002', 'consumable', 'freetext',  'Chemical waste container (20L)',   1, 'each', NULL,           0, 5);

-- =
-- TOOLBOX TALK
-- =
