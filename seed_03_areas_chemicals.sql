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
