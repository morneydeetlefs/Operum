-- =
-- TRADES
-- =

INSERT INTO trades (id, label, sort_order, active) VALUES
  ('TRD-001', 'Mechanical',      1, 1),
  ('TRD-002', 'Electrical',      2, 1),
  ('TRD-003', 'Instrumentation', 3, 1),
  ('TRD-004', 'Civil',           4, 1);

-- =
-- EMPLOYEES
-- emp_001 + sas1 preserved as-is (admin / admin123)
-- New employees all use password admin123 (same bcrypt hash - dev only)
-- =

INSERT INTO employees (id, name, email, phone, role, is_contractor, password_hash, active, created_by, created_at) VALUES
  -- Safety Manager
  ('emp_sm1', 'Johan Venter',    'j.venter@sasol.com',    '+27 17 610 0001', 'safety_manager', 0,
   '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uMe5NWN8W', 1, 'emp_001', datetime('now')),

  -- Area Manager
  ('emp_am1', 'Piet Oberholzer', 'p.oberholzer@sasol.com','+27 17 610 0002', 'area_manager',   0,
   '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uMe5NWN8W', 1, 'emp_001', datetime('now')),

  -- Supervisors
  ('emp_sv1', 'Thabo Nkosi',     't.nkosi@sasol.com',     '+27 17 610 0003', 'supervisor',     0,
   '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uMe5NWN8W', 1, 'emp_001', datetime('now')),
  ('emp_sv2', 'Sizwe Dlamini',   's.dlamini@sasol.com',   '+27 17 610 0004', 'supervisor',     0,
   '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uMe5NWN8W', 1, 'emp_001', datetime('now')),

  -- Artisans
  ('emp_ar1', 'Riaan Botha',     'r.botha@sasol.com',     '+27 17 610 0005', 'artisan',        0,
   '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uMe5NWN8W', 1, 'emp_001', datetime('now')),
  ('emp_ar2', 'Lungelo Mthembu', 'l.mthembu@sasol.com',   '+27 17 610 0006', 'artisan',        0,
   '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uMe5NWN8W', 1, 'emp_001', datetime('now')),

  -- Operator
  ('emp_op1', 'Maria Sithole',   'm.sithole@sasol.com',   '+27 17 610 0007', 'operator',       0,
   '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uMe5NWN8W', 1, 'emp_001', datetime('now'));

-- -- Trade assignments ---------------------------------------------------------
INSERT INTO employee_trades (emp_id, trade_id) VALUES
  ('emp_am1', 'TRD-001'),
  ('emp_sv1', 'TRD-001'),
  ('emp_sv2', 'TRD-001'),
  ('emp_ar1', 'TRD-001'),
  ('emp_ar2', 'TRD-001');

-- -- Reporting lines -----------------------------------------------------------
INSERT INTO employee_reports_to (emp_id, manager_emp_id) VALUES
  ('emp_am1', 'emp_sm1'),
  ('emp_sv1', 'emp_am1'),
  ('emp_sv2', 'emp_am1'),
  ('emp_ar1', 'emp_sv1'),
  ('emp_ar2', 'emp_sv2'),
  ('emp_op1', 'emp_sv1');

-- =
-- ASSET HIERARCHY
-- Sasol Secunda plant centroid: -26.5608, 29.1834
-- Ash Plant offset ~300m north-east of centroid
-- Conveyors Bay and Pump Station offset within Ash Plant footprint
-- =

INSERT INTO assets (id, parent_id, suffix, label, node_type, criticality, is_measurable,
                    hazards, isolation_pts, plant_area, lat, lon, alt, path) VALUES

  -- Site
  ('AST-SITE-001', NULL,
   'SAS', 'Sasol Secunda', 'site', 'medium', 0,
   '[]', '[]', NULL, -26.5608, 29.1834, 1540.0,
   '/AST-SITE-001'),

  -- Plant
  ('AST-PLT-001', 'AST-SITE-001',
   'ASH', 'Ash Plant', 'plant', 'high', 0,
   '[]', '[]', 'Ash Plant', -26.5595, 29.1851, 1539.0,
   '/AST-SITE-001/AST-PLT-001'),

  -- Systems / Areas
  ('AST-SYS-001', 'AST-PLT-001',
   'CV', 'Conveyors Bay', 'system', 'high', 0,
   '[]', '[]', 'Conveyors Bay', -26.5592, 29.1848, 1538.5,
   '/AST-SITE-001/AST-PLT-001/AST-SYS-001'),

  ('AST-SYS-002', 'AST-PLT-001',
   'PS', 'Pump Station', 'system', 'critical', 0,
   '[]', '[]', 'Pump Station', -26.5598, 29.1855, 1538.0,
   '/AST-SITE-001/AST-PLT-001/AST-SYS-002'),

  -- Conveyors Bay machines
  ('AST-MCH-CV101', 'AST-SYS-001',
   'CV-101', 'Belt Conveyor CV-101', 'machine', 'critical', 1,
   '["rotating","pinch point","electrical","dust"]',
   '["ISO-CV101-E1","ISO-CV101-E2"]',
   'Conveyors Bay', -26.5591, 29.1846, 1538.0,
   '/AST-SITE-001/AST-PLT-001/AST-SYS-001/AST-MCH-CV101'),

  ('AST-MCH-CV102', 'AST-SYS-001',
   'CV-102', 'Belt Conveyor CV-102', 'machine', 'high', 1,
   '["rotating","pinch point","electrical"]',
   '["ISO-CV102-E1"]',
   'Conveyors Bay', -26.5593, 29.1849, 1538.0,
   '/AST-SITE-001/AST-PLT-001/AST-SYS-001/AST-MCH-CV102'),

  -- CV-101 components
  ('AST-CMP-CV101-GB', 'AST-MCH-CV101',
   'GB-1', 'Drive Gearbox', 'component', 'critical', 1,
   '["rotating","hot surface","oil under pressure"]',
   '["ISO-CV101-E1"]',
   'Conveyors Bay', -26.5591, 29.1846, 1538.2,
   '/AST-SITE-001/AST-PLT-001/AST-SYS-001/AST-MCH-CV101/AST-CMP-CV101-GB'),

  ('AST-CMP-CV101-MT', 'AST-MCH-CV101',
   'MT-1', 'Drive Motor', 'component', 'high', 1,
   '["electrical","rotating"]',
   '["ISO-CV101-E2"]',
   'Conveyors Bay', -26.5591, 29.1845, 1538.2,
   '/AST-SITE-001/AST-PLT-001/AST-SYS-001/AST-MCH-CV101/AST-CMP-CV101-MT'),

  -- Pump Station machines
  ('AST-MCH-PMP001', 'AST-SYS-002',
   'PMP-001', 'Feed Pump PMP-001', 'machine', 'critical', 1,
   '["rotating","hazardous fluid","hot surface","pressurised system"]',
   '["ISO-PMP001-P1","ISO-PMP001-V1","ISO-PMP001-V2"]',
   'Pump Station', -26.5597, 29.1854, 1537.8,
   '/AST-SITE-001/AST-PLT-001/AST-SYS-002/AST-MCH-PMP001'),

  ('AST-MCH-PMP002', 'AST-SYS-002',
   'PMP-002', 'Feed Pump PMP-002', 'machine', 'high', 1,
   '["rotating","hazardous fluid","pressurised system"]',
   '["ISO-PMP002-P1","ISO-PMP002-V1"]',
   'Pump Station', -26.5599, 29.1856, 1537.8,
   '/AST-SITE-001/AST-PLT-001/AST-SYS-002/AST-MCH-PMP002'),

  -- PMP-001 components
  ('AST-CMP-PMP001-SK', 'AST-MCH-PMP001',
   'SK-1', 'Mechanical Seal', 'component', 'critical', 0,
   '["hazardous fluid","pressurised system"]',
   '["ISO-PMP001-P1"]',
   'Pump Station', -26.5597, 29.1854, 1537.9,
   '/AST-SITE-001/AST-PLT-001/AST-SYS-002/AST-MCH-PMP001/AST-CMP-PMP001-SK'),

  ('AST-CMP-PMP001-MT', 'AST-MCH-PMP001',
   'MT-1', 'Drive Motor', 'component', 'high', 1,
   '["electrical","rotating"]',
   '["ISO-PMP001-V2"]',
   'Pump Station', -26.5597, 29.1853, 1537.9,
   '/AST-SITE-001/AST-PLT-001/AST-SYS-002/AST-MCH-PMP001/AST-CMP-PMP001-MT');

-- =
-- AREAS + SCOPE BINDINGS
-- =

INSERT INTO areas (id, name, area_type, active) VALUES
  ('area_conv', 'Conveyors Bay',  'geographic', 1),
  ('area_pump', 'Pump Station',   'geographic', 1),
  ('area_mech', 'Mechanical',     'functional', 1);

-- Geographic bindings - bind to the system node so descendants are included
INSERT INTO area_nodes (area_id, asset_node_id, include_descendants) VALUES
  ('area_conv', 'AST-SYS-001', 1),
  ('area_pump', 'AST-SYS-002', 1);

-- Functional binding - mechanical = rotating machinery
INSERT INTO area_filters (area_id, filter_type, filter_value) VALUES
  ('area_mech', 'criticality', 'critical'),
  ('area_mech', 'criticality', 'high');

-- Employee area assignments
INSERT INTO employee_areas (emp_id, area_id) VALUES
  ('emp_am1', 'area_conv'),
  ('emp_am1', 'area_pump'),
  ('emp_am1', 'area_mech'),
  ('emp_sv1', 'area_conv'),
  ('emp_sv1', 'area_mech'),
  ('emp_sv2', 'area_pump'),
  ('emp_sv2', 'area_mech'),
  ('emp_ar1', 'area_conv'),
  ('emp_ar2', 'area_pump'),
  ('emp_op1', 'area_conv');

-- =
-- CHEMICALS
-- =

INSERT INTO chemicals (id, cas_number, common_name, physical_state, hazard_classes,
                       supplier, sds_url, location_stored, quantity_unit,
                       incompatible_with, ppe_required, status, created_by, created_at) VALUES
  ('CHM-2026-001', '60631-73-4', 'Lithium EP2 Grease', 'solid',
   '["flammable solid"]', 'Engen Petroleum', NULL, 'Stores Bay A - Shelf 3', 'kg',
   '[]', '["nitrile gloves","safety glasses"]',
   'active', 'emp_001', datetime('now')),

  ('CHM-2026-002', '64742-54-7', 'Hydraulic Oil ISO VG 46', 'liquid',
   '["flammable liquid"]', 'Total Lubrifiants', NULL, 'Stores Bay A - Shelf 4', 'L',
   '[]', '["nitrile gloves","safety glasses"]',
   'active', 'emp_001', datetime('now')),

  ('CHM-2026-003', '1310-73-2', 'Caustic Soda (NaOH) 50%', 'liquid',
   '["corrosive","skin corrosion"]', 'AECI Mining Chemicals', NULL, 'Chemical Store - Cabinet C1', 'L',
   '["CHM-2026-001","CHM-2026-002"]',
   '["chemical resistant gloves","face shield","chemical splash apron","safety glasses"]',
   'active', 'emp_001', datetime('now'));

-- Back-populate incompatible_with on oils to reference caustic soda
UPDATE chemicals SET incompatible_with = '["CHM-2026-003"]' WHERE id IN ('CHM-2026-001','CHM-2026-002');

-- Asset chemical linkages (asset_chemicals has no purpose column - use quantity_on_hand)
INSERT INTO asset_chemicals (asset_id, chemical_id, quantity_on_hand, unit, last_updated) VALUES
  ('AST-CMP-CV101-GB', 'CHM-2026-001', 5.0,  'kg', datetime('now')),
  ('AST-CMP-CV101-GB', 'CHM-2026-002', 10.0, 'L',  datetime('now')),
  ('AST-MCH-PMP001',   'CHM-2026-003', NULL,  'L',  datetime('now')),
  ('AST-CMP-PMP001-SK','CHM-2026-003', NULL,  'L',  datetime('now'));

-- =
-- TOOL TYPES
-- =

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

