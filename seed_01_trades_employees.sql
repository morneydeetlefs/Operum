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
