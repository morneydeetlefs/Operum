# Operum — Session Handoff
## Safety Module · September 2026
### MD Works · Morney Deetlefs · South Africa

---

## Infrastructure

| Piece | Value |
|---|---|
| GitHub repo | https://github.com/morneydeetlefs/Operum |
| Cloudflare Pages (frontend) | https://operum.pages.dev/app |
| Cloudflare Worker (API) | https://operum-worker.morneydeetlefs.workers.dev |
| D1 database | `operum_main` · id `28200c87-fc11-457e-99d7-3fe1d389456a` |
| Local repo | `D:\github\Operum` (Git Bash: `/d/github/Operum`) |
| Deploy command | `npx wrangler deploy --env=""` |
| Push → deploy | `git push` triggers Cloudflare Pages auto-deploy |

Git identity configured: `morneydeetlefs` / `morneydeetlefs@gmail.com`. Wrangler logged in via OAuth.

---

## Codebase conventions — never break these

- `apiFetch` returns parsed body directly — **never** call `.json()` after it
- `employees` table has a single `name` column — not `first_name` / `last_name`
- JWT payload accessed via `actor`, not `jwtPayload`
- `$s(selector)` = `document.querySelector`; `$(id)` = element shorthand
- `escHtml(s)` = HTML escape helper
- `allEmployees` = module-level cache array, shared across attendee picker and incident employee search
- `chemAll` = module-level cache array for chemicals list; `chemFiltered` = filtered view
- Monolith stays monolithic — `app.html` will not be split into separate files
- Read live files from GitHub before touching anything — never work from stale context

---

## Stack

- **Frontend:** Vanilla HTML / CSS / JS, single file `app.html`, no build step
- **Backend:** Cloudflare Workers (TypeScript), single `worker.ts`
- **Database:** Cloudflare D1 (SQLite), single `operum_main` database
- **Deploy:** Cloudflare Pages (frontend) + Wrangler (Worker)

---

## What is built and deployed

### Register module
Location hierarchy, asset register (with hazards, criticality, isolation points, documents), persons register. All live. Asset register is the platform spine — every other module references it.

### Safety module

#### Toolbox Talks
Schema, five endpoints, full UI sub-view. Shift filters (day/night/all), inline signing, attendee picker. Fully deployed.

#### Safe Work Procedures (SWP)
SWP is the foundational safety document. Full CRUD — create, edit, steps (add/edit/delete/reorder), status workflow (draft → active → archived). Groq LLM draft layer designed to slot in via one new endpoint — schema already compatible, no migration needed when it lands.

#### BBS Observations
BBS is a field audit of a SWP — behaviour categories derived from SWP steps, not hardcoded. Observed person is optional freetext only (never a register lookup). List view, new observation sheet, detail view. Fully deployed.

#### Incident Investigation — fully deployed
Maps to OHSA Act 85 of 1993 / General Administrative Regulations Annexure 2 and Section 24.

**Schema — four tables:**
```
incidents                  — core incident record (INC-YYYY-NNN, auto-generated server-side)
incident_investigations    — investigator assignment + findings
incident_committee_reviews — committee meeting record + endorsements (immutable once set)
incident_witnesses         — witness statements (preserved for formal inquiry / subpoena)
```

**Worker — twelve endpoints:**
```
POST  /api/incidents
GET   /api/incidents
GET   /api/incidents/:id
PATCH /api/incidents/:id
POST  /api/incidents/:id/notify
POST  /api/incidents/:id/formal-report
POST  /api/incidents/:id/investigate
PATCH /api/incidents/:id/investigate
POST  /api/incidents/:id/committee-review
POST  /api/incidents/:id/endorse/chairperson
POST  /api/incidents/:id/endorse/employer
POST  /api/incidents/:id/witnesses
```

**Key design decisions locked:**
- Near-miss is a first-class classification — same table, not a separate entity
- Contractor incidents use nullable employee FK; same 3-day investigation clock applies
- System-calculated deadlines — formal report 7 days from `reported_at`, investigation 3 days from `incident_at`
- Endorsement immutability — superseded by new committee review record, never edited
- Section 24 block hidden for `near_miss` and `medical_treatment` classifications

#### Chemicals Register — completed this session, fully deployed
Safety sub-phase 2a. Both HIRA and Stores depend on this module.

**Schema — two tables, three indexes (schema_chemicals.sql applied):**
```
chemicals        — one row per substance; CHM-YYYY-NNN server-generated ID
                   JSON arrays: hazard_classes, ppe_required, incompatible_with
                   SDS fields: sds_version, sds_url, sds_issued_at, sds_expires_at
                   SDS version history via access_log (action='sds_update'), not a separate table
asset_chemicals  — composite PK junction: asset_id + chemical_id
                   quantity_on_hand maintained in-place by receipt endpoint
```

**Worker v1.2 — seven new endpoints:**
```
POST  /api/chemicals                    create (CHM-YYYY-NNN, validates incompatible_with ids)
GET   /api/chemicals                    list (?status= &physical_state= &q= substring search)
GET   /api/chemicals/:id                single + resolved asset locations
PATCH /api/chemicals/:id                update; logs 'sds_update' when SDS fields change
POST  /api/chemicals/:id/receipt        receive stock at asset node
                                        bidirectional incompatibility check → 409 with conflict list
                                        upserts quantity_on_hand in asset_chemicals
GET   /api/assets/:id/chemicals         chemicals at an asset node (HIRA will use this)
GET   /api/public/chemicals/:id/sds     UNAUTHENTICATED — 302 redirect to sds_url (QR code target)
```

**UI — fully built:**
- List view: search bar (name / UN / CAS), state filter chips (All / Liquid / Solid / Gas / Aerosol), liquid icon colour-coded by state, state pill, SDS expiry warnings (30-day amber, expired red)
- Detail panel — slide-up, three tabs:
  - **Details:** physical state, flash point, UN, CAS, IUPAC name, supplier, storage location, max quantity, SDS section (version, issued, expires with EXPIRED badge, Open SDS Document link)
  - **Hazards & PPE:** GHS hazard class tags (red), required PPE tags (green), incompatible chemicals tags (amber)
  - **Locations:** list of asset nodes where chemical is stored with quantity on hand; empty state prompts Receipt
- Action bar: View Locations, Open SDS (when sds_url present)
- New Chemical sheet (z-index 70, above detail): common name, IUPAC name, physical state, flash point, UN, CAS, supplier, storage location, max quantity + unit, SDS fields, hazard classes textarea (one per line), PPE textarea (one per line)

**Key design decisions locked:**
- CHM-YYYY-NNN sequential within year, server-generated
- JSON arrays for hazard_classes, ppe_required, incompatible_with — same pattern as asset hazards/isolation_pts
- SDS version history via access_log only (no separate versions table) — upgrade when version browsing is needed
- asset_chemicals junction table with composite PK — HIRA queries `GET /api/assets/:id/chemicals`
- Receipt endpoint only (no receipts table) — Stores module will add full stock movement audit trail
- Public SDS route before auth gate — unauthenticated 302 redirect for QR codes printed on containers
- Incompatibility is bidirectional: conflict fires if A lists B OR if B lists A

---

## Worker endpoint map (full — all modules)

```
AUTH
  POST /api/auth/token             dev-only, issues JWT to anyone — remove before production
  POST /api/login                  real login

EMPLOYEES
  GET  /api/employees              list all
  POST /api/employees              create
  GET  /api/employees/:id          single

LIBRARY (SWP task library)
  GET  /api/library/suggest
  GET  /api/library
  POST /api/library
  PATCH /api/library/:prefix
  DELETE /api/library/:prefix

ASSETS
  GET  /api/assets
  POST /api/assets
  GET/PATCH/DELETE /api/assets/:id
  GET  /api/assets/:id/subtree-count
  POST /api/assets/:id/copy
  GET  /api/assets/:id/documents
  DELETE /api/documents/:id
  GET  /api/log

TOOLBOX TALKS
  GET  /api/talks
  POST /api/talks
  GET  /api/talks/:id
  POST /api/talks/:id/attend
  PATCH /api/talks/:id/attend/:emp_id

SAFE WORK PROCEDURES
  GET  /api/assets/:id/swps
  POST /api/assets/:id/swps
  GET  /api/swps/:id
  PATCH /api/swps/:id
  POST /api/swps/:id/steps
  PATCH /api/swps/:id/steps/:stepId
  DELETE /api/swps/:id/steps/:stepId

BBS OBSERVATIONS
  GET  /api/bbs
  POST /api/bbs
  GET  /api/bbs/:id
  PATCH /api/bbs/:id

CONDITION MONITORING (DiagnosticWand — shared DB/Worker)
  GET  /api/assets/measurable/trends
  GET  /api/assets/measurable
  GET  /api/assets/:id/trend
  POST /api/assets/:id/reset-baseline
  POST /api/diagnostics
  GET  /api/diagnostics/recent
  GET  /api/diagnostics

INCIDENT INVESTIGATION
  POST  /api/incidents
  GET   /api/incidents
  GET   /api/incidents/:id
  PATCH /api/incidents/:id
  POST  /api/incidents/:id/notify
  POST  /api/incidents/:id/formal-report
  POST  /api/incidents/:id/investigate
  PATCH /api/incidents/:id/investigate
  POST  /api/incidents/:id/committee-review
  POST  /api/incidents/:id/endorse/chairperson
  POST  /api/incidents/:id/endorse/employer
  POST  /api/incidents/:id/witnesses

CHEMICALS REGISTER
  POST  /api/chemicals
  GET   /api/chemicals
  GET   /api/chemicals/:id
  PATCH /api/chemicals/:id
  POST  /api/chemicals/:id/receipt
  GET   /api/assets/:id/chemicals
  GET   /api/public/chemicals/:id/sds    (unauthenticated)
```

---

## Session rules

- **Run SQL before building UI** — schema decisions locked and confirmed before any endpoint or frontend work
- **State design decisions and get confirmation before writing code** — never assume; present options with reasoning
- **Read live files before touching anything** — always fetch from GitHub via curl or read uploaded files; stale context causes compounding errors
- **Deliver complete ready-to-use files** — not diffs or partial snippets
- **Give exact sequential terminal command blocks**
- **For complex multi-line replacements** involving TypeScript template literals, backticks, or shell metacharacters: use `python3 - << 'PYEOF'` inline scripts rather than `str_replace`
- **Locate insertion points** with `grep -n` for landmark discovery + `sed -n` for precise range reading before any write operation
- **Verify after each patch** with `grep -n` to confirm function names and element IDs are present

---

## Next build sequence

### Safety module — remaining
1. **HIRA** — situational model: task + location + time + people + chemicals. NOSA three-dimensional matrix: Likelihood × Severity × Exposure, scored across Health, Safety, Environment, range 1–125. Chemicals Register must be confirmed stable before HIRA schema work begins.
2. **BBS Observations detail view** — list and new-observation form exist; detail sheet not yet built.

### Also on the list
3. **DiagnosticWand dashboard rewiring** — `dashboard.html` is deployed but broken, still calling old `/api/machines` endpoints which no longer exist. Must be rewired to current `/api/assets` endpoints.

### Longer horizon (locked in concept)
- PTW (Permit to Work) — last, highest complexity; requires safety officer input before design
- Stores module — scoped to inventory management only, no procurement; will add `chemical_receipts` table
- Groq LLM layer — SWP draft generation (schema already compatible, slots in without migration)
- PDF export of Annexure 2
- Versioned MSDS documents with emergency QR — public route already live, QR generation UI deferred
- Risk acceptance sign-off flow for threshold breaches (named manager, immutable, timestamped)
- Mandated threshold enforcement with criticality multiplier (Critical 0.5×, High 0.75×, Medium 1.0×, Low 1.25×)

---

## Useful commands

```bash
# From /d/github/Operum

# Deploy Worker
npx wrangler deploy --env=""

# Apply schema to live D1
npx wrangler d1 execute operum_main --remote --file=schema.sql

# Standard push (Pages auto-deploys)
git add -A
git commit -m "..."
git push

# Get a JWT for API testing — run in browser DevTools console while logged in
sessionStorage.getItem('operum_token') || localStorage.getItem('operum_token')

# Test an endpoint (Git Bash) — note double-quotes so $TOKEN expands
TOKEN="eyJ..."
node -e "
fetch('https://operum-worker.morneydeetlefs.workers.dev/api/chemicals', {
  headers: { 'Authorization': 'Bearer $TOKEN' }
}).then(r => r.json()).then(d => console.log(JSON.stringify(d, null, 2)))
"
```

---

## To start a fresh chat

Upload `worker.ts` and `app.html` from the live repo alongside this file. Do not rely on this document alone — always read the live files. Say:

> "I'm Morney Deetlefs (MD Works, South Africa). I'm continuing work on Operum — a mobile-first industrial operations PWA. Stack: Cloudflare Workers (TypeScript), D1 (SQLite), Cloudflare Pages. Read the attached HANDOFF.md, worker.ts, and app.html before doing anything."

---

*✦ MD Works · Morney Deetlefs · South Africa*
*Handoff generated: September 2026*
