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

#### Incident Investigation — completed this session, fully deployed
Maps to OHSA Act 85 of 1993 / General Administrative Regulations Annexure 2 and Section 24.

**Schema — four tables deployed:**
```
incidents                  — core incident record (INC-YYYY-NNN, auto-generated server-side)
incident_investigations    — investigator assignment + findings
incident_committee_reviews — committee meeting record + endorsements (immutable once set)
incident_witnesses         — witness statements (preserved for formal inquiry / subpoena)
```
Six indexes applied.

**Worker — twelve endpoints deployed:**
```
POST  /api/incidents                          raise incident (auto-generates INC-YYYY-NNN)
GET   /api/incidents                          list (filterable by ?status=)
GET   /api/incidents/:id                      detail — returns { incident, investigations, reviews, witnesses }
PATCH /api/incidents/:id                      update incident fields
POST  /api/incidents/:id/notify               record immediate S24 telephone notification
POST  /api/incidents/:id/formal-report        mark formal written report as sent
POST  /api/incidents/:id/investigate          assign investigator (POST = assign, PATCH = submit findings)
PATCH /api/incidents/:id/investigate          submit findings, root cause, corrective actions, completed_at
POST  /api/incidents/:id/committee-review     record committee meeting
POST  /api/incidents/:id/endorse/chairperson  immutable chairperson endorsement
POST  /api/incidents/:id/endorse/employer     immutable employer endorsement + auto-close
POST  /api/incidents/:id/witnesses            add witness statement
```

**UI — fully built:**
- List view: filter chips (All / Open / Investigating / Committee / Closed), classification and status pills, overdue flags (investigation 3-day, formal report 7-day), investigator name in meta row
- Raise sheet: auto-ID (no user input), classification, datetime, description, location, affected person, body part, injury effect, machinery
- Detail panel — full-screen slide-up, four tabs:
  - **Overview:** incident narrative, dates, reported by, location, affected person, body part, effect, machinery, Section 24 reporting block (hidden for near-miss / medical treatment), immediate notification status
  - **Investigation:** investigator card, assigned/due/completed dates, overdue flag, root cause, findings, corrective actions, Submit Findings button (when status is `under_investigation`)
  - **Committee:** review card, meeting date, chairperson, endorsement pills (Chairperson ✓, Employer ○), Chairperson Endorse / Employer Endorse & Close buttons (contextual — each gated behind the previous)
  - **Witnesses:** witness list (name, contact, statement) + inline add-witness form always visible at bottom
- Action bar (context-sensitive, bottom of detail panel): Record Notification (S24 serious, not yet notified), Mark Report Sent (S24, not yet sent), Assign Investigator (open status)
- Three secondary sheets: Assign Investigator (employee search), Submit Findings, Committee Review — z-index 70 to sit above the detail panel (z-index 60)
- Employee search helper `searchEmpFor` / `selectEmpFor` — reuses `allEmployees` cache, client-side filter, one fetch on first use

**Key design decisions locked:**
- Near-miss is a first-class classification — same table, not a separate entity
- Contractor incidents use nullable employee FK; same 3-day investigation clock applies
- System-calculated deadlines — formal report 7 days from `reported_at`, investigation 3 days from `incident_at` — never user-entered
- Endorsement immutability — wrong endorsements are superseded by a new committee review record, never edited
- Section 24 block hidden entirely for `near_miss` and `medical_treatment` classifications
- `reloadIncidentsAll()` helper resets the filter chip to All and reloads the list — called after any action that changes incident status, so the updated row stays visible regardless of active filter

---

## Worker endpoint map (full — all modules)

```
AUTH
  POST /api/auth/token             dev-only, issues JWT to anyone — remove before production
  POST /api/login                  real login

EMPLOYEES
  GET  /api/employees              list all (no server-side search — filter client-side)
  POST /api/employees              create
  GET  /api/employees/:id          single

LIBRARY (SWP task library)
  GET  /api/library/suggest        suggest tasks for asset type
  GET  /api/library                list
  POST /api/library                create
  PATCH /api/library/:prefix       update
  DELETE /api/library/:prefix      delete

ASSETS
  GET  /api/assets                 list (hierarchical)
  POST /api/assets                 create
  GET/PATCH/DELETE /api/assets/:id single
  GET  /api/assets/:id/subtree-count
  POST /api/assets/:id/copy
  GET  /api/assets/:id/documents
  DELETE /api/documents/:id
  GET  /api/log

TOOLBOX TALKS
  GET  /api/talks                  list
  POST /api/talks                  create (auto-generates TBT-YYYY-NNN)
  GET  /api/talks/:id              detail
  POST /api/talks/:id/attend       add attendee
  PATCH /api/talks/:id/attend/:emp_id  update attendance / sign-off

SAFE WORK PROCEDURES
  GET  /api/assets/:id/swps        list SWPs for asset
  POST /api/assets/:id/swps        create SWP (auto-generates SWP-YYYY-NNN)
  GET  /api/swps/:id               detail
  PATCH /api/swps/:id              update
  POST /api/swps/:id/steps         add step
  PATCH /api/swps/:id/steps/:stepId  update step
  DELETE /api/swps/:id/steps/:stepId delete step

BBS OBSERVATIONS
  GET  /api/bbs                    list
  POST /api/bbs                    create
  GET  /api/bbs/:id                detail
  PATCH /api/bbs/:id               update

CONDITION MONITORING (DiagnosticWand — shared DB/Worker)
  GET  /api/assets/measurable/trends
  GET  /api/assets/measurable      assets with measurement points
  GET  /api/assets/:id/trend       trend data for asset
  POST /api/assets/:id/reset-baseline
  POST /api/diagnostics            submit reading
  GET  /api/diagnostics/recent     recent readings
  GET  /api/diagnostics            query readings

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

### Immediate next
1. **DiagnosticWand dashboard rewiring** — `dashboard.html` is deployed but broken, still calling old `/api/machines` endpoints which no longer exist. Must be rewired to current `/api/assets` endpoints. Read live `dashboard.html` and `worker.ts` before touching anything.

### Safety module — remaining
2. **Chemicals Register** (Safety sub-phase 2a) — both HIRA and Stores depend on it. Design schema first, confirm, then endpoints, then UI.
3. **HIRA** — situational model: task + location + time + people + chemicals. NOSA three-dimensional matrix: Likelihood × Severity × Exposure, scored across Health, Safety, Environment, range 1–125.
4. **BBS Observations detail view** — list and new-observation form exist; detail sheet not yet built.

### Longer horizon (locked in concept)
- PTW (Permit to Work) — last, highest complexity; requires safety officer input before design
- Stores module — scoped to inventory management only, no procurement
- Groq LLM layer — SWP draft generation (schema already compatible, slots in without migration)
- PDF export of Annexure 2
- Versioned MSDS documents with emergency QR via unauthenticated public Worker route
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

# Test an endpoint (Git Bash)
TOKEN="eyJ..."
node -e "
fetch('https://operum-worker.morneydeetlefs.workers.dev/api/incidents', {
  headers: { 'Authorization': 'Bearer ' + '$TOKEN' }
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
