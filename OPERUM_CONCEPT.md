# OPERUM — Concept & Architecture Document
## Session Handoff · August 2026
### Built by MD Works · Morney Deetlefs · South Africa

---

## What Operum Is

Operum is a **field-first industrial operations platform** combining maintenance management and safety management into a single mobile-first system for heavy industry. It is built to replace or operate alongside SAP Plant Maintenance on the shop floor — where SAP fails through complexity, poor mobile UX, and the gap between what happens on the plant and what gets recorded.

The name derives from Latin *operum* — "of the works." It is the fixed reference point around which all plant operations are organised.

**Domain:** operum.co.za (registered August 2026)
**Built by:** MD Works (Morney Deetlefs · mdworks.dev)
**Status:** Active build — Register module functional, Safety and Maintenance stubbed

---

## The Problem Being Solved

SAP PM is a planning and recording tool that lives in the office. The artisan's world is paper job cards, verbal handovers, gut-feel condition assessment, and a smartphone they already carry. The gap between what actually happens on the plant and what gets recorded is where equipment fails, incidents happen, and money is lost.

Commercial CMMS and safety platforms (Pragma, Maximo, eMaint, SafetyCulture, MaintainX) are either:
- Too expensive for mid-size SA industry
- Not built for heavy industrial workflows
- Terrible on mobile — unusable by artisans on the floor
- Generic (built for facilities, retail, schools) — not for mining, refineries, or heavy manufacturing
- Not integrated — maintenance and safety live in separate systems

Operum addresses all of these gaps simultaneously.

---

## Target Market

**Primary:** Heavy industry in South Africa — mining, refineries, power generation, food & beverage processing, paper mills, water treatment, manufacturing.

**Secondary:** Any industrial site globally that needs mobile-first maintenance + safety management.

**Both:**
- Sites that cannot afford SAP (standalone replacement)
- Sites that have SAP but whose shop floor ignores it (parallel field system with optional SAP sync)

---

## Business Model

**Demo / Onboarding tier:**
- Limited asset count (e.g. 10 machines, 3 users)
- Full feature access to demonstrate value
- No time limit — encourages self-service onboarding
- Clearly watermarked as demo

**Paid tiers — scale by:**
- Asset count (number of registered machines/equipment)
- User count (number of active users)
- Site count (multi-site organisations)

**Add-on modules (unlocked on top of base):**
- Condition Monitoring (DiagnosticWand — vibration + acoustic readings)
- Permit to Work (premium — requires safety officer review before activation)
- SAP Integration (enterprise — bidirectional sync with SAP PM)
- LLM Fault Narrative (Groq-powered plain-English fault analysis)

**Pricing currency:** ZAR (South African Rand) for SA market, USD for international

---

## Module Architecture

The asset register is the spine. Every other module ties back to it. Nothing is free-floating.

```
OPERUM PLATFORM
│
├── 1. REGISTER (Foundation — built first) ✓ FUNCTIONAL
│   ├── Location hierarchy (Site → Plant → Area → Zone)
│   ├── Equipment / Asset register (machines, criticality, hazards, isolation points)
│   ├── Measurement points (for condition monitoring)
│   ├── Tools & Equipment (calibrated instruments, lifting gear, PPE)
│   ├── Persons register (roles, access profiles, department tags, trade)
│   └── Documents (SWPs, OEM manuals, MSDSs, certificates — attached to assets)
│
├── 2. SAFETY (builds on register)
│   │
│   ├── 2a. CHEMICALS REGISTER (Safety owns — built first within Safety)
│   │   ├── Chemical master data (name, CAS number, GHS hazard class)
│   │   ├── Exposure limits (OEL/TLV per domain — Health/Safety/Environment)
│   │   ├── Storage rules (temperature, containment, segregation requirements)
│   │   ├── Incompatibility matrix (substances that cannot be co-located)
│   │   ├── MSDS documents (versioned, expiry-aware, language variants)
│   │   └── Public QR access (unauthenticated MSDS view for emergencies)
│   │
│   ├── 2b. HIRA — Hazard Identification & Risk Assessment
│   │   ├── Situational RA (task + location + time + people + chemicals)
│   │   ├── Auto-population from asset structural hazards (register → HIRA)
│   │   ├── NOSA 3D matrix: Likelihood × Severity × Exposure
│   │   │   scored separately across Health / Safety / Environment domains
│   │   │   score = L × S × E (1–125); bands: Low≤20 / Medium≤50 / High≤100 / Critical≤125
│   │   ├── Residual risk after controls (hierarchy of controls documented)
│   │   ├── Mandated threshold enforcement — management sets base thresholds
│   │   │   per domain; criticality multiplier auto-tightens for critical assets
│   │   │   (Critical 0.5× / High 0.75× / Medium 1.0× / Low 1.25×)
│   │   ├── Threshold breach → escalation to named manager for risk acceptance
│   │   │   sign-off (immutable, timestamped, audit-logged — legally defensible)
│   │   └── Review schedule and expiry (expired RA = compliance gap on dashboard)
│   │
│   ├── 2c. Toolbox talks (attendance, topics, references active HIRAs for shift)
│   ├── 2d. BBS observations
│   ├── 2e. Safety rep inspections (Section 8/9 OHSA)
│   ├── 2f. Incident & near-miss reporting (Section 24 OHSA)
│   └── 2g. PTW — Permit to Work (last — consumes HIRA, chemicals, isolations)
│
├── 3. STORES
│   ├── Item master (spares, consumables, chemicals)
│   │   ├── Spares — asset-linked (which assets does this part fit)
│   │   ├── Consumables — general (not asset-specific)
│   │   └── Chemicals — references Chemicals Register for safety data
│   ├── Store locations
│   │   ├── Main stores (site-level)
│   │   ├── Satellite workshops (area-level — multiple per site)
│   │   └── Hazmat stores (area-level — dedicated chemical storage locations)
│   ├── Stock on hand (quantity per item per location)
│   ├── Issue transactions (who took what, when, against which work order)
│   ├── Receipt transactions (with active incompatibility warning for chemicals)
│   ├── Minimum stock levels and reorder alerts
│   └── CSV / SAP MM import (item master population)
│
├── 4. MAINTENANCE (builds on register + stores)
│   ├── Fault notifications (anyone can raise)
│   ├── Work orders (created from notifications or planned)
│   ├── Job cards (artisan-facing, mobile-first)
│   ├── Planned maintenance scheduling (PM frequencies)
│   ├── Sign-off and feedback loop
│   └── Maintenance history per asset
│
└── 5. CONDITION MONITORING (Add-on module)
    └── DiagnosticWand integration
        ├── Vibration readings (RMS, crest factor, kurtosis, FFT)
        ├── Acoustic readings (dBFS)
        ├── Measurement points from asset register
        ├── Health summary endpoint (feeds Operum health chip)
        └── Trend data feeding maintenance decisions
```

### The Safe Work Procedure (SWP) insight
A safe work procedure should not be written from scratch. It is generated from what the system already knows about the asset:
- Machine type → standard task library
- Associated hazards → standard precautions and PPE
- Isolation points → pre-populated lockout sequence
- Location → area-specific rules (confined space, hot work zone)
- Criticality → required signatures

The Groq LLM layer produces a first-draft SWP from structured asset data. A safety officer reviews and approves. This is the first meaningful LLM use case in the platform — not a gimmick, a genuine time-saver.

---

## Build Sequence

**Phase 1 — Register ✓ FUNCTIONAL**
1. Location hierarchy ✓
2. Asset / Equipment register (hazards, criticality, isolation points, copy subtree) ✓
3. Persons register (access profiles, department tags, trade) ✓
4. Documents (attached to assets) ✓

**Phase 2 — Safety (builds on register)**
5. Chemicals Register (Safety owns — built first; Stores and HIRA both depend on it)
   - Chemical master data, GHS classification, OEL/TLV
   - Storage rules and incompatibility matrix
   - MSDS documents — versioned, expiry-aware, language variants
   - Public QR route (unauthenticated — emergency access, no login required)
6. HIRA — Hazard Identification & Risk Assessment
   - Situational RA linked to task + location + time + people + chemicals
   - NOSA 3D matrix (L × S × E, scored per Health / Safety / Environment domain)
   - Auto-population from asset structural hazards
   - Mandated threshold enforcement with criticality multiplier
   - Risk acceptance sign-off flow (named manager, immutable, audit-logged)
   - Review schedule and expiry tracking
7. Toolbox talks (attendance, topics, references active HIRAs)
8. BBS observations
9. Safety rep inspections (Section 8/9 OHSA)
10. Incident & near-miss reporting (Section 24 OHSA)
11. PTW (last — consumes HIRA, chemicals register, isolation points)

**Phase 3 — Stores (builds on register + chemicals register)**
12. Item master (spares, consumables, chemicals)
13. Store locations (main, satellite workshops, hazmat stores — multiple per area)
14. Stock on hand, issue and receipt transactions
15. Active incompatibility warning at chemical receipt
16. Minimum stock levels and reorder alerts
17. CSV / SAP MM import

**Phase 4 — Maintenance (builds on register + stores)**
18. Fault notifications
19. Work orders & job cards
20. Planned maintenance scheduling

**Phase 5 — Add-ons**
21. DiagnosticWand → Condition Monitoring module (health summary endpoint)
22. LLM fault narrative (Groq)
23. SAP integration (enterprise)
24. Dashboard map view (Leaflet — machines by health status)

---

## UX Architecture Decisions

*Decisions recorded August 2026 following navigation architecture review.*

---

### The 360° Asset Hub — locked in

When any asset is opened from anywhere in the app — a dashboard alert, a search result, a tree node, or a future work order — it opens a single unified asset context sheet. This sheet uses horizontal tabs to surface context from different modules without leaving the asset.

Tab structure (built incrementally as modules ship):

- **Identity** — ID, label, node type, criticality, hazards, isolation points
- **Maintenance** — work order history, open notifications, planned PM schedule *(Phase 3)*
- **Safety** — linked risk assessments, active PTW, incident history *(Phase 2)*
- **Condition** — latest DiagnosticWand readings, health chip, link to full DW session *(Phase 4)*

**This pattern must be designed before Safety module screens are built.** If Safety builds its own asset detail view it will diverge from Maintenance's, and the two will need to be unified later at higher cost. Design the hub shell with the Identity tab only, leave other tabs as placeholders, and build Safety and Maintenance screens to populate those tabs rather than creating new asset views.

The deep-link contract: any module can open the asset hub pre-focused on a specific tab. A dashboard alert for a high crest factor opens the hub on the Condition tab. An overdue PM notification opens it on the Maintenance tab. The breadcrumb always shows the path back to the source.

---

### Condition health chip — near-term integration target

Asset list rows and the dashboard priority list should display a compact health indicator badge showing the latest condition monitoring status from DiagnosticWand. Three states: normal (green), warning (amber), alert (red) — derived from the latest RMS and kurtosis values.

Requires DiagnosticWand to expose a summary endpoint: `GET /api/machines/:id/health` returning `{ status, rms, kurtosis, timestamp }`. That endpoint is not yet built. When DiagnosticWand's schema rewrite (machines + measurement points) is complete, add this endpoint at the same time. Operum consumes it to populate the health chip without opening DiagnosticWand.

---

### Dashboard triage deck order — locked in for when Safety and Maintenance are real

When Safety and Maintenance modules have live data, the supervisor/manager dashboard sections follow this priority order:

1. **Critical exceptions** — unacknowledged high-vibration alarms, open Section 24 incidents, active LOTO
2. **Approvals and sign-offs** — completed job cards pending supervisor sign-off, SWP first-draft reviews
3. **Area summary** — asset health by area, PM compliance rate, open notifications

This order is fixed by consequence severity, not by data availability. Do not rearrange it.

The area filter already built (JWT `areas` field → header selector) drives all three sections. Default scope is the user's assigned areas. An explicit toggle allows multi-area supervisors to view the full plant.

---

### Deferred UX decisions — do not build yet

**Persona-differentiated dashboards (Field Mode vs Desk Mode).** Artisans and supervisors should eventually land on different default views — an action queue for the floor, a triage deck for the office. Defer until Safety and Maintenance modules have real data. Without real data the distinction is cosmetic. Revisit at the start of Phase 3 (Maintenance build).

**QR / NFC scanner ingress.** Scanning an asset tag to open its hub bypasses tree traversal entirely and is the right long-term approach for field use. Requires QR code generation per asset, a print workflow, physical tags on equipment, and camera API integration in the PWA. This is a field rollout problem, not a navigation problem. Defer to Phase 4. When built, the scanner is a floating action button within the Assets view — not a permanent bottom nav slot.

**Supervisor mode toggle (Field/Desk).** A UI toggle between a compact field view and a full registry view adds state complexity without clear payoff — the responsive layout already adapts to screen size. Reject unless a specific client requirement makes it necessary.

---

### Role scope — open for expansion

The initial role matrix was designed around maintenance and safety workflows. Operum's field-first model and asset-as-spine architecture make it a natural fit for other operational departments on the same site.

Heavy industry sites have many departments beyond maintenance and safety whose work touches plant assets and safety compliance:

- **Operations** — process operators monitoring equipment state, raising fault notifications
- **Station cleaning** — not janitorial. In heavy industry this means coal spillage, sump cleaning, conveyor belt cleaning — confined space entries, chemical exposure, rotating equipment proximity. These are safety-workflow tasks, not lightweight checklists.
- **Rigging and scaffold contractors** — PTW subjects. A rigger erecting scaffold around a pressurised vessel needs an active PTW, risk assessment, and isolation confirmation before work starts. The system must know they are on site, what they are authorised to do, and when their access expires.
- **Fire department** — read access to hazardous material locations, isolation points, and emergency procedures. Pre-incident familiarisation and post-incident reporting.
- **Security** — access control logging, incident reporting, area patrol sign-offs.
- **Office personnel** — payroll, procurement, HR. Minimal operational need; read-only dashboard access for reporting purposes at most.

The lesson: department type does not reliably predict access level. A station cleaner doing confined space work needs full safety workflow access. An office administrator needs almost none. Department is metadata. Access level is determined by access profile.

---

### Two-tier access model — locked in (Option B)

Access control uses two separate, independent fields on every user record:

**Access profile** — controls what the user can see and do in the system. A small fixed set:

| Profile | Capability |
|---|---|
| Field Worker | Execute assigned tasks, raise notifications, submit readings, log observations |
| Supervisor | All field worker actions + approve job cards, view area dashboards, manage shift handovers |
| Safety Officer | All safety module actions, PTW approval authority, Section 24 reporting |
| Planner | Work order creation, PM scheduling, asset register management |
| Contractor | Scoped to specific work orders or PTW only — time-limited, no persistent access |
| Emergency Services | Read-only access to hazmat locations, isolation points, emergency procedures |
| Read Only | Dashboards and reports — no data entry |
| Admin | Full access, user management, billing, configuration |

**Department tag** — metadata only. Identifies the person for operational purposes: PTW assignment, area filtering, shift reporting, audit trail. Does not control access logic. Examples: `maintenance`, `operations`, `station_cleaning`, `rigging`, `scaffold`, `fire_dept`, `security`, `office`, `contractor_electrical`, `contractor_civil`.

A station cleaner doing confined space work gets profile `Field Worker` + department tag `station_cleaning`. The PTW module uses the department tag to identify who is on site and what trade they are authorised for. Access control uses the profile. Both fields are independent.

**Implication for the persons register schema:** the `employees` / `persons` table needs both a `role` field (access profile, maps to JWT) and a `department` field (metadata, stored on person record, included in JWT payload for filtering and audit). Add a `trade` field for contractors and trades personnel — the PTW module will need it.

Updated JWT payload to reflect this:

```json
{
  "sub": "usr_001",
  "tenant": "sitea_sishen",
  "role": "field_worker",
  "department": "station_cleaning",
  "trade": "confined_space_entry",
  "areas": ["bay_c", "sump_01"],
  "site": "sishen_mine",
  "shift_start": "06:00",
  "shift_end": "18:00",
  "exp": 1234567890
}
```

The module nav filters on `role` (access profile). Reporting, PTW assignment, and audit trail use `department` and `trade`. These are never mixed.

---

## Safety & Stores Architecture Decisions

*Decisions recorded August 2026.*

---

### HIRA — Situational risk assessment model

A risk assessment in Operum is not a static document attached to an asset. It is a **situational assessment instance** created for a specific job at a specific place and time. The asset register provides structural hazard context (what is always dangerous about this location). The task provides activity-specific hazards. The assessment combines both into a situational risk picture tied to:

- The task being performed
- The location in the asset hierarchy
- The time (shift, environmental conditions)
- The people performing the work (competency, certification, number)
- The equipment and chemicals involved

The asset's existing `hazards` and `isolation_pts` fields auto-populate the HIRA as a starting point. The assessor adds task-specific hazards on top. The register is the library; the HIRA is the application of that library to a specific situation.

---

### NOSA 3D risk matrix — fixed standard, not configurable

Operum uses the NOSA three-dimensional risk matrix. This is the standard used across SA heavy industry and is not configurable per tenant — it is the platform standard.

**Three axes:**
- **Likelihood (L)** — 1 (rare) to 5 (almost certain)
- **Severity (S)** — 1 (negligible) to 5 (catastrophic)
- **Exposure (E)** — 1 (rare/limited exposure) to 5 (continuous/widespread)

**Score:** L × S × E → range 1 to 125

**Bands:**
| Score | Band | Colour |
|---|---|---|
| 1–20 | Low | Green |
| 21–50 | Medium | Amber |
| 51–100 | High | Orange |
| 101–125 | Critical | Red |

**Three domains — scored independently per hazard:**
- **Health** — occupational health impact (dust, noise, chemical exposure, ergonomics)
- **Safety** — injury or fatality risk
- **Environmental** — impact on surrounding environment (spills, emissions, waste)

Each hazard receives three scores — one per domain. The highest score across all three domains drives the overall risk rating for that hazard.

---

### Mandated threshold enforcement

Management sets a **maximum acceptable residual risk score** per domain at tenant configuration level. These thresholds represent the organisation's stated risk tolerance and are legally significant.

**Criticality multiplier** — the system auto-tightens thresholds based on asset criticality. Management sets one base threshold per domain. The multiplier applies automatically:

| Asset criticality | Multiplier | Effect on threshold |
|---|---|---|
| Critical | 0.5× | Threshold halved — much tighter |
| High | 0.75× | Threshold reduced by 25% |
| Medium | 1.0× | Base threshold applies |
| Low | 1.25× | Threshold relaxed by 25% |

Multipliers are fixed in the platform. They are not configurable.

**Enforcement flow:**

```
Assessor completes HIRA
        ↓
System calculates residual risk (L × S × E after controls) per hazard per domain
        ↓
All residuals ≤ mandated threshold (adjusted for asset criticality)?
    ├── YES → RA submitted for Safety Officer review → Approved → Work may proceed
    └── NO  → RA flagged: EXCEEDS THRESHOLD
                    ↓
              Assessor strengthens controls and resubmits
                    OR
              Escalates to named manager for risk acceptance sign-off
                    ↓
              Manager records reason, signs digitally
                    ↓
              RA approved with exception — immutable, timestamped, audit-logged
```

Risk acceptance sign-offs are tied to a real person (JWT `sub`), not just a role. They cannot be edited once signed — only superseded by a new RA. They appear in all OHSA compliance reports and Section 24 investigation exports.

---

### Chemicals Register — owned by Safety, referenced by Stores

The Chemicals Register is a Safety object. Stores consumes it for quantity and location tracking but does not own the master data.

**Chemical master record contains:**
- Name, CAS number, trade names
- GHS hazard classification (SA SANS 10234 / GHS aligned)
- Exposure limits: OEL (Occupational Exposure Limit) and TLV (Threshold Limit Value) per Health/Safety/Environment domain
- Storage requirements (temperature range, containment class, ventilation)
- Incompatibility rules (which GHS classes or specific substances cannot be co-located)
- Disposal requirements and emergency response summary
- MSDS documents (versioned — see below)

**Incompatibility enforcement — active warning at receipt:**
When a chemical is received into a hazmat store, the system checks all chemicals already present in that store against the incompatibility matrix. If any incompatible substance is present, the receipt is blocked with a warning identifying the conflict. The receiving user cannot proceed without a named Safety Officer override — which is logged.

**MSDS document model — extended from asset document model:**
- Version-controlled — each revision is a new record; previous versions retained
- Expiry date — expired MSDS surfaces as a compliance gap on the Safety dashboard
- Language variants — multiple language versions per chemical (EN, AF, and site-specific languages)
- Emergency QR access — each chemical has a public QR code linking to its current MSDS without requiring login. The public route returns only the current approved MSDS PDF for that chemical. No other data is exposed on the unauthenticated route. The Worker serves this via a dedicated `/public/msds/:chemical_id` endpoint.

---

### Stores module — inventory management scope only

Stores manages stock on hand, locations, transactions, and alerts. Procurement (purchase orders, supplier management, lead times) is out of scope — those remain in the client's existing ERP (SAP MM, Sage, etc.).

**Store location types:**
- **Main stores** — site-level, general stock
- **Satellite workshops** — area-level, multiple per site, stocks spares and consumables for that area's assets
- **Hazmat stores** — area-level, dedicated chemical storage, governed by incompatibility matrix and storage rules from the Chemicals Register

**Transactions:**
- Issue — records who took what, when, against which work order or task
- Receipt — records what arrived, from where; triggers incompatibility check for chemicals
- Adjustment — stock count correction (authorised users only, audit-logged)

**Alerts:**
- Stock below minimum level → reorder alert on Stores dashboard
- Expired MSDS for a chemical in stock → safety compliance alert
- Incompatible chemicals in same store → safety alert (should not occur if receipt enforcement works; alert catches legacy data on import)

**Import:**
CSV import for item master population. SAP MM extract format supported. No live bidirectional sync with SAP MM in this scope — that is an enterprise add-on.

---

### Open questions — Safety & Stores

1. **Task library** — HIRAs reference a task type (e.g. "Bearing replacement", "Conveyor belt cleaning", "Confined space entry"). Should Operum ship a standard task library for SA heavy industry, or is the task list fully defined per tenant? A standard library accelerates onboarding but may not match site-specific terminology.

2. **PTW design** — requires external safety professional input before build. Do not design or build PTW without a qualified safety officer reviewing the workflow. This constraint stands from the original concept document.

3. **Toolbox talk — HIRA reference** — a toolbox talk for a shift should reference the active HIRAs for that shift's planned tasks. The link between toolbox talk topics and HIRA records needs a design decision: does the toolbox talk pull from HIRAs automatically, or does the Safety Officer manually select which HIRAs to reference?

4. **Chemical import format** — when a client already has a chemical register in SAP (MM/EHS module) or a spreadsheet, what is the import format? Define a standard CSV template before building the import feature.

---

## Technical Architecture

### Stack
Consistent with all MD Works projects:
- **Frontend:** Vanilla HTML / CSS / JavaScript — no frameworks, no build step
- **Backend:** Cloudflare Workers (TypeScript)
- **Database:** Cloudflare D1 (SQLite)
- **Sessions/cache:** Cloudflare KV
- **AI layer:** Groq API (free tier — fault narratives, SWP drafting)
- **Deployment:** Cloudflare Pages (frontend) + Wrangler (Worker)
- **Version control:** GitHub

### Multi-tenancy Model: Full Account Isolation

**Decision: One Cloudflare account per tenant. One D1 database per tenant.**

This is the only defensible model for safety-critical industrial data. Each client site gets complete infrastructure separation:

```
Operum Platform (MD Works CF account)
├── operum.co.za          — marketing site, demo, onboarding
├── app.operum.co.za      — demo tenant (limited, watermarked)
└── docs.operum.co.za     — documentation

Client: Site A (their own CF account)
├── sitea.operum.co.za    — or custom domain
├── Worker: operum-sitea-worker
├── D1: operum_sitea_main
├── KV: operum_sitea_sessions
└── Secret: SITEA_JWT_SECRET

Client: Site B (their own CF account)
├── siteb.operum.co.za
└── [same pattern]
```

**Why full account isolation:**
- One client's data breach cannot affect another client
- POPIA compliance — right to erasure means deleting one CF account
- Commercially sensitive data (asset registers, incident records, maintenance history) is proprietary to each site
- A mining house's IT security team will require this level of separation
- Clients with data sovereignty requirements can take ownership of their own CF account

### Access Control

**Two-tier access model — see UX Architecture Decisions section for full detail.**

Every user has two independent fields: an **access profile** (controls system access) and a **department tag** (metadata for PTW, reporting, and audit). The nav and API filter on profile. Department tag never drives access logic.

Access profiles in summary:

| Profile | Scope |
|---|---|
| Admin | Full access, user management, billing, configuration |
| Safety Officer | All safety module actions, PTW approval authority, Section 24 reporting |
| Planner | Work order creation, PM scheduling, asset register management |
| Supervisor | Field worker actions + job card approval, area dashboards, shift handovers |
| Field Worker | Execute tasks, raise notifications, submit readings, log observations |
| Contractor | Scoped to specific work orders or PTW only — time-limited |
| Emergency Services | Read-only — hazmat locations, isolation points, emergency procedures |
| Read Only | Dashboards and reports — no data entry |

Department tags are free-form strings set per user: `maintenance`, `operations`, `station_cleaning`, `rigging`, `scaffold`, `fire_dept`, `security`, `office`, `contractor_electrical`, etc. New departments require no schema change — add the tag string.

**Access is not just module-level — it is row-level.**
A query for incidents filters by the requesting user's area assignment, role, and data classification. An artisan's JWT cannot return data from areas they are not assigned to, regardless of what the API call requests.

**JWT payload structure:**
```json
{
  "sub": "usr_001",
  "tenant": "sitea_sishen",
  "role": "artisan",
  "areas": ["bay_c", "bay_d"],
  "site": "sishen_mine",
  "shift_start": "06:00",
  "shift_end": "18:00",
  "exp": 1234567890
}
```

Tokens are shift-bound. They expire at shift end. No access outside authorised hours.

### Data Loss Prevention (DLP)

Data entered into Operum should not be available outside of authorised scope. Key controls:

**Photos / camera:**
- Camera capture piped directly into Worker via `getUserMedia` — never written to device gallery
- No `download` attribute on images
- No right-click save on sensitive content
- `user-select: none` on classified data

**Screen visibility:**
- `visibilitychange` event hides/blurs sensitive content when app goes to background
- Prevents casual screenshot capture of classified content

**After-hours lockout:**
- Shift-bound JWT — app locks when token expires
- Token refresh only available during authorised shift hours

**Area enforcement:**
- GPS coordinates checked on session start and periodically
- Data access filtered by area assignment in JWT
- Temporary elevated access (e.g. safety observer in another area) is explicitly granted, logged, and time-limited

**Audit trail — the strongest control:**
Every data access is logged. Who viewed what, when, from where, on what device. Supervisors can pull full access reports. This is legally defensible in OHSA investigations and disciplinary hearings.

```sql
CREATE TABLE access_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL,
  action      TEXT NOT NULL,   -- 'view', 'capture', 'export', 'print'
  resource    TEXT NOT NULL,   -- 'asset:PMP-007', 'incident:INC-0042'
  timestamp   TEXT NOT NULL,
  location    TEXT,            -- GPS coordinates if available
  device_id   TEXT,
  ip_address  TEXT
);
```

**For enterprise clients requiring hard enforcement:**
Recommend MDM deployment (Samsung Knox, Microsoft Intune, Jamf) — blocks screenshots at OS level, enforces VPN, enables remote wipe. Document as *Operum Enterprise Deployment Guide*.

**Honest limitation:**
A determined person with a second phone can photograph the screen. This is true of every web-based system including SAP. Policy + audit trail is more effective and legally defensible than technical controls alone.

### POPIA Compliance
South African Protection of Personal Information Act requirements:
- Right to erasure: delete the client's CF account — clean, complete, auditable
- Data subject access: access log provides full history per person
- Data residency: document Cloudflare's data centre locations for each client
- Build from day one — not retrofitted

---

## Relationship to DiagnosticWand

DiagnosticWand (`diagnostic-wand.pages.dev`) is an existing deployed project — a mobile PWA + Cloudflare Worker for vibration and acoustic condition monitoring on mechanical assets.

**DiagnosticWand becomes Operum's Condition Monitoring add-on module.**

Its architecture (machines → measurement points → diagnostic logs) is already designed and partially built. When Operum's asset register is live, DiagnosticWand's schema aligns directly to it — measurement points reference machines in the Operum register.

DiagnosticWand continues to develop independently until Operum's register is stable enough to absorb it. Do not pause DiagnosticWand development for Operum.

**DiagnosticWand repo:** github.com/morneydeetlefs/DiagnosticWand
**DiagnosticWand handoff:** See HANDOFF.md (separate document)

---

## Competitive Positioning

| Platform | Problem |
|---|---|
| SAP PM | Expensive, complex, terrible mobile UX, office-only |
| Pragma | SA-built but desktop-heavy, expensive for SME |
| Maximo | Enterprise-only, massive implementation cost |
| SafetyCulture | Generic — built for facilities/retail, not heavy industry |
| MaintainX | Consumer-grade mobile UX, not industrial-depth |
| Fulcrum | Field data collection, not maintenance/safety management |

**Operum's differentiation:**
- Only platform combining maintenance + safety in one system built for heavy industry
- Mobile-first for artisans — not desktop-first adapted for mobile
- SA-built, SA-priced, SA-regulatory compliance (OHSA, POPIA) from day one
- Asset register as the spine — everything contextual, nothing floating
- Zero-cost infrastructure model keeps pricing competitive
- Full data isolation per client — meets enterprise security requirements

---

## Brand

Operum is an MD Works product. The MD Works brand system applies.

**Visual identity:**
- Dark gold palette: `#c9943c` primary gold, `#110e09` background
- Typography: Cinzel (display/headings) / Syne (admin UI) / Syne Mono (IDs, numbers)
- Brand ornament: ✦
- Theme: Dark mode default, light mode toggle

**Operum-specific application:**
- The platform aesthetic should feel serious and industrial — heavier use of dark surfaces, gold as a precision instrument accent rather than warmth
- Dashboard views use Syne as primary font (admin aesthetic)
- Field-facing screens (artisan PWA) use Raleway — more approachable
- Status indicators: `--md-success` (normal), `--md-danger` (critical), `--md-info` (warning)

**Tagline options (unresolved):**
- *Operations, grounded.*
- *Where the plant meets the record.*
- *Built for the floor.*

---

## Open Questions

These are unresolved and need a decision before or during build:

1. **Worker code deployment pipeline** — when a new Operum version ships, how does it push to N client CF accounts? Needs a deployment automation strategy.

2. **Provisioning flow** — what does client onboarding look like? Self-service sign-up → automated CF account creation → D1 migration → subdomain config? Or manual provisioning by MD Works for initial clients?

3. **PTW design** — Permit to Work is the highest-stakes module. It requires review by a safety professional before it is built. Do not design or build PTW without external safety officer input.

4. **Billing infrastructure** — how does paid tier enforcement work? Usage metering, payment gateway (PayFast for SA), account management portal all need design.

5. **SAP integration spec** — for clients who want bidirectional SAP PM sync, what does the data mapping look like? Needs a client with SAP access to map against.

6. **Tagline** — unresolved, see Brand section above.

7. **Offline-first depth** — DiagnosticWand already has offline queue for readings. Operum needs an offline-first strategy for all modules — artisans work in RF-shielded areas, underground, in remote locations. Define which data must be available offline and which requires connectivity.

8. **Department and trade taxonomy** — department tags are free-form strings, which is flexible but risks inconsistency across a multi-site deployment (e.g. `station_cleaning` vs `stn_cleaning` vs `cleaning`). Decide whether to ship a recommended standard tag list with the platform or leave it fully open per tenant. The PTW module will need to filter and report by department — inconsistent tags will cause reporting gaps. Revisit before PTW is designed.

9. **Task library for HIRA** — should Operum ship a standard task library for SA heavy industry, or is the task list fully defined per tenant? A standard library accelerates onboarding but may not match site-specific terminology. Decide before HIRA build begins.

10. **Toolbox talk — HIRA reference model** — does a toolbox talk pull active HIRAs for the shift automatically, or does the Safety Officer manually select which HIRAs to reference? Decide before toolbox talk build.

11. **Chemical import format** — define a standard CSV template for chemical register import before building the import feature. SA clients may have existing registers in SAP EHS, Excel, or a safety management system. The template must accommodate GHS classification, OEL/TLV values, and storage rules at minimum.

---

## Next Steps (in priority order)

1. Register `operum.co.za` — do tonight
2. Create Claude Project: *Operum* — upload this document + brand file + DiagnosticWand HANDOFF.md
3. Design the D1 schema for the Register module (locations → assets → measurement points → persons → documents)
4. Write `schema.sql` and Worker endpoints for the Register
5. Build artisan-facing PWA for asset browsing (read-only first — prove the register works)
6. Add safety modules on top (toolbox talks first — lowest risk, highest frequency)
7. Add maintenance modules
8. Wire DiagnosticWand as condition monitoring add-on

---

*✦ MD Works · Morney Deetlefs · South Africa · Builder of useful things for real people*
*Document generated: August 2026 · operum.co.za*
