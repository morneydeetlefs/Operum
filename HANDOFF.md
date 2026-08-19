# Operum — Handoff Notes

Field-first industrial operations platform. Register → Safety → Maintenance → Add-ons.
Built by MD Works · Morney Deetlefs · operum.co.za

---

## Live infrastructure (post-deploy)

| Piece | URL / ID |
|---|---|
| GitHub repo | https://github.com/morneydeetlefs/Operum |
| Cloudflare Pages (frontend) | https://operum.pages.dev (set up after first push) |
| Cloudflare Worker (API) | https://operum-worker.morneydeetlefs.workers.dev |
| D1 database | `operum_main` — create with: `npx wrangler d1 create operum_main` |
| Local repo path | `D:\github\Operum` |

---

## Setup sequence (first time)

```bash
# 1. Install deps
cd /d/github/Operum
npm install

# 2. Create D1 database
npx wrangler d1 create operum_main
# → Copy the database_id output into wrangler.toml

# 3. Apply schema
npx wrangler d1 execute operum_main --remote --file=schema.sql

# 4. Set JWT secret
npx wrangler secret put OPERUM_JWT_SECRET
# → Enter any strong random string

# 5. Deploy Worker
npx wrangler deploy

# 6. Connect Cloudflare Pages to GitHub repo (manual in CF dashboard)
#    Build command: (none)
#    Build output: /
#    Root directory: /
```

---

## Architecture

```
Operum (this repo)
├── app.html       — main PWA, all roles, all modules
├── worker.ts      — Cloudflare Worker API
├── schema.sql     — D1 schema
└── wrangler.toml  — CF config

DiagnosticWand (separate repo)
└── index.html     — field capture PWA, linked from Operum Condition module
```

**Token handoff:** Operum passes its JWT to DiagnosticWand via `?operum_token=` query param. DiagnosticWand does not yet consume this — full SSO integration is a future task.

---

## Module registry

Modules are declared in the `MODULES` array in `app.html`. To add a module:
1. Add one entry to `MODULES` with `{ id, label, viewId, roles, icon }`
2. Add the corresponding `<div class="module-view" id="viewId">` to the HTML
3. Nothing else changes — nav renders automatically, role scoping is automatic

---

## Current module status

| Module | Status | Notes |
|---|---|---|
| Register → Employees | ✅ Live | CRUD, role-based, soft delete |
| Register → Assets | ✅ Live | Full tree, breadcrumb, CRUD, hazards, isolation pts |
| Safety | 🔲 Stub | Phase 2 |
| Maintenance | 🔲 Stub | Phase 3 |
| Condition (DiagnosticWand) | 🔗 Link | Opens DW in new tab with token |

---

## Endpoint map

```
POST /api/auth/login                     real login (email + password)
GET  /api/auth/token                     DEV ONLY — remove before production

GET  /api/employees                      list (admin/supervisor/safety/maint-planner)
POST /api/employees                      create (admin only)
GET  /api/employees/:id                  single
PATCH /api/employees/:id                 update (admin only)
DELETE /api/employees/:id               soft delete (admin only)

GET  /api/assets                         children of ?parent_id=X, or roots if omitted
POST /api/assets                         create node
GET  /api/assets/:id                     node + children + breadcrumb
PATCH /api/assets/:id                    update node
DELETE /api/assets/:id                  delete (no children, no docs)

GET  /api/assets/:id/documents           list docs for node
POST /api/assets/:id/documents           attach doc
DELETE /api/documents/:id               remove doc

GET  /api/log                            access log (admin only)
```

---

## Role matrix

| Role | Employees | Assets | Safety | Maintenance | Condition |
|---|---|---|---|---|---|
| admin | CRUD | CRUD | ✅ | ✅ | ✅ |
| safety_manager | Read | Read | Full | — | Read |
| maintenance_planner | Read | CRUD | — | Full | Read |
| supervisor | Read | Read | Read | Read | Read |
| artisan | — | Read | Read | Execute | Read |
| operator | — | Read | Read | Notify | — |
| read_only | — | Read | Read | Read | Read |
| contractor | — | Read | — | Execute (scoped) | — |

---

## Schema notes

**employees** — bcrypt password_hash is a placeholder until real auth is hardened. Dev login accepts password `admin123` against the seed record. Replace before any real data goes in.

**assets** — same self-referencing pattern as DiagnosticWand v4.0, extended with: criticality, hazards (JSON array), isolation_pts (JSON array), manufacturer, model, serial_no, install_date. `is_measurable = 1` flags nodes that DiagnosticWand can attach readings to.

**documents** — URL-only storage. Files hosted externally (Cloudflare R2 recommended when that is built). doc_type is one of: swp, manual, msds, certificate, drawing, photo, other.

**access_log** — every significant action logged. Used for OHSA-defensible audit trail.

---

## Known shortcuts to revisit before production

1. **Dev auth** — `/api/auth/token` issues tokens to anyone. Remove before production.
2. **Password check** — dev login accepts `admin123` string comparison. Replace with real bcrypt verify.
3. **CORS_ORIGIN** — currently set to `https://operum.pages.dev` in wrangler.toml. Update once real domain is configured.
4. **DiagnosticWand SSO** — token is passed via query param but DW does not yet consume it.

---

## Next steps (in priority order)

### Immediate
1. Create GitHub repo `Operum`, push these files
2. Create D1: `npx wrangler d1 create operum_main`
3. Update `wrangler.toml` with database_id
4. Apply schema, set secret, deploy Worker
5. Connect Cloudflare Pages to repo

### Short term
6. Real password hashing — install bcryptjs in Worker, replace dev login check
7. Document upload — Cloudflare R2 bucket for file storage, presigned URLs
8. DiagnosticWand SSO — consume `?operum_token=` in DW, skip dev-auth if valid

### Phase 2 — Safety module
9. Toolbox talks (attendance, topics, sign-off)
10. BBS observations
11. Incident & near-miss reporting
12. Risk assessments
13. PTW — last, requires safety officer review of design before build

### Phase 3 — Maintenance module
14. Fault notifications
15. Work orders & job cards
16. Planned maintenance scheduling

---

## Useful commands

```bash
# From /d/github/Operum

# Deploy Worker
npx wrangler deploy

# Apply schema
npx wrangler d1 execute operum_main --remote --file=schema.sql

# Query D1 directly
npx wrangler d1 execute operum_main --remote --command="SELECT * FROM employees"

# Standard push
git add -A && git commit -m "…" && git push
```

---

## Relationship to DiagnosticWand

DiagnosticWand (`diagnostic-wand.pages.dev`) is the Condition Monitoring add-on.
It remains a separate repo and separate deployment.
Operum links to it from the Condition module with a token handoff.
When Operum's asset register is stable, DiagnosticWand's `is_measurable` nodes will
reference Operum asset IDs directly — closing the loop between the two systems.

---

*✦ MD Works · Morney Deetlefs · South Africa*
*Operum v1.0 · August 2026*
