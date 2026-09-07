# Operum — Session Handoff
## Safety + Register Modules · September 2026
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
- `allEmployees` = module-level cache for employees (shared across attendee picker and incident search)
- `chemAll` / `chemFiltered` = module-level cache arrays for chemicals list
- `toolAll` / `toolFiltered` = module-level cache arrays for tools list
- `toolEmpCache` = employee cache for tool owner/issue search (reuses allEmployees if loaded)
- Monolith stays monolithic — `app.html` will not be split into separate files
- Read live files from GitHub before touching anything — never work from stale context
- **Token expansion in Git Bash:** always set `TOKEN="..."` (uppercase) and use double-quoted node strings so `$TOKEN` expands

---

## Stack

- **Frontend:** Vanilla HTML / CSS / JS, single file `app.html` (~7650 lines), no build step
- **Backend:** Cloudflare Workers (TypeScript), single `worker.ts` (~3500 lines)
- **Database:** Cloudflare D1 (SQLite), single `operum_main` database
- **Deploy:** Cloudflare Pages (frontend) + Wrangler (Worker)

---

## What is built and deployed

### Register module

#### Employees + Asset Register
Location hierarchy, asset register (hazards, criticality, isolation points, documents), persons register. All live. Asset register is the platform spine.

#### Tools Register — completed this session, fully deployed
Three tables: `tools`, `tool_inspections`, `tool_issues`. Four tables with `swp_resources`.

**Schema (schema_tools.sql applied):**
```
tools            — LFT/INS/PPE/TLS-YYYY-NNN; ownership site|personal; status in_service|out_of_service|condemned|lost
tool_inspections — full inspection history; condemned result sets tools.status permanently
tool_issues      — issue/return per job or employee; swp_id nullable for onboarding issues
swp_resources    — resource list per SWP; resource_source freetext|register|personal; ref_id → tools.id or chemicals.id
```

**Worker v1.3 — thirteen new endpoints:**
```
POST  /api/tools                              register (LFT/INS/PPE/TLS-YYYY-NNN)
GET   /api/tools                              list (?category= &status= &ownership= &q= &overdue=1)
GET   /api/tools/:id                          single + inspection history + open issues
PATCH /api/tools/:id                          update (condemned tools locked permanently)
POST  /api/tools/:id/inspections              record inspection; condemned→permanent status change
POST  /api/tools/:id/issue                    ad hoc issue (single tool)
POST  /api/tools/:id/return                   return; damaged→out_of_service, lost→lost
GET   /api/tools/:id/swps                     SWPs that require this tool
POST  /api/swps/:id/issue-kit                 batch issue all register resources on a SWP
POST  /api/swps/:id/acknowledge-resources     artisan acknowledges freetext/personal items
GET   /api/swps/:id/resources                 SWP resource list
POST  /api/swps/:id/resources                 add resource to SWP
DELETE /api/swps/:id/resources/:rid           remove resource
```

**Issue hard-blocks (enforced in Worker):**
- `status` IN (`condemned`, `out_of_service`, `lost`) — no override ever
- `next_inspection_due` < today — overdue inspection blocks issue
- Tool already out on another job — blocks duplicate issue

**UI — fully built under Register → Tools tab:**
- List view: category filter chips (All/Lifting/Instruments/PPE/General), status filter chips (In Service/Out of Service/Condemned/Lost/⚠ Overdue), search by name/tag/serial, overdue inspection warnings (30-day amber, overdue red), status pills colour-coded
- Detail panel — three tabs: Details (all fields, WLL for lifting tackle, PPE spec for PPE, inspection section with certificate link), Inspections (full history with result pills), Issues (open issues with employee and SWP context)
- Action bar: Record Inspection (write-gated), Issue (when in service and not out), Return (when issued out) — condemned tools show no Issue button ever
- Register new tool sheet: category/ownership toggles show/hide WLL, PPE spec, owner search fields dynamically
- Record Inspection sheet: condemned result shows permanent warning banner; auto-calculates next due from interval
- Issue sheet: employee search with live filter
- Return sheet: condition selector; damaged→auto out_of_service, lost→auto lost

**Key design decisions locked:**
- Category-specific ID prefix: LFT (lifting tackle), INS (instruments), PPE, TLS (general tools)
- Personal tools registered against artisan (owner_emp_id FK) — visible in register, not issuable from stores
- Condemned status set only via inspection endpoint — cannot be set via PATCH directly
- `swp_resources.resource_source`: freetext (acknowledge only), register (issue flow), personal (no issue needed)
- Batch issue (`/issue-kit`) reports blocked tools individually — does not abort the whole kit for one blocked item
- Freetext resources (e.g. "19mm spanner") can be upgraded to register-linked on the fly for ad hoc issues

**Employee onboarding tool issue (future):** `tool_issues.swp_id` is nullable — when employee section is enhanced, new employees can be issued tools/PPE at onboarding using `issued_to_emp` without a `swp_id`. No schema migration needed.

---

### Safety module

#### Toolbox Talks
Schema, five endpoints, full UI. Shift filters, inline signing, attendee picker. Fully deployed.

#### Safe Work Procedures (SWP)
Full CRUD, steps (add/edit/delete/reorder), status workflow (draft → approved → archived). Groq LLM draft layer schema-compatible, no migration needed when it lands. SWP resource list schema (`swp_resources`) now deployed — UI not yet built.

#### BBS Observations
Field audit of SWP steps. List, new observation sheet, detail view. Fully deployed.

#### Incident Investigation
Four tables, twelve endpoints, full UI. OHSA Act 85/1993 / GAR Annexure 2 and Section 24 compliant. Fully deployed.

#### Chemicals Register — fully deployed
Two tables (`chemicals`, `asset_chemicals`), seven endpoints.

**Key capabilities:**
- CHM-YYYY-NNN server-generated ID
- JSON arrays: `hazard_classes`, `ppe_required`, `incompatible_with`
- Bidirectional incompatibility sync: when A lists B as incompatible, B's array is automatically updated
- Receipt endpoint enforces incompatibility at delivery (409 with conflict list)
- SDS version history via `access_log` (action=`sds_update`) — no separate versions table
- Public SDS route (`/api/public/chemicals/:id/sds`) — unauthenticated 302 redirect for QR codes
- Edit all fields including incompatibles picker; archive/unarchive; all writes audit-logged distinctly
- `GET /api/assets/:id/chemicals` — HIRA will use this to resolve chemicals at a location

---

## Worker endpoint map (full)

```
AUTH
  POST /api/auth/token             dev-only — remove before production
  POST /api/login

EMPLOYEES
  GET  /api/employees
  POST /api/employees
  GET  /api/employees/:id

LIBRARY
  GET  /api/library/suggest
  GET  /api/library
  POST /api/library
  PATCH /api/library/:prefix
  DELETE /api/library/:prefix

ASSETS
  GET/POST /api/assets
  GET/PATCH/DELETE /api/assets/:id
  GET  /api/assets/:id/subtree-count
  POST /api/assets/:id/copy
  GET  /api/assets/:id/documents
  DELETE /api/documents/:id
  GET  /api/log

TOOLBOX TALKS
  GET/POST /api/talks
  GET  /api/talks/:id
  POST /api/talks/:id/attend
  PATCH /api/talks/:id/attend/:emp_id

SAFE WORK PROCEDURES
  GET/POST /api/assets/:id/swps
  GET  /api/swps/:id
  PATCH /api/swps/:id
  POST /api/swps/:id/steps
  PATCH /api/swps/:id/steps/:stepId
  DELETE /api/swps/:id/steps/:stepId
  GET/POST /api/swps/:id/resources
  DELETE /api/swps/:id/resources/:rid
  POST /api/swps/:id/issue-kit
  POST /api/swps/:id/acknowledge-resources

BBS OBSERVATIONS
  GET/POST /api/bbs
  GET/PATCH /api/bbs/:id

CONDITION MONITORING
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
  POST/GET /api/chemicals
  GET/PATCH /api/chemicals/:id
  POST /api/chemicals/:id/receipt
  GET  /api/assets/:id/chemicals
  GET  /api/public/chemicals/:id/sds    (unauthenticated)

TOOLS REGISTER
  POST/GET /api/tools
  GET/PATCH /api/tools/:id
  POST /api/tools/:id/inspections
  POST /api/tools/:id/issue
  POST /api/tools/:id/return
  GET  /api/tools/:id/swps
```

---

## Key lessons learnt (session)

- **Toast auto-dismiss:** Never rely solely on setTimeout. Use CSS `@keyframes` animation as primary dismiss (compositor thread, unaffected by JS throttling). Force reflow with `void t.offsetWidth` before re-adding class so animation restarts for consecutive toasts. Keep setTimeout only as cleanup fallback.
- **Token expansion in Git Bash:** `TOKEN="..."` uppercase; node strings must be double-quoted for `$TOKEN` to expand.
- **Stale UI audit result:** All major actions already refresh correctly. Two gaps fixed: `submitEditStep` now calls `loadHubSWPs()`, `submitCommitteeReview` now calls `reloadIncidentsAll()`.

---

## Next build sequence

### Immediate
1. **SWP Resources UI** — resource list tab inside SWP editor; picker for tools register and chemicals register; freetext entry; acknowledge flow for personal/freetext items; batch issue screen
2. **BBS Observations detail view** — list and new-observation form exist; detail sheet not built

### Design discussions in progress
3. **Contractors / Services module** — full sub-contractor work order system; Q1-Q4 answered; schema design not yet started
   - Full work order system (not just approved vendor list)
   - PTW relationship: contractors can hold their own PTW auth or be on a shared permit
   - Persons register: individual contractor workers need competency/training/risk assessment proof
   - Schema design to be done before any code

### Longer horizon
- HIRA — situational model (task + location + time + people + chemicals); NOSA 3D matrix; threshold enforcement with criticality multiplier
- PTW — last, highest complexity; requires safety officer input before design
- Stores module — full stock movement audit trail; `chemical_receipts` table when built
- Groq LLM layer — SWP draft generation (schema-compatible, no migration needed)
- PDF export of Annexure 2
- Versioned MSDS — public route live, QR generation UI deferred
- Risk acceptance sign-off flow for threshold breaches
- DiagnosticWand dashboard rewiring — still broken, calls old `/api/machines` endpoints

---

## Useful commands

```bash
# From /d/github/Operum

# Deploy Worker
npx wrangler deploy --env=""

# Apply schema to live D1
npx wrangler d1 execute operum_main --remote --file=schema.sql

# Standard push (Pages auto-deploys)
git add -A && git commit -m "..." && git push

# Get JWT — run in browser DevTools console while logged in
sessionStorage.getItem('operum_token') || localStorage.getItem('operum_token')

# Test endpoint (Git Bash) — TOKEN must be uppercase, string must be double-quoted
TOKEN="eyJ..."
node -e "
fetch('https://operum-worker.morneydeetlefs.workers.dev/api/tools', {
  headers: { 'Authorization': 'Bearer $TOKEN' }
}).then(r => r.json()).then(d => console.log(JSON.stringify(d, null, 2)))
"
```

---

## To start a fresh chat

Upload `worker.ts` and `app.html` from the live repo alongside this file. Say:

> "I'm Morney Deetlefs (MD Works, South Africa). I'm continuing work on Operum — a mobile-first industrial operations PWA. Stack: Cloudflare Workers (TypeScript), D1 (SQLite), Cloudflare Pages. Read the attached HANDOFF.md, worker.ts, and app.html before doing anything."

---

*✦ MD Works · Morney Deetlefs · South Africa*
*Handoff updated: September 2026*
