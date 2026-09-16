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
