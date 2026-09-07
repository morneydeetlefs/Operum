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
- `$s(selector)` = `document.querySelector`; `$(id)` = `document.getElementById`
- `escHtml(s)` = HTML escape helper
- `allEmployees` = module-level cache for employees (shared across attendee picker and incident search)
- `chemAll` / `chemFiltered` = module-level cache arrays for chemicals list
- `toolAll` / `toolFiltered` = module-level cache arrays for tools list
- `toolEmpCache` = employee cache for tool owner/issue search (reuses allEmployees if loaded)
- `qsAllAssets` = flat asset cache used by copy-subtree picker (NOT used for search — search goes via Worker `?q=`)
- Monolith stays monolithic — `app.html` will not be split into separate files
- Read live files from GitHub before touching anything — never work from stale context
- **Token in Git Bash:** always set `TOKEN="..."` (uppercase); node strings must be double-quoted so `$TOKEN` expands

---

## Human-readable label maps — always use these, never raw enum values

All label maps live near `roleLabel()` in `app.html`:

```js
nodeTypeLabel(t)        // site→Site, plant→Plant, area→Area, zone→Zone, machine→Machine
incStatusLabel(s)       // open→Open, under_investigation→Investigating, pending_committee→Committee Review, closed→Closed
swpStatusLabel(s)       // draft→Draft, approved→Approved, archived→Archived
shiftLabel(s)           // day→Day shift, night→Night shift, all_day→All-day
physStateLabel(s)       // liquid→Liquid, solid→Solid, gas→Gas, aerosol→Aerosol
inspResultLabel(r)      // pass→Pass, fail→Fail, condemned→Condemned
returnConditionLabel(c) // good→Good — returned to service, damaged→Damaged, lost→Lost
resourceTypeLabel(t)    // tool→Tool, spare→Spare, equipment→Equipment, consumable→Consumable, chemical→Chemical
roleLabel(role)         // admin→Admin, safety_manager→Safety Mgr, etc.
```

Never use `.replace(/_/g,' ')` or `.charAt(0).toUpperCase()` as a substitute — always add to the map.

---

## Stack

- **Frontend:** Vanilla HTML / CSS / JS, single file `app.html` (~7725 lines), no build step
- **Backend:** Cloudflare Workers (TypeScript), single `worker.ts` (~3494 lines)
- **Database:** Cloudflare D1 (SQLite), single `operum_main` database
- **Deploy:** Cloudflare Pages (frontend) + Wrangler (Worker)

---

## What is built and deployed

### Register module

#### Employees + Asset Register
Location hierarchy, asset register (hazards, criticality, isolation points, documents), persons register. All live.

**Asset search:** Uses `GET /api/assets?q=term` — searches full tree at any depth, no level limit. Results include a "Browse ↓" button that navigates the tree to the asset's parent and highlights the target row.

#### Tools Register — fully deployed
Four tables: `tools`, `tool_inspections`, `tool_issues`, `swp_resources`.

**Schema (schema_tools.sql applied):**
```
tools            — LFT/INS/PPE/TLS-YYYY-NNN; ownership site|personal; status in_service|out_of_service|condemned|lost
tool_inspections — full inspection history; condemned result sets tools.status permanently, irreversible
tool_issues      — issue/return per job (swp_id) or employee onboarding (swp_id nullable)
swp_resources    — resource list per SWP; resource_source freetext|register|personal; ref_id → tools.id or chemicals.id
```

**Worker v1.3 — thirteen endpoints (see full map below)**

**Issue hard-blocks:** `condemned`, `out_of_service`, `lost` status; overdue `next_inspection_due`; already issued and not returned.

**Key design decisions:**
- Category prefixes: LFT (lifting tackle / DMR Reg 18), INS (instruments / GSR 6), PPE (GSR 9), TLS (general tools)
- Condemned status set only via inspection endpoint — PATCH cannot set it directly
- Personal tools registered against artisan (owner_emp_id) — visible, not issuable from stores
- Batch issue (`/issue-kit`) reports blocked tools individually, does not abort whole kit
- `swp_resources.resource_source`: freetext (acknowledge only), register (issue flow), personal (no issue transaction)
- Freetext resources (e.g. "19mm spanner") can be upgraded to register-linked for ad hoc issues
- **Employee onboarding tool issue (future):** `tool_issues.swp_id` is nullable — no migration needed when employee section is enhanced

**UI — under Register → Tools tab:**
- Two filter rows: category (All/Lifting/Instruments/PPE/General) and status (All/In Service/Out of Service/Condemned/Lost/⚠ Overdue)
- Status defaults to All — new tools always visible immediately after registration
- After registering a new tool, filter resets to All automatically
- List: coloured category icons, status pills, 30-day inspection warnings (amber), overdue (red)
- Detail panel: three tabs — Details (all fields, WLL for lifting tackle, PPE spec for PPE, cert link), Inspections (history with result pills), Issues (open issues)
- Action bar: Record Inspection, Issue (when in service and not out), Return (when issued) — condemned shows no Issue button ever
- Register tool sheet: category/ownership toggles show/hide WLL, PPE spec, owner search dynamically
- Inspection sheet: condemned result shows permanent warning; auto-calculates next due from interval; red submit button for condemned
- Issue sheet: employee live search
- Return sheet: condition selector; damaged→auto out_of_service, lost→auto lost

---

### Safety module

#### Toolbox Talks
Schema, five endpoints, full UI. Shift filters, inline signing, attendee picker. Fully deployed.

#### Safe Work Procedures (SWP)
Full CRUD, steps (add/edit/delete/reorder), status workflow (draft → approved → archived). `swp_resources` schema deployed — **UI not yet built** (next priority).

#### BBS Observations
Field audit of SWP steps. List, new observation sheet, detail view. Fully deployed.

#### Incident Investigation
Four tables, twelve endpoints, full UI. OHSA Act 85/1993 / GAR Annexure 2 and Section 24 compliant. Fully deployed.

#### Chemicals Register — fully deployed
Two tables (`chemicals`, `asset_chemicals`), seven endpoints.
- CHM-YYYY-NNN server-generated IDs
- Bidirectional incompatibility sync — editing A's incompatible_with automatically updates B
- Receipt endpoint blocks incompatible chemicals at delivery (409 with conflict list)
- Public SDS route (`/api/public/chemicals/:id/sds`) — unauthenticated 302 redirect for QR codes
- Edit sheet with incompatibles picker; archive/unarchive; all writes audit-logged distinctly
- `GET /api/assets/:id/chemicals` — HIRA will query this for situational chemical context

---

## Worker endpoint map (complete)

```
AUTH
  POST /api/auth/token             dev-only — remove before production
  POST /api/login

EMPLOYEES
  GET/POST /api/employees
  GET  /api/employees/:id

LIBRARY (SWP suffix suggestions)
  GET  /api/library/suggest
  GET/POST /api/library
  PATCH/DELETE /api/library/:prefix

ASSETS
  GET  /api/assets                 ?parent_id= for tree nav; ?q= for full-depth search
  POST /api/assets
  GET/PATCH/DELETE /api/assets/:id
  GET  /api/assets/:id/subtree-count
  POST /api/assets/:id/copy
  GET  /api/assets/:id/documents
  DELETE /api/documents/:id
  GET  /api/assets/:id/chemicals
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
  POST/GET /api/chemicals
  GET/PATCH /api/chemicals/:id
  POST /api/chemicals/:id/receipt
  GET  /api/public/chemicals/:id/sds    (unauthenticated — for QR codes)

TOOLS REGISTER
  POST/GET /api/tools
  GET/PATCH /api/tools/:id
  POST /api/tools/:id/inspections
  POST /api/tools/:id/issue
  POST /api/tools/:id/return
  GET  /api/tools/:id/swps
```

---

## Key lessons learnt

**Toast auto-dismiss (Sep 2026):** Never rely solely on `setTimeout`. Use CSS `@keyframes` animation as primary dismiss (compositor thread, unaffected by JS throttling). Force reflow with `void t.offsetWidth` before re-adding class so animation always restarts. Keep `setTimeout` only as cleanup fallback.

**Stale UI pattern:** Every submit/save function must call the relevant list reload AND re-render the open detail panel after a successful API call. Two fixes applied: `submitEditStep` → `loadHubSWPs()`; `submitCommitteeReview` → `reloadIncidentsAll()`.

**Filter default trap:** Never default a status filter to a specific value (`in_service`) — newly created records with that status may be invisible if the filter has drifted. Default to empty (all), add an explicit "All" chip, and reset the filter to All after any create action.

**Token in Git Bash:** `TOKEN="..."` uppercase; node strings double-quoted for `$TOKEN` to expand. Lowercase `token` will not expand as `$TOKEN`.

---

## Next build sequence

### Immediate next
1. **SWP Resources UI** — resource list tab inside SWP editor; freetext entry with type selector; register picker for tools and chemicals; personal tool acknowledgement; batch issue screen. Schema (`swp_resources`) already deployed.
2. **BBS Observations detail view** — list and new-observation form exist; detail sheet not yet built.

### Design discussions in progress
3. **Contractors / Services module** — full sub-contractor work order system. Answers confirmed:
   - Full work order system (not just approved vendor list)
   - PTW: contractors may hold their own PTW auth or be on a shared permit
   - Persons: individual contractor workers need competency/training/RA proof on file
   - Schema design not yet started — do before any code

### Longer horizon
- HIRA — situational model; NOSA 3D matrix; threshold enforcement with criticality multiplier
- PTW — last, highest complexity; requires safety officer input before design
- Stores module — `chemical_receipts` table; full stock movement audit trail
- Groq LLM — SWP draft generation (schema-compatible, no migration needed)
- PDF export of Annexure 2
- DiagnosticWand dashboard rewiring — broken, still calls old `/api/machines` endpoints
- Versioned MSDS — public route live, QR generation UI deferred
- Risk acceptance sign-off flow for HIRA threshold breaches

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

# Test endpoint — TOKEN uppercase, string double-quoted
TOKEN="eyJ..."
node -e "
fetch('https://operum-worker.morneydeetlefs.workers.dev/api/tools', {
  headers: { 'Authorization': 'Bearer $TOKEN' }
}).then(r => r.json()).then(d => console.log(JSON.stringify(d, null, 2)))
"
```

---

## To start a fresh chat

Download from the live repo and upload all three files:
- `worker.ts` — https://github.com/morneydeetlefs/Operum/blob/main/worker.ts
- `app.html` — https://github.com/morneydeetlefs/Operum/blob/main/app.html
- `HANDOFF.md` — https://github.com/morneydeetlefs/Operum/blob/main/HANDOFF.md

Then say:

> "I'm Morney Deetlefs (MD Works, South Africa). I'm continuing work on Operum — a mobile-first industrial operations PWA. Stack: Cloudflare Workers (TypeScript), D1 (SQLite), Cloudflare Pages. Read the attached HANDOFF.md, worker.ts, and app.html before doing anything."

---

*✦ MD Works · Morney Deetlefs · South Africa*
*Handoff updated: September 2026*
