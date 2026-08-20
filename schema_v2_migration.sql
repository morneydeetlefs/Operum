-- Operum — Schema migration v1 → v2
-- Adds suffix_library table with industrial defaults.
-- Apply: npx wrangler d1 execute operum_main --remote --file=schema_v2_migration.sql

DROP TABLE IF EXISTS suffix_library;

CREATE TABLE suffix_library (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  prefix      TEXT NOT NULL UNIQUE,   -- "GB", "PMP", "MTR"
  description TEXT NOT NULL,          -- "Gearbox", "Pump", "Motor"
  node_types  TEXT NOT NULL,          -- JSON: ["machine","component","maintainable"]
  use_count   INTEGER NOT NULL DEFAULT 0,
  created_by  TEXT,                   -- null = system default; employee id = custom
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_library_use ON suffix_library(use_count DESC);
CREATE INDEX idx_library_prefix ON suffix_library(prefix);

-- ─── Industrial defaults ────────────────────────────────────────────────────
-- Sites / Plants / Systems
INSERT INTO suffix_library (prefix, description, node_types, created_by) VALUES
  ('SITE',  'Site',                   '["site"]',                                    null),
  ('PLT',   'Plant',                  '["plant"]',                                   null),
  ('SEC',   'Section',                '["plant","system"]',                          null),
  ('SYS',   'System',                 '["system"]',                                  null),
  ('AREA',  'Area',                   '["site","plant","system"]',                   null),
  ('UNIT',  'Process Unit',           '["plant","system"]',                          null);

-- Conveyors & material handling
INSERT INTO suffix_library (prefix, description, node_types, created_by) VALUES
  ('CV',    'Conveyor',               '["system","machine"]',                        null),
  ('BC',    'Belt Conveyor',          '["machine"]',                                 null),
  ('SC',    'Screw Conveyor',         '["machine"]',                                 null),
  ('FC',    'Flight Conveyor',        '["machine"]',                                 null),
  ('EL',    'Elevator / Bucket',      '["machine"]',                                 null),
  ('FDR',   'Feeder',                 '["machine"]',                                 null),
  ('CHT',   'Chute',                  '["component","maintainable"]',                null),
  ('TRP',   'Tripper',                '["machine","component"]',                     null);

-- Crushers & screens
INSERT INTO suffix_library (prefix, description, node_types, created_by) VALUES
  ('CRU',   'Crusher',                '["machine"]',                                 null),
  ('SCR',   'Screen / Vibrating',     '["machine"]',                                 null),
  ('MIL',   'Mill',                   '["machine"]',                                 null),
  ('GRZ',   'Grizzly',                '["machine","component"]',                     null);

-- Rotating equipment
INSERT INTO suffix_library (prefix, description, node_types, created_by) VALUES
  ('PMP',   'Pump',                   '["machine"]',                                 null),
  ('FAN',   'Fan',                    '["machine"]',                                 null),
  ('BLW',   'Blower',                 '["machine"]',                                 null),
  ('COMP',  'Compressor',             '["machine"]',                                 null),
  ('MTR',   'Motor (Electric)',       '["machine","component"]',                     null),
  ('ENG',   'Engine',                 '["machine"]',                                 null),
  ('TRB',   'Turbine',                '["machine"]',                                 null),
  ('AGT',   'Agitator',               '["machine"]',                                 null),
  ('MXR',   'Mixer',                  '["machine"]',                                 null);

-- Gearboxes & drives
INSERT INTO suffix_library (prefix, description, node_types, created_by) VALUES
  ('GB',    'Gearbox',                '["machine","component"]',                     null),
  ('RDC',   'Reducer',                '["machine","component"]',                     null),
  ('VSD',   'Variable Speed Drive',   '["machine","component"]',                     null),
  ('CPL',   'Coupling',               '["component","maintainable"]',                null),
  ('BRG',   'Bearing Assembly',       '["component","maintainable"]',                null),
  ('SFT',   'Shaft',                  '["component"]',                               null),
  ('PLY',   'Pulley',                 '["component","maintainable"]',                null),
  ('IDL',   'Idler',                  '["component","maintainable","consumable"]',   null),
  ('BLT',   'Belt',                   '["component","maintainable","consumable"]',   null);

-- Measurement points (bearing positions)
INSERT INTO suffix_library (prefix, description, node_types, created_by) VALUES
  ('DE',    'Drive End',              '["component","maintainable"]',                null),
  ('NDE',   'Non-Drive End',          '["component","maintainable"]',                null),
  ('INL',   'Inlet',                  '["component","maintainable"]',                null),
  ('OUT',   'Outlet',                 '["component","maintainable"]',                null),
  ('BASE',  'Base / Foundation',      '["component","maintainable"]',                null),
  ('HSG',   'Housing',                '["component","maintainable"]',                null);

-- Electrical & instrumentation
INSERT INTO suffix_library (prefix, description, node_types, created_by) VALUES
  ('MCC',   'Motor Control Centre',   '["system","machine"]',                        null),
  ('PNL',   'Panel / Board',          '["system","machine","component"]',            null),
  ('TRF',   'Transformer',            '["machine"]',                                 null),
  ('GEN',   'Generator',              '["machine"]',                                 null),
  ('SWT',   'Switchgear',             '["machine","component"]',                     null),
  ('INS',   'Instrument',             '["component","maintainable"]',                null),
  ('SEN',   'Sensor',                 '["component","maintainable","consumable"]',   null),
  ('VLV',   'Valve',                  '["machine","component","maintainable"]',      null),
  ('ACT',   'Actuator',               '["component","maintainable"]',                null);

-- Vessels & tanks
INSERT INTO suffix_library (prefix, description, node_types, created_by) VALUES
  ('TNK',   'Tank',                   '["machine","system"]',                        null),
  ('VSL',   'Vessel',                 '["machine","system"]',                        null),
  ('SMP',   'Sump',                   '["machine","component"]',                     null),
  ('HOP',   'Hopper',                 '["machine","component"]',                     null),
  ('SLO',   'Silo',                   '["machine","system"]',                        null),
  ('DRM',   'Drum',                   '["machine","component"]',                     null);

-- Hydraulic & pneumatic
INSERT INTO suffix_library (prefix, description, node_types, created_by) VALUES
  ('HYD',   'Hydraulic System',       '["system","machine"]',                        null),
  ('PNU',   'Pneumatic System',       '["system","machine"]',                        null),
  ('CYL',   'Cylinder',               '["component","maintainable"]',                null),
  ('HPU',   'Hydraulic Power Unit',   '["machine"]',                                 null);

-- Safety & isolation
INSERT INTO suffix_library (prefix, description, node_types, created_by) VALUES
  ('ISO',   'Isolation Point',        '["component","maintainable"]',                null),
  ('ESS',   'Emergency Stop',         '["component","maintainable"]',                null),
  ('GRD',   'Guard / Guarding',       '["component","maintainable","consumable"]',   null),
  ('SPR',   'Sprinkler / Suppression','["component","maintainable"]',                null);

-- Auxiliary
INSERT INTO suffix_library (prefix, description, node_types, created_by) VALUES
  ('LUB',   'Lubrication System',     '["system","machine","auxiliary"]',            null),
  ('COL',   'Cooling System',         '["system","machine","auxiliary"]',            null),
  ('FLT',   'Filter',                 '["component","maintainable","consumable","auxiliary"]', null),
  ('HEX',   'Heat Exchanger',         '["machine","auxiliary"]',                     null),
  ('AUX',   'Auxiliary Equipment',    '["auxiliary"]',                               null);
