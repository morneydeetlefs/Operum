INSERT INTO tool_types (id, category, name, description, wll_kg, wll_unit,
                        ppe_spec, inspection_interval_days, quantity_unit, created_by, created_at) VALUES
  ('TTY-2026-001', 'lifting_tackle', 'Chain Block 2T',
   'Grade 80 chain block, 2 tonne WLL, 3m lift', 2000, 'kg',
   NULL, 365, 'each', 'emp_001', datetime('now')),

  ('TTY-2026-002', 'instrument', 'Vernier Caliper 300mm',
   'Stainless steel, 0.02mm resolution, digital readout', NULL, NULL,
   NULL, 365, 'each', 'emp_001', datetime('now')),

  ('TTY-2026-003', 'ppe', 'Full-Body Safety Harness',
   'Fall arrest harness, SANS 50361 compliant', NULL, NULL,
   'SANS 50361:2008', 365, 'each', 'emp_001', datetime('now')),

  ('TTY-2026-004', 'general_tool', 'Combination Spanner Set (metric)',
   '6mm-32mm, chrome vanadium, 14-piece set', NULL, NULL,
   NULL, NULL, 'set', 'emp_001', datetime('now'));

-- =
-- TOOL INSTANCES
-- =

INSERT INTO tools (id, type_id, tag_number, serial_number, manufacturer, model,
                   ownership, owner_emp_id, location_id,
                   last_inspected_at, next_inspection_due, inspector_name,
                   certificate_ref, status, created_by, created_at) VALUES

  -- Chain blocks (2 units)
  ('LFT-2026-001', 'TTY-2026-001', 'CB-001', 'SN-CB2024-0081', 'Yale Industrial', 'Y-200-K',
   'site', NULL, 'AST-SYS-001',
   '2026-03-15', '2027-03-15', 'Johan Venter',
   'CERT-CB-2026-001', 'in_service', 'emp_001', datetime('now')),

  ('LFT-2026-002', 'TTY-2026-001', 'CB-002', 'SN-CB2024-0082', 'Yale Industrial', 'Y-200-K',
   'site', NULL, 'AST-SYS-002',
   '2026-03-15', '2027-03-15', 'Johan Venter',
   'CERT-CB-2026-002', 'in_service', 'emp_001', datetime('now')),

  -- Vernier caliper
  ('INS-2026-001', 'TTY-2026-002', 'VC-001', 'SN-VC2023-0014', 'Mitutoyo', '530-118',
   'site', NULL, 'AST-PLT-001',
   '2025-11-20', '2026-11-20', 'Piet Oberholzer',
   NULL, 'in_service', 'emp_001', datetime('now')),

  -- Safety harnesses (personal - issued to artisans)
  ('PPE-2026-001', 'TTY-2026-003', 'SH-AR1', 'SN-SH2025-0031', 'Protecta', 'PRO-1',
   'personal', 'emp_ar1', NULL,
   '2026-01-10', '2027-01-10', 'Johan Venter',
   NULL, 'in_service', 'emp_001', datetime('now')),

  ('PPE-2026-002', 'TTY-2026-003', 'SH-AR2', 'SN-SH2025-0032', 'Protecta', 'PRO-1',
   'personal', 'emp_ar2', NULL,
   '2026-01-10', '2027-01-10', 'Johan Venter',
   NULL, 'in_service', 'emp_001', datetime('now')),

  -- Spanner sets (2 units)
  ('TLS-2026-001', 'TTY-2026-004', 'SP-001', NULL, 'Gedore', '1100 14',
   'site', NULL, 'AST-PLT-001',
   NULL, NULL, NULL,
   NULL, 'in_service', 'emp_001', datetime('now')),

  ('TLS-2026-002', 'TTY-2026-004', 'SP-002', NULL, 'Gedore', '1100 14',
   'site', NULL, 'AST-PLT-001',
   NULL, NULL, NULL,
   NULL, 'in_service', 'emp_001', datetime('now'));

-- =
-- SAFE WORK PROCEDURES
-- =

-- SWP 1: CV-101 Gearbox Oil Change - APPROVED (full chain exercised)