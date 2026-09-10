# Operum — Session Handoff
## Safety + Register + Tools Modules · September 2026
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

---

## Codebase conventions — never break these

- `apiFetch` returns parsed body directly — **never** call `.json()` after it
- `employees` table has a single `name` column — not `first_name` / `last_name`
- JWT payload accessed via `actor`, not `jwtPayload`
- `$s(selector)` = `document.querySelector`; `$(id)` = `document.getElementById`
- `escHtml(s)` = HTML escape helper
- `allEmployees` = module-level cache for employees
- `chemAll` / `chemFiltered` = module-level cache for chemicals list
- `toolAll` / `toolFiltered` = module-level cache for tools instances list
- `qsAllAssets` = flat asset cache for copy-subtree picker only — search uses Worker `?q=`
- Monolith stays monolithic — `app.html` will not be split
- Read live files from GitHub before touching anything
- **Token in Git Bash:** `TOKEN="..."` uppercase; node strings double-quoted

---

## Human-readable label maps — always use, never raw enums

All defined near `roleLabel()` in `app.html`:

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

---

## Stack

- **Frontend:** Vanilla HTML / CSS / JS, single `app.html` (~7725 lines), no build step
- **Backend:** Cloudflare Workers (TypeScript), single `worker.ts` (~3616 lines)
- **Database:** Cloudflare D1 (SQLite), `operum_main`

---

## What is built and deployed

### Register module

#### Employees + Asset Register
Full hierarchy, asset register, persons register. Asset search uses `GET /api/assets?q=` — full depth, no level limit. Results include "Browse ↓" button that navigates tree to asset's parent and highlights target row.

#### Tools Register v2 — fully deployed (schema, Worker, UI)

**Two-level model:**
- `tool_types` — catalogue entries (TTY-YYYY-NNN). One per specification e.g. "Chain Block 2T". Linked to SWP resource lists.
- `tools` — physical instances (LFT/INS/PPE/TLS-YYYY-NNN). One per physical item. Carries tag number, serial, inspection history, status.

**Schema migration applied:** `schema_tools_v2.sql`
- Dropped v1 `tools`, `tool_inspections`, `tool_issues`, `swp_resources` (test data only)
- Rebuilt all four tables plus new `tool_types` table
- `swp_resources.ref_id` now points to `tool_types.id` (not `tools.id`)
- `tool_issues` has `type_id` denormalised for reporting

**Worker v1.4 endpoints:**
```
POST /api/tool-types                     create type (TTY-YYYY-NNN)
GET  /api/tool-types                     list with available_count per type
GET  /api/tool-types/:id                 type + all instances
PATCH /api/tool-types/:id                update type fields
GET  /api/tool-types/:id/available       in-service, not-issued instances (for issue picker)
GET  /api/tool-types/:id/swps            SWPs requiring this type
POST /api/tools                          register instance (auto-generates LFT/INS/PPE/TLS-YYYY-NNN)
GET  /api/tools                          list instances (?category= &status= &type_id= &q= &overdue=1)
GET  /api/tools/:id                      instance + inspection history + open issues
PATCH /api/tools/:id                     update instance (condemned locked)
POST /api/tools/:id/inspections          record inspection; condemned permanent; auto-calculates next_due
POST /api/tools/:id/issue               ad hoc issue
POST /api/tools/:id/return              return; damaged→out_of_service, lost→lost
POST /api/swps/:id/issue-kit            batch issue with assignments [{ref_id, tool_id}]
POST /api/swps/:id/acknowledge-resources artisan acknowledges freetext/personal items
GET  /api/swps/:id/resources            resource list with available_count per type
POST /api/swps/:id/resources            add resource (ref_id → tool_types.id or chemicals.id)
DELETE /api/swps/:id/resources/:rid     remove resource
```

**Key design decisions locked:**
- SWP resource list links to `tool_types` — "requires a 2T chain block", not a specific unit
- At issue time storekeeper picks which instance from available list
- `GET /api/tool-types/:id/available` returns in-service, site-owned, not-currently-issued instances
- Condemned status set only via inspection endpoint — irreversible
- Personal tools at instance level — visible in register, not issuable from stores
- Auto-calculates `next_inspection_due` from `last_inspected_at` + `inspection_interval_days` when not provided
- `tool_issues.swp_id` nullable — supports employee onboarding issue (no SWP context)

**UI status:** DEPLOYED (commit `ff800e8`). Two-level type/instance model live.
- Type list with category chips and available-count pills
- Type detail sheet (z-60): Overview / Instances / Used in SWPs tabs
- Instance detail sheet (z-70): Details / Inspections / Issues tabs
- Register Type and Edit Type sheets (z-70)
- Register Instance sheet (z-80), pre-filled from parent type
- Inspection, Issue, Return sheets (z-80)

---

### Safety module

#### Toolbox Talks, BBS, SWP, Incidents — all fully deployed (see previous HANDOFF for detail)

#### SWP Resources tab — deployed (commit `ff800e8`)
- SWP editor now has three tabs: Steps | Resources | Approvals
- Resources tab: tool/equipment/PPE picker (searches `tool_types` register), chemical picker (searches `chemicals` register with live incompatibility warning), freetext/consumable form
- Incompatibility check: chemical picker highlights clashes against chemicals already on the resource list
- Remove button per row (draft SWP + editor role only)
- Deferred: kit issue flow, artisan acknowledge flow — endpoints live in Worker, UI placeholder only

**Future tracked items on SWP:**
- Team composition (minimum safe crew): `swp_team_roles` table — schema sketched, deferred until Contractors module
- Spares list: `resource_type='spare'`, `resource_source='register'`, `ref_id` → future `spare_parts.id` — freetext spare works today via + Freetext path

#### Chemicals Register — fully deployed
- CHM-YYYY-NNN, bidirectional incompatibility sync, receipt blocking, public SDS route
- Edit sheet with incompatibles picker, archive/unarchive, all writes audit-logged

---

## Worker endpoint map (complete)

```
AUTH
  POST /api/auth/token             dev-only
  POST /api/login

EMPLOYEES
  GET/POST /api/employees
  GET  /api/employees/:id

LIBRARY
  GET  /api/library/suggest
  GET/POST /api/library
  PATCH/DELETE /api/library/:prefix

ASSETS
  GET  /api/assets                 ?parent_id= or ?q= (full-depth search)
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

TOOLS REGISTER v2
  POST/GET /api/tool-types
  GET/PATCH /api/tool-types/:id
  GET  /api/tool-types/:id/available
  GET  /api/tool-types/:id/swps
  POST/GET /api/tools
  GET/PATCH /api/tools/:id
  POST /api/tools/:id/inspections
  POST /api/tools/:id/issue
  POST /api/tools/:id/return
```

---

## Key lessons learnt

- **Toast auto-dismiss:** CSS `@keyframes` animation + `void t.offsetWidth` reflow. Never rely on `setTimeout` alone.
- **Filter defaults:** Default to empty (all), not a specific status. Reset to All after create actions.
- **Stale UI:** Every submit must reload the relevant list AND re-render the open detail panel.
- **Token in Git Bash:** uppercase `TOKEN`, double-quoted node strings.
- **Label maps:** Always use centralised label functions — never raw enum values or `.replace(/_/g,' ')`.
- **Two-level tools model:** SWP links to type; issue flow resolves to instance at time of issue.

---

## Next session priorities

1. **BBS Observations detail view** — list and form exist; detail sheet not built

2. **Contractors / Services module** — schema design before any code:
   - Full sub-contractor work order system
   - Individual contractor worker competency records
   - PTW relationship to be designed

3. **SWP Resources — deferred flows** (kit issue + artisan acknowledge):
   - `POST /api/swps/:id/issue-kit` — storekeeper batch issue sheet (type → pick available instance)
   - `POST /api/swps/:id/acknowledge-resources` — artisan checklist on approved SWP

4. **SWP Team composition tab** — minimum safe crew per SWP:
   - Schema: `swp_team_roles` table (role_label, quantity, contractor flag, sort_order)
   - UI: Team tab in SWP editor alongside Steps / Resources / Approvals
   - Deferred until Contractors module exists to reference contractor roles properly

5. **HIRA module** — depends on Chemicals Register (complete); can begin schema design

---

## Useful commands

```bash
# Deploy Worker
npx wrangler deploy --env=""

# Apply schema
npx wrangler d1 execute operum_main --remote --file=schema_tools_v2.sql

# Push frontend
git add -A && git commit -m "..." && git push

# Get JWT (browser DevTools console)
sessionStorage.getItem('operum_token') || localStorage.getItem('operum_token')

# Test endpoint
TOKEN="eyJ..."
node -e "
fetch('https://operum-worker.morneydeetlefs.workers.dev/api/tool-types', {
  headers: { 'Authorization': 'Bearer $TOKEN' }
}).then(r => r.json()).then(d => console.log(JSON.stringify(d, null, 2)))
"
```

---

## To start a fresh chat

Download from GitHub (use Raw button) and upload all three:
- `worker.ts` — https://github.com/morneydeetlefs/Operum/blob/main/worker.ts
- `app.html` — https://github.com/morneydeetlefs/Operum/blob/main/app.html
- `HANDOFF.md` — https://github.com/morneydeetlefs/Operum/blob/main/HANDOFF.md

Then say:
> "I'm Morney Deetlefs (MD Works, South Africa). I'm continuing work on Operum — a mobile-first industrial operations PWA. Stack: Cloudflare Workers (TypeScript), D1 (SQLite), Cloudflare Pages. Read the attached HANDOFF.md, worker.ts, and app.html before doing anything."

---

*✦ MD Works · Morney Deetlefs · South Africa*
*Handoff updated: September 2026 — commit ff800e8*
