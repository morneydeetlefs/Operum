/**
 * Operum — Cloudflare Worker (worker.ts)
 * v1.1 — Register + Safety (Toolbox Talks, SWP, BBS)
 *
 * Endpoints
 * ─────────────────────────────────────────────────────────────────────────────
 * POST /api/auth/login                     issue JWT from email + password
 * GET  /api/auth/token                     DEV ONLY — issues JWT to anyone
 *
 * GET  /api/employees                      list employees (admin/supervisor only)
 * POST /api/employees                      create employee (admin only)
 * GET  /api/employees/:id                  single employee
 * PATCH /api/employees/:id                 update employee
 * DELETE /api/employees/:id               deactivate employee (soft delete)
 *
 * GET  /api/assets                         children of a node (?parent_id=X)
 *                                          omit parent_id for root nodes
 * POST /api/assets                         create any node
 * GET  /api/assets/:id                     single node + children + breadcrumb
 * PATCH /api/assets/:id                    update node fields
 * DELETE /api/assets/:id                  delete node (no children, no docs)
 * GET  /api/assets/:id/subtree-count      count of nodes in subtree (incl. root)
 * POST /api/assets/:id/copy               copy full subtree to new parent+suffix
 *
 * GET  /api/assets/:id/documents           list documents for a node
 * POST /api/assets/:id/documents           attach document to node
 * DELETE /api/documents/:id               remove document
 *
 * GET  /api/log                            access log (admin only, ?limit=&offset=)
 *
 * GET  /api/talks                          list talks (?area= &shift= &date_from= &date_to=)
 * POST /api/talks                          create talk (+ optional attendees[])
 * GET  /api/talks/:id                      single talk with full attendance list
 * POST /api/talks/:id/attend              add attendees to existing talk
 * PATCH /api/talks/:id/attend/:emp_id     mark attendee as signed
 *
 * ── Safe Work Procedures ──────────────────────────────────────────────────────
 * GET  /api/assets/:id/swps               list SWPs for an asset (approved + draft)
 * POST /api/assets/:id/swps               create SWP on an asset
 * GET  /api/swps/:id                      single SWP with full step list
 * PATCH /api/swps/:id                     update SWP title / status
 * POST /api/swps/:id/steps                add a step to a SWP
 * PATCH /api/swps/:id/steps/:stepId       update a step
 * DELETE /api/swps/:id/steps/:stepId      remove a step
 *
 * ── BBS Observations ─────────────────────────────────────────────────────────
 * GET  /api/bbs                           list observations (?asset_id= &status= &observer_id= &limit=)
 * POST /api/bbs                           create observation + step ratings in one call
 * GET  /api/bbs/:id                       single observation with SWP steps + ratings
 * PATCH /api/bbs/:id                      close observation, add outcome/followup
 *
 * ── Condition Monitoring (DiagnosticWand add-on) ─────────────────────────────
 * GET  /api/assets/measurable              flat list of measurable nodes with health status
 * GET  /api/assets/measurable/trends       last 12 readings per measurable asset (sparklines)
 * GET  /api/assets/:id/trend              readings over time for one measurable node
 * POST /api/assets/:id/reset-baseline     zero or force-set baseline_rms
 * POST /api/diagnostics                   submit a sensor reading
 * GET  /api/diagnostics/recent            last N readings across all assets (audit trail)
 * GET  /api/diagnostics?asset_id=&limit=&offset=
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface Env {
  DB: D1Database;
  OPERUM_JWT_SECRET: string;
  CORS_ORIGIN: string;          // primary — operum.pages.dev
  CORS_ORIGIN_WAND?: string;    // optional — diagnostic-wand.pages.dev (until it moves to operum.co.za)
}

type Role =
  | 'admin' | 'safety_manager' | 'maintenance_planner'
  | 'supervisor' | 'artisan' | 'operator' | 'read_only' | 'contractor';

type NodeType =
  | 'site' | 'plant' | 'system' | 'machine'
  | 'component' | 'auxiliary' | 'consumable' | 'maintainable';

type Criticality = 'critical' | 'high' | 'medium' | 'low';

interface JWTPayload {
  sub: string;        // employee id
  name: string;
  role: Role;
  areas: string[];    // area scoping
  exp: number;
}

interface AssetRow {
  id: string;
  parent_id: string | null;
  suffix: string;
  label: string;
  node_type: NodeType;
  criticality: Criticality;
  is_measurable: number;
  hazards: string;
  isolation_pts: string;
  plant_area: string | null;
  lat: number | null;
  lon: number | null;
  alt: number | null;
  machine_type: string | null;
  manufacturer: string | null;
  model: string | null;
  serial_no: string | null;
  install_date: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ─── JWT helpers ─────────────────────────────────────────────────────────────

async function signJWT(payload: JWTPayload, secret: string): Promise<string> {
  const header  = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body    = btoa(JSON.stringify(payload));
  const data    = `${header}.${body}`;
  const key     = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig     = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  const sigB64  = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return `${data}.${sigB64}`;
}

async function verifyJWT(token: string, secret: string): Promise<JWTPayload | null> {
  try {
    const [h, b, s] = token.split('.');
    const data = `${h}.${b}`;
    const key  = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    const sig  = Uint8Array.from(atob(s), c => c.charCodeAt(0));
    const ok   = await crypto.subtle.verify('HMAC', key, sig, new TextEncoder().encode(data));
    if (!ok) return null;
    const payload: JWTPayload = JSON.parse(atob(b));
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// ─── Response helpers ────────────────────────────────────────────────────────

function json(data: unknown, status = 200, corsOrigin = '*'): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    },
  });
}

function err(msg: string, status = 400, corsOrigin = '*'): Response {
  return json({ error: msg }, status, corsOrigin);
}

// ─── Role checks ─────────────────────────────────────────────────────────────

const ADMIN_ROLES: Role[]      = ['admin'];
const MANAGE_ROLES: Role[]     = ['admin', 'supervisor', 'safety_manager', 'maintenance_planner'];
const READ_ROLES: Role[]       = ['admin', 'safety_manager', 'maintenance_planner', 'supervisor', 'artisan', 'operator', 'read_only'];

function can(role: Role, allowed: Role[]): boolean {
  return allowed.includes(role);
}

// ─── Access log helper ───────────────────────────────────────────────────────

async function log(
  db: D1Database,
  employeeId: string | null,
  action: string,
  resource: string,
  detail?: unknown,
  ip?: string
): Promise<void> {
  await db.prepare(
    `INSERT INTO access_log (employee_id, action, resource, detail, ip_address)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(
    employeeId,
    action,
    resource,
    detail ? JSON.stringify(detail) : null,
    ip ?? null
  ).run();
}

// ─── Condition Monitoring helpers ────────────────────────────────────────────
// Ported from DiagnosticWand worker.ts — single source of truth now lives here.

// Field-tested sensor noise floor (~0.005g).
// A reading at or below this is indistinguishable from a phone sitting idle
// and must never be silently locked in as a baseline.
const NOISE_FLOOR_RMS = 0.005;

function statusOnly(
  rmsNum: number | null, baseline: number,
  crestNum: number | null, kurtNum: number | null,
): 'no-data' | 'no-baseline' | 'normal' | 'warning' | 'critical' {
  if (rmsNum == null) return 'no-data';
  if (baseline <= 0)  return 'no-baseline';
  const ratio        = rmsNum / baseline;
  const signalValid  = rmsNum > NOISE_FLOOR_RMS;
  const crestCrit    = signalValid && crestNum != null && crestNum >= 6.0;
  const crestWarn    = signalValid && crestNum != null && crestNum >= 5.0;
  const kurtWarn     = signalValid && kurtNum  != null && kurtNum  > 4;
  if (ratio >= 4.0 || crestCrit) return 'critical';
  if (ratio >= 2.5 || crestWarn || kurtWarn) return 'warning';
  return 'normal';
}

function assessHealth(
  rmsNum: number, baseline: number, crestNum: number,
  kurtNum: number | null, _soundNum: number,
): { status: string; ratio: number; alerts: string[] } {
  const ratio  = baseline > 0 ? rmsNum / baseline : 1;
  const alerts: string[] = [];
  if      (ratio >= 4.0) alerts.push(`RMS is ${ratio.toFixed(1)}x baseline — critical, isolate and inspect immediately`);
  else if (ratio >= 2.5) alerts.push(`RMS is ${ratio.toFixed(1)}x baseline — schedule preventive maintenance`);
  const signalValid = rmsNum > NOISE_FLOOR_RMS;
  if (signalValid && crestNum >= 6.0) alerts.push(`Crest factor ${crestNum.toFixed(2)} — severe impulsive shock loading`);
  else if (signalValid && crestNum >= 5.0) alerts.push(`Crest factor ${crestNum.toFixed(2)} — impulsive loading detected`);
  if (signalValid && kurtNum != null && kurtNum > 4) alerts.push(`Kurtosis ${kurtNum.toFixed(2)} — impulsive fault signature`);
  const status = alerts.length === 0 ? 'normal'
    : (ratio >= 4.0 || (signalValid && crestNum >= 6.0)) ? 'critical' : 'warning';
  return { status, ratio, alerts };
}

// ─── Main handler ────────────────────────────────────────────────────────────

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    // Multi-origin CORS — operum.pages.dev always allowed;
    // diagnostic-wand.pages.dev allowed until DiagnosticWand moves to operum.co.za subdomain.
    const reqOrigin = req.headers.get('Origin') ?? '';
    const origin = (env.CORS_ORIGIN_WAND && reqOrigin === env.CORS_ORIGIN_WAND)
      ? reqOrigin
      : (env.CORS_ORIGIN || '*');

    const url    = new URL(req.url);
    const path   = url.pathname;
    const method = req.method;

    // OPTIONS preflight
    if (method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        },
      });
    }

    // ── DEV AUTH — issues token to anyone ────────────────────────────────────
    if (method === 'GET' && path === '/api/auth/token') {
      const payload: JWTPayload = {
        sub: 'emp_001', name: 'Dev Admin', role: 'admin',
        areas: ['all'],
        exp: Math.floor(Date.now() / 1000) + 86400,
      };
      const token = await signJWT(payload, env.OPERUM_JWT_SECRET);
      return json({ token, payload });
    }

    // ── LOGIN ─────────────────────────────────────────────────────────────────
    if (method === 'POST' && path === '/api/auth/login') {
      const body = await req.json().catch(() => ({})) as Record<string, string>;
      const { email, password } = body;
      if (!email || !password) return err('Email and password are required', 400, origin);

      const emp = await env.DB.prepare(
        `SELECT * FROM employees WHERE email = ? AND active = 1`
      ).bind(email.toLowerCase().trim()).first<Record<string, unknown>>();

      if (!emp) return err('Invalid credentials', 401, origin);

      // Dev shortcut: accept "admin123" until real bcrypt is wired
      // TODO: replace with real bcrypt verify when auth is hardened
      const validDev = password === 'admin123' && emp.password_hash?.toString().startsWith('$2b$');
      if (!validDev) return err('Invalid credentials', 401, origin);

      const areas: string[] = JSON.parse((emp.areas as string) || '[]');
      const payload: JWTPayload = {
        sub: emp.id as string,
        name: emp.name as string,
        role: emp.role as Role,
        areas,
        exp: Math.floor(Date.now() / 1000) + 86400,
      };
      const token = await signJWT(payload, env.OPERUM_JWT_SECRET);
      await log(env.DB, emp.id as string, 'login', `employee:${emp.id}`, null, req.headers.get('CF-Connecting-IP') ?? undefined);
      return json({ token, payload });
    }

    if (!path.startsWith('/api/')) return err('Not found', 404, origin);

    // ── AUTH GATE — all routes below require valid JWT ────────────────────────
    const auth  = req.headers.get('Authorization') ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const actor = token ? await verifyJWT(token, env.OPERUM_JWT_SECRET) : null;
    if (!actor) return err('Unauthorised', 401, origin);

    const db = env.DB;
    const ip = req.headers.get('CF-Connecting-IP') ?? undefined;

    // ══════════════════════════════════════════════════════════════════════════
    // EMPLOYEES
    // ══════════════════════════════════════════════════════════════════════════

    // ── GET /api/employees ────────────────────────────────────────────────────
    if (method === 'GET' && path === '/api/employees') {
      if (!can(actor.role, MANAGE_ROLES)) return err('Forbidden', 403, origin);
      const rows = await db.prepare(
        `SELECT id, name, email, phone, role, areas, active, created_at FROM employees ORDER BY name`
      ).all();
      return json({ employees: rows.results });
    }

    // ── POST /api/employees ───────────────────────────────────────────────────
    if (method === 'POST' && path === '/api/employees') {
      if (!can(actor.role, ADMIN_ROLES)) return err('Forbidden', 403, origin);
      const b = await req.json().catch(() => ({})) as Record<string, unknown>;
      const { id, name, email, phone, role, areas } = b;
      if (!id || !name || !email || !role) return err('id, name, email, role are required', 400, origin);

      const validRoles: Role[] = ['admin','safety_manager','maintenance_planner','supervisor','artisan','operator','read_only','contractor'];
      if (!validRoles.includes(role as Role)) return err('Invalid role', 400, origin);

      await db.prepare(
        `INSERT INTO employees (id, name, email, phone, role, areas, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        String(id), String(name), String(email).toLowerCase().trim(),
        phone ? String(phone) : null,
        String(role),
        JSON.stringify(Array.isArray(areas) ? areas : []),
        actor.sub
      ).run();

      await log(db, actor.sub, 'create', `employee:${id}`, { name, role }, ip);
      const emp = await db.prepare(`SELECT * FROM employees WHERE id = ?`).bind(String(id)).first();
      return json({ employee: emp }, 201);
    }

    // ── GET /api/employees/:id ────────────────────────────────────────────────
    const empMatch = path.match(/^\/api\/employees\/([^/]+)$/);
    if (empMatch) {
      const empId = decodeURIComponent(empMatch[1]);

      if (method === 'GET') {
        if (!can(actor.role, MANAGE_ROLES) && actor.sub !== empId) return err('Forbidden', 403, origin);
        const emp = await db.prepare(
          `SELECT id, name, email, phone, role, areas, active, created_at FROM employees WHERE id = ?`
        ).bind(empId).first();
        if (!emp) return err('Not found', 404, origin);
        return json({ employee: emp });
      }

      if (method === 'PATCH') {
        if (!can(actor.role, ADMIN_ROLES)) return err('Forbidden', 403, origin);
        const b = await req.json().catch(() => ({})) as Record<string, unknown>;
        const fields: string[] = [];
        const vals: unknown[]  = [];

        if (b.name  !== undefined) { fields.push('name = ?');   vals.push(String(b.name)); }
        if (b.email !== undefined) { fields.push('email = ?');  vals.push(String(b.email).toLowerCase().trim()); }
        if (b.phone !== undefined) { fields.push('phone = ?');  vals.push(b.phone ? String(b.phone) : null); }
        if (b.role  !== undefined) { fields.push('role = ?');   vals.push(String(b.role)); }
        if (b.areas !== undefined) { fields.push('areas = ?');  vals.push(JSON.stringify(Array.isArray(b.areas) ? b.areas : [])); }
        if (b.active !== undefined) { fields.push('active = ?'); vals.push(b.active ? 1 : 0); }

        if (!fields.length) return err('No fields to update', 400, origin);
        fields.push('updated_at = ?'); vals.push(new Date().toISOString());
        vals.push(empId);

        await db.prepare(`UPDATE employees SET ${fields.join(', ')} WHERE id = ?`).bind(...vals).run();
        await log(db, actor.sub, 'update', `employee:${empId}`, b, ip);
        const emp = await db.prepare(`SELECT * FROM employees WHERE id = ?`).bind(empId).first();
        return json({ employee: emp });
      }

      if (method === 'DELETE') {
        if (!can(actor.role, ADMIN_ROLES)) return err('Forbidden', 403, origin);
        // Soft delete — set active = 0
        await db.prepare(`UPDATE employees SET active = 0, updated_at = ? WHERE id = ?`)
          .bind(new Date().toISOString(), empId).run();
        await log(db, actor.sub, 'delete', `employee:${empId}`, null, ip);
        return json({ ok: true });
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // SUFFIX LIBRARY
    // ══════════════════════════════════════════════════════════════════════════

    // ── GET /api/library/suggest ──────────────────────────────────────────────
    // Returns ordered suggestions for the suffix input field.
    // ?parent_id=X  — look at siblings under this parent to detect patterns
    // ?node_type=X  — filter library entries to those matching this node type
    //
    // Response order:
    //   1. Pattern continuations from siblings (e.g. GB-3 if GB-1, GB-2 exist)
    //   2. Library entries ordered by use_count DESC, filtered by node_type
    if (method === 'GET' && path === '/api/library/suggest') {
      const parentId  = url.searchParams.get('parent_id') || null;
      const nodeType  = url.searchParams.get('node_type') || null;

      // Step 1 — detect patterns from siblings
      const continuations: { suffix: string; description: string; source: string }[] = [];
      if (parentId) {
        const siblings = await db.prepare(
          `SELECT suffix FROM assets WHERE parent_id = ? ORDER BY suffix`
        ).bind(parentId).all<{ suffix: string }>();

        // Group siblings by prefix (letters before first digit or dash-digit)
        const prefixGroups = new Map<string, number[]>();
        for (const s of siblings.results) {
          const m = s.suffix.match(/^([A-Z]+)[- ]?(\d+)$/i);
          if (m) {
            const prefix = m[1].toUpperCase();
            const num    = parseInt(m[2], 10);
            if (!prefixGroups.has(prefix)) prefixGroups.set(prefix, []);
            prefixGroups.get(prefix)!.push(num);
          }
        }

        // Suggest next number for each detected prefix group
        for (const [prefix, nums] of prefixGroups) {
          const next    = Math.max(...nums) + 1;
          const libRow  = await db.prepare(
            `SELECT description FROM suffix_library WHERE prefix = ?`
          ).bind(prefix).first<{ description: string }>();
          continuations.push({
            suffix:      `${prefix}-${next}`,
            description: libRow ? libRow.description : prefix,
            source:      'pattern',
          });
        }
      }

      // Step 2 — library entries ordered by use_count, filtered by node_type
      // node_types MUST be in SELECT so the JS filter can read it
      const allLib = await db.prepare(
        `SELECT prefix, description, node_types, use_count FROM suffix_library ORDER BY use_count DESC, prefix ASC`
      ).all<{ prefix: string; description: string; node_types: string; use_count: number }>();

      let libRows = allLib.results;
      if (nodeType) {
        libRows = allLib.results.filter(r => {
          try {
            const types: string[] = JSON.parse(r.node_types || '[]') as string[];
            return types.includes(nodeType);
          } catch { return true; }
        });
      }

      // Remove from library list any prefixes already in continuations
      const continuationPrefixes = new Set(continuations.map(c => c.suffix.split('-')[0]));
      const library = libRows
        .filter(r => !continuationPrefixes.has(r.prefix))
        .map(r => ({ suffix: r.prefix, description: r.description, source: 'library' }));

      return json({ suggestions: [...continuations, ...library] });
    }

    // ── GET /api/library ──────────────────────────────────────────────────────
    // Full library list — used by admin settings screen.
    if (method === 'GET' && path === '/api/library') {
      if (!can(actor.role, MANAGE_ROLES)) return err('Forbidden', 403, origin);
      const rows = await db.prepare(
        `SELECT * FROM suffix_library ORDER BY use_count DESC, prefix ASC`
      ).all();
      return json({ library: rows.results });
    }

    // ── POST /api/library ─────────────────────────────────────────────────────
    // Admin adds a custom prefix to the library.
    if (method === 'POST' && path === '/api/library') {
      if (!can(actor.role, ADMIN_ROLES)) return err('Forbidden', 403, origin);
      const b = await req.json().catch(() => ({})) as Record<string, unknown>;
      const { prefix, description, node_types: nt } = b;
      if (!prefix || !description) return err('prefix and description are required', 400, origin);

      const exists = await db.prepare(`SELECT id FROM suffix_library WHERE prefix = ?`).bind(String(prefix).toUpperCase()).first();
      if (exists) return err(`Prefix "${prefix}" already exists`, 409, origin);

      await db.prepare(
        `INSERT INTO suffix_library (prefix, description, node_types, created_by)
         VALUES (?, ?, ?, ?)`
      ).bind(
        String(prefix).toUpperCase().trim(),
        String(description).trim(),
        JSON.stringify(Array.isArray(nt) ? nt : []),
        actor.sub
      ).run();

      return json({ ok: true }, 201);
    }

    // ── PATCH /api/library/:prefix ────────────────────────────────────────────
    const libMatch = path.match(/^\/api\/library\/([^/]+)$/);
    if (libMatch && method === 'PATCH') {
      if (!can(actor.role, ADMIN_ROLES)) return err('Forbidden', 403, origin);
      const prefix = decodeURIComponent(libMatch[1]).toUpperCase();
      const b = await req.json().catch(() => ({})) as Record<string, unknown>;
      const fields: string[] = [];
      const vals: unknown[]  = [];
      if (b.description !== undefined) { fields.push('description = ?'); vals.push(String(b.description)); }
      if (b.node_types  !== undefined) { fields.push('node_types = ?');  vals.push(JSON.stringify(Array.isArray(b.node_types) ? b.node_types : [])); }
      if (!fields.length) return err('No fields to update', 400, origin);
      vals.push(prefix);
      await db.prepare(`UPDATE suffix_library SET ${fields.join(', ')} WHERE prefix = ?`).bind(...vals).run();
      return json({ ok: true });
    }

    // ── DELETE /api/library/:prefix ───────────────────────────────────────────
    if (libMatch && method === 'DELETE') {
      if (!can(actor.role, ADMIN_ROLES)) return err('Forbidden', 403, origin);
      const prefix = decodeURIComponent(libMatch[1]).toUpperCase();
      // Only custom entries (created_by not null) can be deleted
      const row = await db.prepare(`SELECT created_by FROM suffix_library WHERE prefix = ?`).bind(prefix).first<{ created_by: string | null }>();
      if (!row) return err('Not found', 404, origin);
      if (!row.created_by) return err('System defaults cannot be deleted — edit node_types or description instead', 403, origin);
      await db.prepare(`DELETE FROM suffix_library WHERE prefix = ?`).bind(prefix).run();
      return json({ ok: true });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ASSETS
    // ══════════════════════════════════════════════════════════════════════════

    // ── GET /api/assets ───────────────────────────────────────────────────────
    // Supports two modes:
    //   ?q=<text>        full-text search across id and label (BBS asset picker)
    //   ?parent_id=<id>  children of a node (tree navigation); omit for root nodes
    if (method === 'GET' && path === '/api/assets') {
      if (!can(actor.role, READ_ROLES)) return err('Forbidden', 403, origin);

      const q = url.searchParams.get('q')?.trim() || null;
      if (q) {
        const pattern = `%${q}%`;
        const rows = await db.prepare(
          `SELECT a.*,
            (SELECT COUNT(*) FROM assets c WHERE c.parent_id = a.id) AS child_count
           FROM assets a
           WHERE a.id LIKE ? OR a.label LIKE ?
           ORDER BY a.id
           LIMIT 20`
        ).bind(pattern, pattern).all<AssetRow>();
        return json({ assets: rows.results }, 200, origin);
      }

      const parentId = url.searchParams.get('parent_id') || null;
      const rows = await db.prepare(
        `SELECT a.*,
          (SELECT COUNT(*) FROM assets c WHERE c.parent_id = a.id) AS child_count
         FROM assets a
         WHERE a.parent_id ${parentId ? '= ?' : 'IS NULL'}
         ORDER BY a.id`
      ).bind(...(parentId ? [parentId] : [])).all<AssetRow>();
      return json({ assets: rows.results });
    }

    // ── POST /api/assets ──────────────────────────────────────────────────────
    if (method === 'POST' && path === '/api/assets') {
      if (!can(actor.role, MANAGE_ROLES)) return err('Forbidden', 403, origin);

      const b = await req.json().catch(() => ({})) as Record<string, unknown>;
      const { suffix, label, node_type, parent_id, criticality,
              is_measurable, hazards, isolation_pts,
              plant_area, lat, lon, alt,
              machine_type, manufacturer, model, serial_no, install_date } = b;

      if (!suffix || !label || !node_type) return err('suffix, label, node_type are required', 400, origin);

      const validTypes: NodeType[] = ['site','plant','system','machine','component','auxiliary','consumable','maintainable'];
      if (!validTypes.includes(node_type as NodeType)) return err('Invalid node_type', 400, origin);

      // Construct full ID: parent_id + " " + suffix (or just suffix for root)
      let fullId: string;
      if (parent_id) {
        const parent = await db.prepare(`SELECT id FROM assets WHERE id = ?`).bind(String(parent_id)).first<AssetRow>();
        if (!parent) return err('Parent node not found', 404, origin);
        fullId = `${parent.id} ${String(suffix).trim()}`;
      } else {
        fullId = String(suffix).trim();
      }

      // Collision check
      const exists = await db.prepare(`SELECT id FROM assets WHERE id = ?`).bind(fullId).first();
      if (exists) return err(`Asset ID "${fullId}" already exists`, 409, origin);

      await db.prepare(`
        INSERT INTO assets (
          id, parent_id, suffix, label, node_type, criticality,
          is_measurable, hazards, isolation_pts,
          plant_area, lat, lon, alt,
          machine_type, manufacturer, model, serial_no, install_date,
          created_by
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).bind(
        fullId,
        parent_id ? String(parent_id) : null,
        String(suffix).trim(),
        String(label).trim(),
        String(node_type),
        String(criticality || 'medium'),
        is_measurable ? 1 : 0,
        JSON.stringify(Array.isArray(hazards) ? hazards : []),
        JSON.stringify(Array.isArray(isolation_pts) ? isolation_pts : []),
        plant_area ? String(plant_area) : null,
        lat != null ? Number(lat) : null,
        lon != null ? Number(lon) : null,
        alt != null ? Number(alt) : null,
        machine_type ? String(machine_type) : null,
        manufacturer ? String(manufacturer) : null,
        model        ? String(model)        : null,
        serial_no    ? String(serial_no)    : null,
        install_date ? String(install_date) : null,
        actor.sub
      ).run();

      // Increment use_count for the prefix used — drives suggestion ranking
      const prefixMatch = String(suffix).trim().match(/^([A-Z]+)/i);
      if (prefixMatch) {
        await db.prepare(
          `UPDATE suffix_library SET use_count = use_count + 1 WHERE prefix = ?`
        ).bind(prefixMatch[1].toUpperCase()).run();
      }

      await log(db, actor.sub, 'create', `asset:${fullId}`, { label, node_type }, ip);
      const asset = await db.prepare(`SELECT * FROM assets WHERE id = ?`).bind(fullId).first();
      return json({ asset }, 201);
    }

    // ── /api/assets/:id ───────────────────────────────────────────────────────
    const assetIdMatch = path.match(/^\/api\/assets\/([^/]+)$/);
    if (assetIdMatch) {
      const assetId = decodeURIComponent(assetIdMatch[1]);

      // GET /api/assets/:id — single node + children + breadcrumb
      if (method === 'GET') {
        const asset = await db.prepare(`SELECT * FROM assets WHERE id = ?`).bind(assetId).first<AssetRow>();
        if (!asset) return err('Not found', 404, origin);

        const children = await db.prepare(
          `SELECT * FROM assets WHERE parent_id = ? ORDER BY id`
        ).bind(assetId).all<AssetRow>();

        // Build breadcrumb by walking parent chain
        const breadcrumb: { id: string; label: string }[] = [];
        let cur: AssetRow | null = asset;
        while (cur) {
          breadcrumb.unshift({ id: cur.id, label: cur.label });
          cur = cur.parent_id
            ? await db.prepare(`SELECT * FROM assets WHERE id = ?`).bind(cur.parent_id).first<AssetRow>()
            : null;
        }

        await log(db, actor.sub, 'view', `asset:${assetId}`, null, ip);
        return json({ asset, children: children.results, breadcrumb });
      }

      // PATCH /api/assets/:id
      if (method === 'PATCH') {
        if (!can(actor.role, MANAGE_ROLES)) return err('Forbidden', 403, origin);
        const b = await req.json().catch(() => ({})) as Record<string, unknown>;
        const fields: string[] = [];
        const vals: unknown[]  = [];

        const patchable: Record<string, string> = {
          label: 'label', node_type: 'node_type', criticality: 'criticality',
          plant_area: 'plant_area', machine_type: 'machine_type',
          manufacturer: 'manufacturer', model: 'model',
          serial_no: 'serial_no', install_date: 'install_date',
        };
        for (const [k, col] of Object.entries(patchable)) {
          if (b[k] !== undefined) { fields.push(`${col} = ?`); vals.push(b[k] ? String(b[k]) : null); }
        }
        if (b.is_measurable !== undefined) { fields.push('is_measurable = ?'); vals.push(b.is_measurable ? 1 : 0); }
        if (b.hazards       !== undefined) { fields.push('hazards = ?');       vals.push(JSON.stringify(Array.isArray(b.hazards) ? b.hazards : [])); }
        if (b.isolation_pts !== undefined) { fields.push('isolation_pts = ?'); vals.push(JSON.stringify(Array.isArray(b.isolation_pts) ? b.isolation_pts : [])); }
        if (b.lat !== undefined) { fields.push('lat = ?'); vals.push(b.lat != null ? Number(b.lat) : null); }
        if (b.lon !== undefined) { fields.push('lon = ?'); vals.push(b.lon != null ? Number(b.lon) : null); }
        if (b.alt !== undefined) { fields.push('alt = ?'); vals.push(b.alt != null ? Number(b.alt) : null); }

        if (!fields.length) return err('No fields to update', 400, origin);
        fields.push('updated_at = ?'); vals.push(new Date().toISOString());
        vals.push(assetId);

        await db.prepare(`UPDATE assets SET ${fields.join(', ')} WHERE id = ?`).bind(...vals).run();
        await log(db, actor.sub, 'update', `asset:${assetId}`, b, ip);
        const asset = await db.prepare(`SELECT * FROM assets WHERE id = ?`).bind(assetId).first();
        return json({ asset });
      }

      // DELETE /api/assets/:id
      if (method === 'DELETE') {
        if (!can(actor.role, MANAGE_ROLES)) return err('Forbidden', 403, origin);

        const childCount = await db.prepare(
          `SELECT COUNT(*) as n FROM assets WHERE parent_id = ?`
        ).bind(assetId).first<{ n: number }>();
        if (childCount && childCount.n > 0) return err('Cannot delete — node has children', 409, origin);

        const docCount = await db.prepare(
          `SELECT COUNT(*) as n FROM documents WHERE asset_id = ?`
        ).bind(assetId).first<{ n: number }>();
        if (docCount && docCount.n > 0) return err('Cannot delete — node has documents attached', 409, origin);

        await db.prepare(`DELETE FROM assets WHERE id = ?`).bind(assetId).run();
        await log(db, actor.sub, 'delete', `asset:${assetId}`, null, ip);
        return json({ ok: true });
      }
    }

    // ── GET /api/assets/:id/subtree-count ────────────────────────────────────
    // Returns the total number of nodes in the subtree rooted at :id
    // (including the root node itself). Used by the copy modal to show the
    // user what they are about to copy before they confirm.
    const subtreeCountMatch = path.match(/^\/api\/assets\/([^/]+)\/subtree-count$/);
    if (subtreeCountMatch && method === 'GET') {
      const assetId = decodeURIComponent(subtreeCountMatch[1]);
      const root = await db.prepare(`SELECT id FROM assets WHERE id = ?`).bind(assetId).first();
      if (!root) return err('Not found', 404, origin);

      const result = await db.prepare(`
        WITH RECURSIVE subtree AS (
          SELECT id FROM assets WHERE id = ?
          UNION ALL
          SELECT a.id FROM assets a
          JOIN subtree s ON a.parent_id = s.id
        )
        SELECT COUNT(*) as count FROM subtree
      `).bind(assetId).first<{ count: number }>();

      return json({ count: result?.count ?? 1 });
    }

    // ── POST /api/assets/:id/copy ─────────────────────────────────────────────
    // Copies the full subtree rooted at :id to a new parent with a new suffix.
    //
    // Request body:
    //   { new_suffix: string, dest_parent_id: string | null }
    //
    // Steps:
    //   1. Fetch the full subtree via recursive CTE (root first, leaves last)
    //   2. Validate dest_parent_id exists (if provided)
    //   3. Calculate new root ID from dest_parent_id + new_suffix
    //   4. Conflict-check every new ID before inserting anything
    //   5. Insert all nodes in depth order inside a batch
    //   6. Increment suffix_library use_count for the new suffix prefix
    //   7. Log the operation
    const assetCopyMatch = path.match(/^\/api\/assets\/([^/]+)\/copy$/);
    if (assetCopyMatch && method === 'POST') {
      if (!can(actor.role, MANAGE_ROLES)) return err('Forbidden', 403, origin);

      const assetId = decodeURIComponent(assetCopyMatch[1]);
      const b = await req.json().catch(() => ({})) as Record<string, unknown>;
      const { new_suffix, dest_parent_id } = b;

      if (!new_suffix || typeof new_suffix !== 'string' || !new_suffix.trim()) {
        return err('new_suffix is required', 400, origin);
      }

      const newSuffix = (new_suffix as string).trim();

      // Step 1 — fetch full subtree ordered by depth (root first)
      const subtreeResult = await db.prepare(`
        WITH RECURSIVE subtree AS (
          SELECT *, 0 AS depth FROM assets WHERE id = ?
          UNION ALL
          SELECT a.*, s.depth + 1 FROM assets a
          JOIN subtree s ON a.parent_id = s.id
        )
        SELECT * FROM subtree ORDER BY depth ASC
      `).bind(assetId).all<AssetRow & { depth: number }>();

      const subtree = subtreeResult.results;
      if (!subtree.length) return err('Source asset not found', 404, origin);

      const sourceRoot = subtree[0];
      const sourceRootId = sourceRoot.id;

      // Step 2 — validate destination parent
      let destParentId: string | null = null;
      if (dest_parent_id && typeof dest_parent_id === 'string' && dest_parent_id.trim()) {
        destParentId = dest_parent_id.trim();
        const destParent = await db.prepare(`SELECT id FROM assets WHERE id = ?`).bind(destParentId).first();
        if (!destParent) return err('Destination parent not found', 404, origin);
      }

      // Step 3 — calculate new root ID
      const newRootId = destParentId ? `${destParentId} ${newSuffix}` : newSuffix;

      // Step 4 — conflict check every new ID before inserting anything
      // Build the full set of new IDs by replacing the source root prefix
      const newIds: string[] = subtree.map(node => {
        return node.id.replace(sourceRootId, newRootId);
      });

      for (const newId of newIds) {
        const conflict = await db.prepare(`SELECT id FROM assets WHERE id = ?`).bind(newId).first();
        if (conflict) return err(`ID "${newId}" already exists — choose a different suffix`, 409, origin);
      }

      // Step 5 — insert all nodes in depth order
      // D1 does not support true transactions via the Workers API, so we use
      // db.batch() to execute all inserts atomically.
      const now = new Date().toISOString();
      const stmts = subtree.map((node, i) => {
        const newId       = newIds[i];
        const newParentId = node.parent_id
          ? node.parent_id.replace(sourceRootId, newRootId)
          : destParentId;  // root node's parent becomes dest_parent_id
        const newNodeSuffix = node.id === sourceRootId
          ? newSuffix
          : node.suffix;   // children keep their own suffixes

        return db.prepare(`
          INSERT INTO assets (
            id, parent_id, suffix, label, node_type, criticality,
            is_measurable, hazards, isolation_pts,
            plant_area, machine_type, manufacturer, model,
            serial_no, install_date, created_by, created_at, updated_at
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `).bind(
          newId,
          newParentId,
          newNodeSuffix,
          node.label,
          node.node_type,
          node.criticality,
          node.is_measurable,
          node.hazards,
          node.isolation_pts,
          node.plant_area    ?? null,
          node.machine_type  ?? null,
          node.manufacturer  ?? null,
          node.model         ?? null,
          node.serial_no     ?? null,
          node.install_date  ?? null,
          actor.sub,
          now,
          now
        );
      });

      await db.batch(stmts);

      // Step 6 — increment use_count for the new suffix prefix
      const prefixMatch = newSuffix.match(/^([A-Z]+)/i);
      if (prefixMatch) {
        await db.prepare(
          `UPDATE suffix_library SET use_count = use_count + 1 WHERE prefix = ?`
        ).bind(prefixMatch[1].toUpperCase()).run();
      }

      // Step 7 — log
      await log(db, actor.sub, 'copy', `asset:${sourceRootId}→${newRootId}`, { copied_count: subtree.length }, ip);

      return json({ root_id: newRootId, copied_count: subtree.length }, 201);
    }

    // ── GET /api/assets/:id/documents ─────────────────────────────────────────
    const assetDocsMatch = path.match(/^\/api\/assets\/([^/]+)\/documents$/);
    if (assetDocsMatch) {
      const assetId = decodeURIComponent(assetDocsMatch[1]);

      if (method === 'GET') {
        const docs = await db.prepare(
          `SELECT d.*, e.name as uploaded_by_name
           FROM documents d
           LEFT JOIN employees e ON e.id = d.uploaded_by
           WHERE d.asset_id = ?
           ORDER BY d.uploaded_at DESC`
        ).bind(assetId).all();
        return json({ documents: docs.results });
      }

      if (method === 'POST') {
        if (!can(actor.role, MANAGE_ROLES)) return err('Forbidden', 403, origin);
        const b = await req.json().catch(() => ({})) as Record<string, unknown>;
        const { doc_type, title, url: docUrl } = b;
        if (!doc_type || !title || !docUrl) return err('doc_type, title, url are required', 400, origin);

        const result = await db.prepare(
          `INSERT INTO documents (asset_id, doc_type, title, url, uploaded_by)
           VALUES (?, ?, ?, ?, ?)`
        ).bind(assetId, String(doc_type), String(title), String(docUrl), actor.sub).run();

        await log(db, actor.sub, 'create', `document:${assetId}/${doc_type}`, { title }, ip);
        return json({ ok: true, id: result.meta.last_row_id }, 201);
      }
    }

    // ── DELETE /api/documents/:id ─────────────────────────────────────────────
    const docDeleteMatch = path.match(/^\/api\/documents\/(\d+)$/);
    if (docDeleteMatch && method === 'DELETE') {
      if (!can(actor.role, MANAGE_ROLES)) return err('Forbidden', 403, origin);
      const docId = docDeleteMatch[1];
      await db.prepare(`DELETE FROM documents WHERE id = ?`).bind(Number(docId)).run();
      await log(db, actor.sub, 'delete', `document:${docId}`, null, ip);
      return json({ ok: true });
    }

    // ── GET /api/log ──────────────────────────────────────────────────────────
    if (method === 'GET' && path === '/api/log') {
      if (!can(actor.role, ADMIN_ROLES)) return err('Forbidden', 403, origin);
      const limit  = Math.min(Number(url.searchParams.get('limit')  ?? '50'), 500);
      const offset = Math.max(Number(url.searchParams.get('offset') ?? '0'),  0);
      const rows = await db.prepare(
        `SELECT l.*, e.name as employee_name
         FROM access_log l
         LEFT JOIN employees e ON e.id = l.employee_id
         ORDER BY l.timestamp DESC LIMIT ? OFFSET ?`
      ).bind(limit, offset).all();
      const total = await db.prepare(`SELECT COUNT(*) as n FROM access_log`).first<{ n: number }>();
      return json({ log: rows.results, total: total?.n ?? 0, limit, offset });
    }


    // ══════════════════════════════════════════════════════════════════════════
    // TOOLBOX TALKS
    // ══════════════════════════════════════════════════════════════════════════

    // ── GET /api/talks ────────────────────────────────────────────────────────
    // Query params: area, shift, date_from, date_to (all optional)
    // Returns: list of talks with attendance summary counts.
    if (method === 'GET' && path === '/api/talks') {
      if (!can(actor.role, READ_ROLES)) return err('Forbidden', 403, origin);

      const area      = url.searchParams.get('area')      || null;
      const shift     = url.searchParams.get('shift')     || null;
      const dateFrom  = url.searchParams.get('date_from') || null;
      const dateTo    = url.searchParams.get('date_to')   || null;

      let sql = `
        SELECT
          t.id, t.title, t.conducted_by, t.area, t.shift, t.talk_date, t.notes, t.created_at,
          COUNT(a.id) AS attendance_total,
          SUM(CASE WHEN a.signed = 1 THEN 1 ELSE 0 END) AS attendance_signed
        FROM toolbox_talks t
        LEFT JOIN talk_attendance a ON a.talk_id = t.id
        WHERE 1=1
      `;
      const bindings: (string | null)[] = [];

      if (area)     { sql += ` AND t.area = ?`;       bindings.push(area); }
      if (shift)    { sql += ` AND t.shift = ?`;      bindings.push(shift); }
      if (dateFrom) { sql += ` AND t.talk_date >= ?`; bindings.push(dateFrom); }
      if (dateTo)   { sql += ` AND t.talk_date <= ?`; bindings.push(dateTo); }

      sql += ` GROUP BY t.id ORDER BY t.talk_date DESC LIMIT 100`;

      const result = await db.prepare(sql).bind(...bindings).all();
      return json({ talks: result.results });
    }

    // ── POST /api/talks ───────────────────────────────────────────────────────
    // Body: { title, area?, shift?, talk_date, notes?, attendees?: string[] }
    // conducted_by is taken from JWT sub.
    if (method === 'POST' && path === '/api/talks') {
      if (!can(actor.role, MANAGE_ROLES)) return err('Forbidden', 403, origin);

      const b = await req.json().catch(() => ({})) as {
        title?: string; area?: string; shift?: string;
        talk_date?: string; notes?: string; attendees?: string[];
      };

      if (!b.title?.trim())     return err('title is required', 400, origin);
      if (!b.talk_date?.trim()) return err('talk_date is required', 400, origin);
      if (b.shift && !['day','night'].includes(b.shift)) return err('shift must be day or night', 400, origin);

      // Generate ID: TBT-YYYY-NNN (sequential within year)
      const year = b.talk_date.slice(0, 4);
      const countRow = await db.prepare(
        `SELECT COUNT(*) AS n FROM toolbox_talks WHERE talk_date LIKE ?`
      ).bind(`${year}%`).first<{ n: number }>();
      const seq = String((countRow?.n ?? 0) + 1).padStart(3, '0');
      const id  = `TBT-${year}-${seq}`;

      await db.prepare(`
        INSERT INTO toolbox_talks (id, title, conducted_by, area, shift, talk_date, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id,
        b.title.trim(),
        actor.sub,
        b.area?.trim()  ?? null,
        b.shift         ?? null,
        b.talk_date,
        b.notes?.trim() ?? null
      ).run();

      if (b.attendees?.length) {
        const stmts = b.attendees.map(empId =>
          db.prepare(`INSERT INTO talk_attendance (talk_id, emp_id) VALUES (?, ?)`)
            .bind(id, empId)
        );
        await db.batch(stmts);
      }

      await log(db, actor.sub, 'create', `talk:${id}`, { title: b.title }, ip);
      return json({ id }, 201);
    }

    // ── GET /api/talks/:id ────────────────────────────────────────────────────
    // Returns talk record + full attendance list with employee names.
    const talkDetailMatch = path.match(/^\/api\/talks\/([A-Z0-9-]+)$/);
    if (method === 'GET' && talkDetailMatch) {
      if (!can(actor.role, READ_ROLES)) return err('Forbidden', 403, origin);

      const talkId = talkDetailMatch[1];
      const talk   = await db.prepare(`SELECT * FROM toolbox_talks WHERE id = ?`).bind(talkId).first();
      if (!talk) return err('Talk not found', 404, origin);

      const attendance = await db.prepare(`
        SELECT a.id, a.emp_id, a.signed, a.signed_at, e.name
        FROM talk_attendance a
        LEFT JOIN employees e ON e.id = a.emp_id
        WHERE a.talk_id = ?
        ORDER BY e.name
      `).bind(talkId).all();

      await log(db, actor.sub, 'view', `talk:${talkId}`, null, ip);
      return json({ talk, attendance: attendance.results });
    }

    // ── POST /api/talks/:id/attend ────────────────────────────────────────────
    // Body: { attendees: string[] } — add attendees; silently skips duplicates.
    const attendAddMatch = path.match(/^\/api\/talks\/([A-Z0-9-]+)\/attend$/);
    if (method === 'POST' && attendAddMatch) {
      if (!can(actor.role, MANAGE_ROLES)) return err('Forbidden', 403, origin);

      const talkId = attendAddMatch[1];
      const talk   = await db.prepare(`SELECT id FROM toolbox_talks WHERE id = ?`).bind(talkId).first();
      if (!talk) return err('Talk not found', 404, origin);

      const b = await req.json().catch(() => ({})) as { attendees?: string[] };
      if (!b.attendees?.length) return err('attendees array is required', 400, origin);

      const existing = await db.prepare(
        `SELECT emp_id FROM talk_attendance WHERE talk_id = ?`
      ).bind(talkId).all<{ emp_id: string }>();
      const existingIds = new Set(existing.results.map(r => r.emp_id));

      const newAttendees = b.attendees.filter(empId => !existingIds.has(empId));
      if (newAttendees.length) {
        const stmts = newAttendees.map(empId =>
          db.prepare(`INSERT INTO talk_attendance (talk_id, emp_id) VALUES (?, ?)`).bind(talkId, empId)
        );
        await db.batch(stmts);
      }

      await log(db, actor.sub, 'update', `talk:${talkId}/attend`, { added: newAttendees.length }, ip);
      return json({ added: newAttendees.length, skipped: b.attendees.length - newAttendees.length });
    }

    // ── PATCH /api/talks/:id/attend/:emp_id ──────────────────────────────────
    // Marks one attendee as signed. No body required.
    const signMatch = path.match(/^\/api\/talks\/([A-Z0-9-]+)\/attend\/([^/]+)$/);
    if (method === 'PATCH' && signMatch) {
      if (!can(actor.role, READ_ROLES)) return err('Forbidden', 403, origin);

      const talkId = signMatch[1];
      const empId  = decodeURIComponent(signMatch[2]);
      const now    = new Date().toISOString();

      const result = await db.prepare(`
        UPDATE talk_attendance SET signed = 1, signed_at = ?
        WHERE talk_id = ? AND emp_id = ?
      `).bind(now, talkId, empId).run();

      if (!result.meta.changes) return err('Attendance record not found', 404, origin);

      await log(db, actor.sub, 'update', `talk:${talkId}/sign/${empId}`, null, ip);
      return json({ signed: true, signed_at: now });
    }

    // ── END TOOLBOX TALKS ─────────────────────────────────────────────────────

    // ══════════════════════════════════════════════════════════════════════════
    // SAFE WORK PROCEDURES
    // ══════════════════════════════════════════════════════════════════════════

    // ── GET /api/assets/:id/swps ──────────────────────────────────────────────
    // List all SWPs on one asset. Returns draft + approved by default.
    // ?status=approved returns only approved SWPs (used by BBS observation picker).
    const assetSwpsMatch = path.match(/^\/api\/assets\/([^/]+)\/swps$/);
    if (assetSwpsMatch && method === 'GET') {
      if (!can(actor.role, READ_ROLES)) return err('Forbidden', 403, origin);
      const assetId     = decodeURIComponent(assetSwpsMatch[1]);
      const statusFilter = url.searchParams.get('status') || null;

      const asset = await db.prepare('SELECT id FROM assets WHERE id = ?').bind(assetId).first();
      if (!asset) return err('Asset not found', 404, origin);

      let sql = `
        SELECT s.id, s.title, s.status, s.approved_at,
               e.name AS approved_by_name,
               c.name AS created_by_name,
               s.created_at, s.updated_at,
               COUNT(st.id) AS step_count
        FROM swps s
        LEFT JOIN employees e ON e.id = s.approved_by
        LEFT JOIN employees c ON c.id = s.created_by
        LEFT JOIN swp_steps st ON st.swp_id = s.id
        WHERE s.asset_id = ?
      `;
      const bindings: unknown[] = [assetId];

      if (statusFilter) { sql += ` AND s.status = ?`; bindings.push(statusFilter); }
      sql += ` GROUP BY s.id ORDER BY s.created_at DESC`;

      const { results } = await db.prepare(sql).bind(...bindings).all();
      return json({ swps: results }, 200, origin);
    }

    // ── POST /api/assets/:id/swps ─────────────────────────────────────────────
    // Create a new SWP on an asset. Body: { title, steps?: Step[] }
    // steps is optional on creation — steps can be added via POST /api/swps/:id/steps.
    // Only safety_manager or admin can create; supervisor can create drafts.
    const assetSwpsPostMatch = path.match(/^\/api\/assets\/([^/]+)\/swps$/);
    if (assetSwpsPostMatch && method === 'POST') {
      if (!can(actor.role, ['admin','safety_manager','supervisor'] as Role[])) return err('Forbidden', 403, origin);
      const assetId = decodeURIComponent(assetSwpsPostMatch[1]);

      const asset = await db.prepare('SELECT id FROM assets WHERE id = ?').bind(assetId).first();
      if (!asset) return err('Asset not found', 404, origin);

      const b = await req.json().catch(() => ({})) as {
        title?: string;
        steps?: Array<{ description: string; hazards?: string[]; ppe_required?: string[]; precautions?: string }>;
      };
      if (!b.title?.trim()) return err('title is required', 400, origin);

      // Generate ID: SWP-YYYY-NNN sequential within year
      const year     = new Date().getFullYear().toString();
      const countRow = await db.prepare(
        `SELECT COUNT(*) AS n FROM swps WHERE id LIKE ?`
      ).bind(`SWP-${year}-%`).first<{ n: number }>();
      const seq = String((countRow?.n ?? 0) + 1).padStart(3, '0');
      const id  = `SWP-${year}-${seq}`;

      await db.prepare(`
        INSERT INTO swps (id, asset_id, title, status, created_by)
        VALUES (?, ?, ?, 'draft', ?)
      `).bind(id, assetId, b.title.trim(), actor.sub).run();

      // Optional inline steps
      if (b.steps?.length) {
        const stmts = b.steps.map((step, i) =>
          db.prepare(`
            INSERT INTO swp_steps (swp_id, step_order, description, hazards, ppe_required, precautions)
            VALUES (?, ?, ?, ?, ?, ?)
          `).bind(
            id,
            (i + 1) * 10,   // 10, 20, 30 — gaps allow reorder without renumbering
            step.description.trim(),
            JSON.stringify(step.hazards ?? []),
            JSON.stringify(step.ppe_required ?? []),
            step.precautions?.trim() ?? null,
          )
        );
        await db.batch(stmts);
      }

      await log(db, actor.sub, 'create', `swp:${id}`, { asset_id: assetId, title: b.title }, ip);
      return json({ id }, 201, origin);
    }

    // ── GET /api/swps/:id ─────────────────────────────────────────────────────
    // Single SWP with full ordered step list.
    const swpDetailMatch = path.match(/^\/api\/swps\/([A-Z0-9-]+)$/);
    if (swpDetailMatch && method === 'GET') {
      if (!can(actor.role, READ_ROLES)) return err('Forbidden', 403, origin);
      const swpId = swpDetailMatch[1];

      const swp = await db.prepare(`
        SELECT s.*, a.label AS asset_label, a.id AS asset_id,
               e.name AS approved_by_name, c.name AS created_by_name
        FROM swps s
        LEFT JOIN assets a ON a.id = s.asset_id
        LEFT JOIN employees e ON e.id = s.approved_by
        LEFT JOIN employees c ON c.id = s.created_by
        WHERE s.id = ?
      `).bind(swpId).first();
      if (!swp) return err('SWP not found', 404, origin);

      const { results: steps } = await db.prepare(`
        SELECT * FROM swp_steps WHERE swp_id = ? ORDER BY step_order ASC
      `).bind(swpId).all();

      await log(db, actor.sub, 'view', `swp:${swpId}`, null, ip);
      return json({ swp, steps }, 200, origin);
    }

    // ── PATCH /api/swps/:id ───────────────────────────────────────────────────
    // Update SWP title or status. Approving sets approved_by + approved_at.
    // Archiving a SWP that has open BBS observations is blocked.
    if (swpDetailMatch && method === 'PATCH') {
      if (!can(actor.role, ['admin','safety_manager'] as Role[])) return err('Forbidden', 403, origin);
      const swpId = swpDetailMatch[1];

      const swp = await db.prepare('SELECT id, status FROM swps WHERE id = ?').bind(swpId).first<{ id: string; status: string }>();
      if (!swp) return err('SWP not found', 404, origin);

      const b = await req.json().catch(() => ({})) as { title?: string; status?: string };

      // Block archive if open BBS observations reference this SWP
      if (b.status === 'archived') {
        const openObs = await db.prepare(
          `SELECT COUNT(*) AS n FROM bbs_observations WHERE swp_id = ? AND status = 'open'`
        ).bind(swpId).first<{ n: number }>();
        if ((openObs?.n ?? 0) > 0) return err('Cannot archive — SWP has open BBS observations', 409, origin);
      }

      const now = new Date().toISOString();
      let approvedBy: string | null = null;
      let approvedAt: string | null = null;

      if (b.status === 'approved') {
        approvedBy = actor.sub;
        approvedAt = now;
      }

      await db.prepare(`
        UPDATE swps SET
          title      = COALESCE(?, title),
          status     = COALESCE(?, status),
          approved_by = CASE WHEN ? IS NOT NULL THEN ? ELSE approved_by END,
          approved_at = CASE WHEN ? IS NOT NULL THEN ? ELSE approved_at END,
          updated_at = ?
        WHERE id = ?
      `).bind(
        b.title?.trim() ?? null,
        b.status ?? null,
        approvedBy, approvedBy,
        approvedAt, approvedAt,
        now,
        swpId,
      ).run();

      await log(db, actor.sub, 'update', `swp:${swpId}`, { status: b.status }, ip);
      return json({ ok: true }, 200, origin);
    }

    // ── POST /api/swps/:id/steps ──────────────────────────────────────────────
    // Add one step to a SWP. SWP must be in draft status.
    // Body: { description, hazards?, ppe_required?, precautions?, step_order? }
    const swpStepsMatch = path.match(/^\/api\/swps\/([A-Z0-9-]+)\/steps$/);
    if (swpStepsMatch && method === 'POST') {
      if (!can(actor.role, ['admin','safety_manager','supervisor'] as Role[])) return err('Forbidden', 403, origin);
      const swpId = swpStepsMatch[1];

      const swp = await db.prepare('SELECT id, status FROM swps WHERE id = ?').bind(swpId).first<{ id: string; status: string }>();
      if (!swp)               return err('SWP not found', 404, origin);
      if (swp.status !== 'draft') return err('Steps can only be added to a draft SWP', 409, origin);

      const b = await req.json().catch(() => ({})) as {
        description?: string; hazards?: string[]; ppe_required?: string[];
        precautions?: string; step_order?: number;
      };
      if (!b.description?.trim()) return err('description is required', 400, origin);

      // Auto-assign step_order as max + 10 if not provided
      let order = b.step_order ?? null;
      if (order == null) {
        const maxRow = await db.prepare(
          `SELECT MAX(step_order) AS m FROM swp_steps WHERE swp_id = ?`
        ).bind(swpId).first<{ m: number | null }>();
        order = (maxRow?.m ?? 0) + 10;
      }

      const result = await db.prepare(`
        INSERT INTO swp_steps (swp_id, step_order, description, hazards, ppe_required, precautions)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        swpId,
        order,
        b.description.trim(),
        JSON.stringify(b.hazards ?? []),
        JSON.stringify(b.ppe_required ?? []),
        b.precautions?.trim() ?? null,
      ).run();

      await log(db, actor.sub, 'create', `swp:${swpId}/step`, { step_order: order }, ip);
      return json({ id: result.meta.last_row_id }, 201, origin);
    }

    // ── PATCH /api/swps/:id/steps/:stepId ────────────────────────────────────
    // Update one step. SWP must be in draft status.
    const swpStepEditMatch = path.match(/^\/api\/swps\/([A-Z0-9-]+)\/steps\/(\d+)$/);
    if (swpStepEditMatch && method === 'PATCH') {
      if (!can(actor.role, ['admin','safety_manager','supervisor'] as Role[])) return err('Forbidden', 403, origin);
      const swpId  = swpStepEditMatch[1];
      const stepId = Number(swpStepEditMatch[2]);

      const swp = await db.prepare('SELECT id, status FROM swps WHERE id = ?').bind(swpId).first<{ id: string; status: string }>();
      if (!swp)               return err('SWP not found', 404, origin);
      if (swp.status !== 'draft') return err('Steps can only be edited on a draft SWP', 409, origin);

      const b = await req.json().catch(() => ({})) as {
        description?: string; hazards?: string[]; ppe_required?: string[];
        precautions?: string; step_order?: number;
      };

      const changes = await db.prepare(`
        UPDATE swp_steps SET
          description  = COALESCE(?, description),
          hazards      = COALESCE(?, hazards),
          ppe_required = COALESCE(?, ppe_required),
          precautions  = COALESCE(?, precautions),
          step_order   = COALESCE(?, step_order)
        WHERE id = ? AND swp_id = ?
      `).bind(
        b.description?.trim()           ?? null,
        b.hazards    ? JSON.stringify(b.hazards)      : null,
        b.ppe_required ? JSON.stringify(b.ppe_required) : null,
        b.precautions?.trim()           ?? null,
        b.step_order                    ?? null,
        stepId, swpId,
      ).run();

      if (!changes.meta.changes) return err('Step not found', 404, origin);
      await log(db, actor.sub, 'update', `swp:${swpId}/step:${stepId}`, null, ip);
      return json({ ok: true }, 200, origin);
    }

    // ── DELETE /api/swps/:id/steps/:stepId ───────────────────────────────────
    // Remove one step. SWP must be in draft status.
    // Blocked if any BBS observation has rated this step.
    if (swpStepEditMatch && method === 'DELETE') {
      if (!can(actor.role, ['admin','safety_manager'] as Role[])) return err('Forbidden', 403, origin);
      const swpId  = swpStepEditMatch[1];
      const stepId = Number(swpStepEditMatch[2]);

      const swp = await db.prepare('SELECT id, status FROM swps WHERE id = ?').bind(swpId).first<{ id: string; status: string }>();
      if (!swp)               return err('SWP not found', 404, origin);
      if (swp.status !== 'draft') return err('Steps can only be removed from a draft SWP', 409, origin);

      const rated = await db.prepare(
        `SELECT COUNT(*) AS n FROM bbs_step_ratings WHERE swp_step_id = ?`
      ).bind(stepId).first<{ n: number }>();
      if ((rated?.n ?? 0) > 0) return err('Cannot remove — step has BBS observation ratings against it', 409, origin);

      await db.prepare(`DELETE FROM swp_steps WHERE id = ? AND swp_id = ?`).bind(stepId, swpId).run();
      await log(db, actor.sub, 'delete', `swp:${swpId}/step:${stepId}`, null, ip);
      return json({ ok: true }, 200, origin);
    }

    // ── END SAFE WORK PROCEDURES ──────────────────────────────────────────────

    // ══════════════════════════════════════════════════════════════════════════
    // BBS OBSERVATIONS
    // ══════════════════════════════════════════════════════════════════════════

    // ── GET /api/bbs ──────────────────────────────────────────────────────────
    // List observations. Filters: ?asset_id= &status= &observer_id= &limit=
    if (method === 'GET' && path === '/api/bbs') {
      if (!can(actor.role, READ_ROLES)) return err('Forbidden', 403, origin);

      const assetId    = url.searchParams.get('asset_id')    || null;
      const statusF    = url.searchParams.get('status')      || null;
      const observerId = url.searchParams.get('observer_id') || null;
      const limit      = Math.min(Number(url.searchParams.get('limit') ?? '50'), 200);

      let sql = `
        SELECT
          o.id, o.asset_id, o.swp_id, o.observed_person, o.area, o.shift,
          o.observed_at, o.status, o.conversation_held, o.followup_required,
          o.followup_notes, o.closed_at, o.created_at,
          a.label  AS asset_label,
          s.title  AS swp_title,
          e.name   AS observed_by_name,
          COUNT(r.id) AS step_count,
          SUM(CASE WHEN r.rating = 'at_risk' THEN 1 ELSE 0 END) AS at_risk_count
        FROM bbs_observations o
        LEFT JOIN assets a ON a.id = o.asset_id
        LEFT JOIN swps s   ON s.id = o.swp_id
        LEFT JOIN employees e ON e.id = o.observed_by
        LEFT JOIN bbs_step_ratings r ON r.observation_id = o.id
        WHERE 1=1
      `;
      const bindings: unknown[] = [];

      if (assetId)    { sql += ` AND o.asset_id = ?`;    bindings.push(assetId); }
      if (statusF)    { sql += ` AND o.status = ?`;      bindings.push(statusF); }
      if (observerId) { sql += ` AND o.observed_by = ?`; bindings.push(observerId); }

      sql += ` GROUP BY o.id ORDER BY o.observed_at DESC LIMIT ?`;
      bindings.push(limit);

      const { results } = await db.prepare(sql).bind(...bindings).all();
      return json({ observations: results }, 200, origin);
    }

    // ── POST /api/bbs ─────────────────────────────────────────────────────────
    // Create one complete observation including all step ratings in one call.
    // The SWP must be approved. Ratings must cover all non-archived steps.
    // Body: {
    //   asset_id, swp_id, observed_person?, area?, shift?, observed_at,
    //   conversation_held?, followup_required?, followup_notes?,
    //   ratings: [{ swp_step_id, rating, comment? }]
    // }
    if (method === 'POST' && path === '/api/bbs') {
      // Observers: admin, safety_manager, supervisor, artisan
      if (!can(actor.role, ['admin','safety_manager','supervisor','artisan'] as Role[])) return err('Forbidden', 403, origin);

      const b = await req.json().catch(() => ({})) as {
        asset_id?: string; swp_id?: string; observed_person?: string;
        area?: string; shift?: string; observed_at?: string;
        conversation_held?: boolean; followup_required?: boolean;
        followup_notes?: string;
        ratings?: Array<{ swp_step_id: number; rating: string; comment?: string }>;
      };

      if (!b.asset_id)    return err('asset_id is required', 400, origin);
      if (!b.swp_id)      return err('swp_id is required', 400, origin);
      if (!b.observed_at) return err('observed_at is required', 400, origin);
      if (!b.ratings?.length) return err('ratings array is required and must not be empty', 400, origin);
      if (b.shift && !['day','night'].includes(b.shift)) return err('shift must be day or night', 400, origin);

      // Validate asset exists
      const asset = await db.prepare('SELECT id FROM assets WHERE id = ?').bind(b.asset_id).first();
      if (!asset) return err('Asset not found', 404, origin);

      // Validate SWP exists on this asset and is approved
      const swp = await db.prepare(
        `SELECT id, status FROM swps WHERE id = ? AND asset_id = ?`
      ).bind(b.swp_id, b.asset_id).first<{ id: string; status: string }>();
      if (!swp)                   return err('SWP not found on this asset', 404, origin);
      if (swp.status !== 'approved') return err('Only approved SWPs can be used in an observation', 409, origin);

      // Validate all step IDs belong to this SWP
      const { results: swpSteps } = await db.prepare(
        `SELECT id FROM swp_steps WHERE swp_id = ?`
      ).bind(b.swp_id).all<{ id: number }>();
      const validStepIds = new Set(swpSteps.map((s: { id: number }) => s.id));

      for (const r of b.ratings) {
        if (!validStepIds.has(r.swp_step_id)) {
          return err(`Step ${r.swp_step_id} does not belong to SWP ${b.swp_id}`, 400, origin);
        }
        if (!['safe','at_risk','not_applicable'].includes(r.rating)) {
          return err(`Invalid rating "${r.rating}" — must be safe, at_risk, or not_applicable`, 400, origin);
        }
      }

      // Insert observation
      const obsResult = await db.prepare(`
        INSERT INTO bbs_observations
          (asset_id, swp_id, observed_by, observed_person, area, shift,
           observed_at, conversation_held, followup_required, followup_notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        b.asset_id,
        b.swp_id,
        actor.sub,
        b.observed_person?.trim() ?? null,
        b.area?.trim()            ?? null,
        b.shift                   ?? null,
        b.observed_at,
        b.conversation_held ? 1 : 0,
        b.followup_required ? 1 : 0,
        b.followup_notes?.trim()  ?? null,
      ).run();

      const obsId = obsResult.meta.last_row_id as number;

      // Insert all step ratings in one batch
      const ratingStmts = b.ratings.map(r =>
        db.prepare(`
          INSERT INTO bbs_step_ratings (observation_id, swp_step_id, rating, comment)
          VALUES (?, ?, ?, ?)
        `).bind(obsId, r.swp_step_id, r.rating, r.comment?.trim() ?? null)
      );
      await db.batch(ratingStmts);

      await log(db, actor.sub, 'create', `bbs:${obsId}`, { asset_id: b.asset_id, swp_id: b.swp_id }, ip);
      return json({ id: obsId }, 201, origin);
    }

    // ── GET /api/bbs/:id ──────────────────────────────────────────────────────
    // Single observation with SWP step details and ratings side-by-side.
    const bbsDetailMatch = path.match(/^\/api\/bbs\/(\d+)$/);
    if (bbsDetailMatch && method === 'GET') {
      if (!can(actor.role, READ_ROLES)) return err('Forbidden', 403, origin);
      const obsId = Number(bbsDetailMatch[1]);

      const obs = await db.prepare(`
        SELECT o.*,
               a.label AS asset_label,
               s.title AS swp_title,
               e.name  AS observed_by_name
        FROM bbs_observations o
        LEFT JOIN assets     a ON a.id = o.asset_id
        LEFT JOIN swps       s ON s.id = o.swp_id
        LEFT JOIN employees  e ON e.id = o.observed_by
        WHERE o.id = ?
      `).bind(obsId).first();
      if (!obs) return err('Observation not found', 404, origin);

      // Steps with their rating for this observation joined in one query
      const { results: stepRatings } = await db.prepare(`
        SELECT
          st.id AS step_id, st.step_order, st.description, st.hazards, st.ppe_required, st.precautions,
          r.id  AS rating_id, r.rating, r.comment
        FROM swp_steps st
        LEFT JOIN bbs_step_ratings r
          ON r.swp_step_id = st.id AND r.observation_id = ?
        WHERE st.swp_id = ?
        ORDER BY st.step_order ASC
      `).bind(obsId, (obs as Record<string,unknown>).swp_id).all();

      await log(db, actor.sub, 'view', `bbs:${obsId}`, null, ip);
      return json({ observation: obs, step_ratings: stepRatings }, 200, origin);
    }

    // ── PATCH /api/bbs/:id ────────────────────────────────────────────────────
    // Close an observation and/or update outcome fields.
    // Body: { status?, conversation_held?, followup_required?, followup_notes? }
    // Closing sets closed_at to now. Re-opening is not permitted.
    if (bbsDetailMatch && method === 'PATCH') {
      if (!can(actor.role, ['admin','safety_manager','supervisor','artisan'] as Role[])) return err('Forbidden', 403, origin);
      const obsId = Number(bbsDetailMatch[1]);

      const obs = await db.prepare(
        'SELECT id, observed_by, status FROM bbs_observations WHERE id = ?'
      ).bind(obsId).first<{ id: number; observed_by: string; status: string }>();
      if (!obs) return err('Observation not found', 404, origin);

      // Only the observer or a manager can close an observation
      const isOwner   = obs.observed_by === actor.sub;
      const isManager = can(actor.role, ['admin','safety_manager','supervisor'] as Role[]);
      if (!isOwner && !isManager) return err('Forbidden — only the observer or a manager can update this observation', 403, origin);
      if (obs.status === 'closed') return err('Observation is already closed', 409, origin);

      const b = await req.json().catch(() => ({})) as {
        status?: string; conversation_held?: boolean;
        followup_required?: boolean; followup_notes?: string;
      };

      const now      = new Date().toISOString();
      const closing  = b.status === 'closed';

      await db.prepare(`
        UPDATE bbs_observations SET
          status             = COALESCE(?, status),
          conversation_held  = COALESCE(?, conversation_held),
          followup_required  = COALESCE(?, followup_required),
          followup_notes     = COALESCE(?, followup_notes),
          closed_at          = CASE WHEN ? = 1 THEN ? ELSE closed_at END
        WHERE id = ?
      `).bind(
        b.status                                  ?? null,
        b.conversation_held != null ? (b.conversation_held ? 1 : 0) : null,
        b.followup_required != null ? (b.followup_required ? 1 : 0) : null,
        b.followup_notes?.trim()                  ?? null,
        closing ? 1 : 0, now,
        obsId,
      ).run();

      await log(db, actor.sub, 'update', `bbs:${obsId}`, { status: b.status }, ip);
      return json({ ok: true }, 200, origin);
    }

    // ── END BBS OBSERVATIONS ──────────────────────────────────────────────────



    // ══════════════════════════════════════════════════════════════════════════
    // CONDITION MONITORING (DiagnosticWand — add-on module)
    // ══════════════════════════════════════════════════════════════════════════

    // ── GET /api/assets/measurable/trends ─────────────────────────────────────
    // Must be matched before /api/assets/measurable (more specific path first).
    // Returns last 12 readings per measurable asset — one query for all sparklines.
    if (method === 'GET' && path === '/api/assets/measurable/trends') {
      const perAsset = Math.min(Number(url.searchParams.get('limit') ?? '12'), 50);
      const { results } = await db.prepare(`
        SELECT asset_id, timestamp, rms_accel
        FROM (
          SELECT
            dl.asset_id, dl.timestamp, dl.rms_accel,
            ROW_NUMBER() OVER (PARTITION BY dl.asset_id ORDER BY dl.timestamp DESC) AS rn
          FROM diagnostic_logs dl
          JOIN assets a ON a.id = dl.asset_id
          WHERE a.is_measurable = 1
        )
        WHERE rn <= ?
        ORDER BY asset_id, timestamp ASC
      `).bind(perAsset).all<{ asset_id: string; timestamp: string; rms_accel: number }>();

      const byAsset: Record<string, Array<{ timestamp: string; rms_accel: number }>> = {};
      for (const row of results) {
        if (!byAsset[row.asset_id]) byAsset[row.asset_id] = [];
        byAsset[row.asset_id].push({ timestamp: row.timestamp, rms_accel: row.rms_accel });
      }
      return json({ trends: byAsset }, 200, origin);
    }

    // ── GET /api/assets/measurable ────────────────────────────────────────────
    // Flat list of every measurable node with health status. Used by dashboard.html.
    if (method === 'GET' && path === '/api/assets/measurable') {
      const { results } = await db.prepare(`
        SELECT
          a.*,
          MAX(dl.timestamp)   AS last_reading_at,
          MAX(dl.rms_accel)   AS last_rms_accel,
          MAX(dl.crest_factor) AS last_crest_factor,
          MAX(dl.kurtosis)    AS last_kurtosis,
          MAX(dl.sound_db)    AS last_sound_db,
          COUNT(dl.id)        AS reading_count,
          COUNT(DISTINCT CASE WHEN dl.id IS NOT NULL THEN 1 END) AS child_count
        FROM assets a
        LEFT JOIN diagnostic_logs dl ON dl.asset_id = a.id
        WHERE a.is_measurable = 1
        GROUP BY a.id
        ORDER BY a.label
      `).all<AssetRow & {
        last_reading_at: string | null; last_rms_accel: number | null;
        last_crest_factor: number | null; last_kurtosis: number | null;
        last_sound_db: number | null; reading_count: number;
      }>();

      // Build full breadcrumb in memory — one extra query, zero per-node round-trips
      const { results: allNodes } = await db.prepare(
        'SELECT id, parent_id, label FROM assets'
      ).all<{ id: string; parent_id: string | null; label: string }>();
      const byId = new Map(allNodes.map(n => [n.id, n]));

      const withStatus = results.map(a => {
        const crumbs: string[] = [];
        let cur = a.parent_id ? byId.get(a.parent_id) : undefined;
        while (cur) { crumbs.unshift(cur.label); cur = cur.parent_id ? byId.get(cur.parent_id) : undefined; }
        const status = statusOnly(a.last_rms_accel, a.baseline_rms, a.last_crest_factor, a.last_kurtosis);
        return { ...a, breadcrumb_path: crumbs.join(' / '), status };
      });

      return json({ assets: withStatus, count: withStatus.length }, 200, origin);
    }

    // ── GET /api/assets/:id/trend ─────────────────────────────────────────────
    // Readings over time for one measurable node.
    const trendMatch = path.match(/^\/api\/assets\/([^/]+)\/trend$/);
    if (trendMatch && method === 'GET') {
      const assetId = decodeURIComponent(trendMatch[1]);
      const limit   = Math.min(Number(url.searchParams.get('limit') ?? '50'), 200);

      const asset = await db.prepare(
        'SELECT id, is_measurable, label FROM assets WHERE id = ?'
      ).bind(assetId).first<{ id: string; is_measurable: number; label: string }>();
      if (!asset)               return err('Asset not found', 404, origin);
      if (!asset.is_measurable) return err('This node is not measurable', 400, origin);

      const { results } = await db.prepare(`
        SELECT timestamp, rms_accel, peak_g, crest_factor, kurtosis, sound_db
        FROM diagnostic_logs
        WHERE asset_id = ?
        ORDER BY timestamp DESC
        LIMIT ?
      `).bind(assetId, limit).all();

      return json({ asset_id: assetId, label: asset.label, trend: results.reverse() }, 200, origin);
    }

    // ── POST /api/assets/:id/reset-baseline ───────────────────────────────────
    const resetBaselineMatch = path.match(/^\/api\/assets\/([^/]+)\/reset-baseline$/);
    if (resetBaselineMatch && method === 'POST') {
      if (!actor || !can(actor.role, MANAGE_ROLES)) return err('Forbidden', 403, origin);
      const assetId = decodeURIComponent(resetBaselineMatch[1]);

      let body: Record<string, unknown> = {};
      try { body = await req.json(); } catch { /* empty body is fine */ }
      const forceRms = body.baseline_rms != null ? Number(body.baseline_rms) : null;

      const asset = await db.prepare('SELECT id, is_measurable FROM assets WHERE id = ?')
        .bind(assetId).first<{ id: string; is_measurable: number }>();
      if (!asset)               return err('Asset not found', 404, origin);
      if (!asset.is_measurable) return err('Asset is not measurable', 400, origin);

      if (forceRms != null && forceRms > 0) {
        await db.prepare('UPDATE assets SET baseline_rms = ?, baseline_set_at = ? WHERE id = ?')
          .bind(forceRms, new Date().toISOString(), assetId).run();
        await log(db, actor.sub, 'update', `asset:${assetId}/baseline`, { baseline_rms: forceRms }, ip);
        return json({ ok: true, baseline_rms: forceRms, mode: 'forced' }, 200, origin);
      } else {
        await db.prepare('UPDATE assets SET baseline_rms = 0, baseline_set_at = NULL WHERE id = ?')
          .bind(assetId).run();
        await log(db, actor.sub, 'update', `asset:${assetId}/baseline`, { baseline_rms: 0 }, ip);
        return json({ ok: true, baseline_rms: 0, mode: 'reset' }, 200, origin);
      }
    }

    // ── POST /api/diagnostics ─────────────────────────────────────────────────
    // Submit a sensor reading from DiagnosticWand. Auth required.
    if (method === 'POST' && path === '/api/diagnostics') {
      // DiagnosticWand may call this without an Operum role JWT — allow artisan-level
      // access via the OPERUM_JWT_SECRET which both apps share.
      let body: Record<string, unknown>;
      try { body = await req.json(); } catch { return err('Invalid JSON', 400, origin); }

      const metrics      = (body.metrics && typeof body.metrics === 'object')
        ? body.metrics as Record<string, unknown> : body;
      const asset_id     = body.asset_id ?? body.point_id;
      const device_id    = body.device_id;
      const timestamp    = body.timestamp;
      const rms_accel    = metrics.rms_accel;
      const peak_g       = metrics.peak_g;
      const crest_factor = metrics.crest_factor;
      const kurtosis     = metrics.kurtosis;
      const sound_db     = metrics.sound_db;
      const snapshot_url = body.snapshot_url;

      if (!asset_id     || typeof asset_id !== 'string')                        return err('asset_id is required', 400, origin);
      if (!device_id    || typeof device_id !== 'string')                       return err('device_id is required', 400, origin);
      if (!timestamp    || isNaN(Date.parse(String(timestamp))))                return err('timestamp must be valid ISO 8601', 400, origin);
      if (rms_accel    == null || isNaN(Number(rms_accel))    || Number(rms_accel)    < 0) return err('rms_accel must be >= 0', 400, origin);
      if (peak_g       == null || isNaN(Number(peak_g))       || Number(peak_g)       < 0) return err('peak_g must be >= 0', 400, origin);
      if (crest_factor == null || isNaN(Number(crest_factor)) || Number(crest_factor) < 0) return err('crest_factor must be >= 0', 400, origin);
      if (sound_db     == null || isNaN(Number(sound_db))     || Number(sound_db)     < 0) return err('sound_db must be >= 0', 400, origin);

      const assetIdStr = String(asset_id).trim();
      const rmsNum     = Number(rms_accel);

      const asset = await db.prepare(
        'SELECT id, is_measurable, baseline_rms FROM assets WHERE id = ?'
      ).bind(assetIdStr).first<{ id: string; is_measurable: number; baseline_rms: number }>();
      if (!asset)               return err(`asset_id "${assetIdStr}" not found`, 404, origin);
      if (!asset.is_measurable) return err(`asset "${assetIdStr}" is not measurable`, 400, origin);

      const isFirstReading = asset.baseline_rms === 0;

      const result = await db.prepare(`
        INSERT INTO diagnostic_logs
          (asset_id, device_id, recorded_by, timestamp, rms_accel, peak_g, crest_factor, kurtosis, sound_db, snapshot_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        assetIdStr,
        String(device_id).trim().slice(0, 64),
        actor?.sub ?? null,
        String(timestamp),
        rmsNum,
        Number(peak_g),
        Number(crest_factor),
        kurtosis != null ? Number(kurtosis) : null,
        Number(sound_db),
        snapshot_url != null ? String(snapshot_url) : null,
      ).run();

      const logId = result.meta.last_row_id;
      let baselineEstablished = false;
      let baselineDeferred    = false;

      if (isFirstReading) {
        if (rmsNum > NOISE_FLOOR_RMS) {
          await db.prepare('UPDATE assets SET baseline_rms = ?, baseline_set_at = ? WHERE id = ?')
            .bind(rmsNum, new Date().toISOString(), assetIdStr).run();
          baselineEstablished = true;
        } else {
          baselineDeferred = true;
        }
      }

      const baseline = baselineEstablished ? rmsNum : asset.baseline_rms;
      const kurtNum  = kurtosis != null ? Number(kurtosis) : null;
      const { status, ratio, alerts } = assessHealth(
        rmsNum, baseline, Number(crest_factor), kurtNum, Number(sound_db),
      );

      await log(db, actor?.sub ?? 'wand', 'create', `diagnostic:${assetIdStr}`, { log_id: logId }, ip);

      return json({
        ok: true, log_id: logId,
        status: baselineEstablished ? 'baseline_established'
          : baselineDeferred ? 'baseline_deferred'
          : status,
        baseline_established: baselineEstablished,
        baseline_deferred:    baselineDeferred,
        assessment: {
          rms_ratio:    parseFloat(ratio.toFixed(3)),
          baseline_rms: parseFloat(baseline.toFixed(4)),
          alerts: baselineDeferred
            ? [`Reading (${rmsNum.toFixed(4)}g) is at the sensor noise floor — confirm machine is running and take another reading.`]
            : alerts,
        },
      }, 201, origin);
    }

    // ── GET /api/diagnostics/recent ───────────────────────────────────────────
    // Last N readings across ALL measurable assets — one call for audit trail.
    if (method === 'GET' && path === '/api/diagnostics/recent') {
      const limit = Math.min(Number(url.searchParams.get('limit') ?? '30'), 100);

      const { results } = await db.prepare(`
        SELECT
          dl.id, dl.asset_id, dl.timestamp,
          dl.rms_accel, dl.peak_g, dl.crest_factor, dl.kurtosis, dl.sound_db,
          a.label AS asset_label, a.baseline_rms
        FROM diagnostic_logs dl
        JOIN assets a ON a.id = dl.asset_id
        WHERE a.is_measurable = 1
        ORDER BY dl.timestamp DESC
        LIMIT ?
      `).bind(limit).all();

      // Breadcrumbs in one memory pass — no per-row queries
      const { results: allNodes } = await db.prepare(
        'SELECT id, parent_id, label FROM assets'
      ).all<{ id: string; parent_id: string | null; label: string }>();
      const byId = new Map(allNodes.map(n => [n.id, n]));

      const rows = (results as Array<{
        id: number; asset_id: string; timestamp: string;
        rms_accel: number; peak_g: number; crest_factor: number;
        kurtosis: number | null; sound_db: number;
        asset_label: string; baseline_rms: number;
      }>).map(r => {
        const node = byId.get(r.asset_id);
        const crumbs: string[] = [];
        let cur = node?.parent_id ? byId.get(node.parent_id) : undefined;
        while (cur) { crumbs.unshift(cur.label); cur = cur.parent_id ? byId.get(cur.parent_id) : undefined; }
        return { ...r, breadcrumb_path: crumbs.join(' / ') };
      });

      return json({ readings: rows, count: rows.length }, 200, origin);
    }

    // ── GET /api/diagnostics ──────────────────────────────────────────────────
    if (method === 'GET' && path === '/api/diagnostics') {
      const assetId = url.searchParams.get('asset_id') ?? url.searchParams.get('point_id');
      const limit   = Math.min(Number(url.searchParams.get('limit')  ?? '50'), 500);
      const offset  = Math.max(Number(url.searchParams.get('offset') ?? '0'),  0);
      if (!assetId) return err('asset_id query param is required', 400, origin);
      const { results } = await db.prepare(`
        SELECT * FROM diagnostic_logs WHERE asset_id = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?
      `).bind(assetId, limit, offset).all();
      return json({ readings: results, count: results.length, limit, offset }, 200, origin);
    }

    // ── END CONDITION MONITORING ──────────────────────────────────────────────
	// ══════════════════════════════════════════════════════════════════════════
    // INCIDENT INVESTIGATION
    // OHSA Act 85 of 1993 + General Administrative Regulations
    // ══════════════════════════════════════════════════════════════════════════

    // Role constants local to this section:
    //   Raise incident:          any authenticated user (READ_ROLES covers all)
    //   Assign / update / close: admin, safety_manager, supervisor
    //   Read:                    MANAGE_ROLES

    // ── POST /api/incidents ───────────────────────────────────────────────────
    // Raise a new incident. System sets reported_at and formal_report_due_at.
    // Body: {
    //   id, incident_at, description, classification,
    //   affected_person_name, affected_person_type,
    //   location_asset_id?, location_freetext?,
    //   affected_person_id?, body_part?, injury_effect?, machinery_involved?
    // }
    if (method === 'POST' && path === '/api/incidents') {
      if (!can(actor.role, READ_ROLES)) return err('Forbidden', 403, origin);

      const b = await req.json().catch(() => ({})) as {
        id?: string;
        incident_at?: string;
        description?: string;
        classification?: string;
        affected_person_name?: string;
        affected_person_type?: string;
        location_asset_id?: string;
        location_freetext?: string;
        affected_person_id?: string;
        body_part?: string;
        injury_effect?: string;
        machinery_involved?: string;
      };

      if (!b.id?.trim())                    return err('id is required', 400, origin);
      if (!b.incident_at || isNaN(Date.parse(b.incident_at))) return err('incident_at must be a valid ISO date', 400, origin);
      if (!b.description?.trim())           return err('description is required', 400, origin);
      if (!b.affected_person_name?.trim())  return err('affected_person_name is required', 400, origin);

      const validClassifications = ['section_24_serious','section_24_other','medical_treatment','near_miss'];
      if (!b.classification || !validClassifications.includes(b.classification))
        return err('classification must be one of: ' + validClassifications.join(', '), 400, origin);

      const validPersonTypes = ['employee','contractor'];
      if (!b.affected_person_type || !validPersonTypes.includes(b.affected_person_type))
        return err('affected_person_type must be employee or contractor', 400, origin);

      const validInjuryEffects = ['death','unconscious','limb_loss','incapacity_14d','dangerous_substance','pressure_release','machinery_failure','machinery_runaway','other'];
      if (b.injury_effect && !validInjuryEffects.includes(b.injury_effect))
        return err('Invalid injury_effect value', 400, origin);

      // Duplicate check
      const existing = await db.prepare('SELECT id FROM incidents WHERE id = ?').bind(b.id.trim()).first();
      if (existing) return err(`Incident "${b.id}" already exists`, 409, origin);

      const now = new Date().toISOString();

      // formal_report_due_at is set for Section 24 incidents only — 7 days from reported_at
      const isSection24 = b.classification === 'section_24_serious' || b.classification === 'section_24_other';
      const formalReportDueAt = isSection24
        ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        : null;

      await db.prepare(`
        INSERT INTO incidents (
          id, reported_by, reported_at, incident_at,
          location_asset_id, location_freetext,
          description, classification,
          affected_person_name, affected_person_id, affected_person_type,
          body_part, injury_effect, machinery_involved,
          formal_report_due_at, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)
      `).bind(
        b.id.trim(),
        actor.sub,
        now,
        b.incident_at,
        b.location_asset_id?.trim() ?? null,
        b.location_freetext?.trim() ?? null,
        b.description.trim(),
        b.classification,
        b.affected_person_name.trim(),
        b.affected_person_id?.trim() ?? null,
        b.affected_person_type,
        b.body_part?.trim() ?? null,
        b.injury_effect ?? null,
        b.machinery_involved?.trim() ?? null,
        formalReportDueAt,
        now,
      ).run();

      await log(db, actor.sub, 'create', `incident:${b.id}`, { classification: b.classification }, ip);
      const incident = await db.prepare('SELECT * FROM incidents WHERE id = ?').bind(b.id.trim()).first();
      return json({ incident }, 201, origin);
    }

    // ── GET /api/incidents ────────────────────────────────────────────────────
    // List incidents. Filters: ?status= &classification= &overdue=1
    if (method === 'GET' && path === '/api/incidents') {
      if (!can(actor.role, MANAGE_ROLES)) return err('Forbidden', 403, origin);

      const statusF         = url.searchParams.get('status')         || null;
      const classificationF = url.searchParams.get('classification') || null;
      const overdueF        = url.searchParams.get('overdue')        === '1';
      const limit           = Math.min(Number(url.searchParams.get('limit')  ?? '50'), 200);
      const offset          = Math.max(Number(url.searchParams.get('offset') ?? '0'),  0);

      let sql = `
        SELECT
          i.*,
          e.name AS reported_by_name,
          inv.investigator_id,
          inv.investigation_due_at,
          inv.completed_at AS investigation_completed_at,
          emp_inv.name AS investigator_name
        FROM incidents i
        LEFT JOIN employees e       ON e.id = i.reported_by
        LEFT JOIN incident_investigations inv ON inv.incident_id = i.id
        LEFT JOIN employees emp_inv ON emp_inv.id = inv.investigator_id
        WHERE 1=1
      `;
      const bindings: unknown[] = [];

      if (statusF)         { sql += ` AND i.status = ?`;         bindings.push(statusF); }
      if (classificationF) { sql += ` AND i.classification = ?`; bindings.push(classificationF); }

      // overdue = investigation past due OR formal report past due
      if (overdueF) {
        sql += ` AND (
          (inv.investigation_due_at IS NOT NULL AND inv.completed_at IS NULL AND inv.investigation_due_at < datetime('now'))
          OR
          (i.formal_report_due_at IS NOT NULL AND i.formal_report_sent = 0 AND i.formal_report_due_at < datetime('now'))
        )`;
      }

      sql += ` ORDER BY i.reported_at DESC LIMIT ? OFFSET ?`;
      bindings.push(limit, offset);

      const { results } = await db.prepare(sql).bind(...bindings).all();
      return json({ incidents: results, count: results.length, limit, offset }, 200, origin);
    }

    // ── Incident detail + sub-routes ──────────────────────────────────────────
    const incidentDetailMatch = path.match(/^\/api\/incidents\/([^/]+)$/);
    const incidentSubMatch    = path.match(/^\/api\/incidents\/([^/]+)\/(.+)$/);

    // ── GET /api/incidents/:id ────────────────────────────────────────────────
    if (incidentDetailMatch && method === 'GET') {
      if (!can(actor.role, MANAGE_ROLES)) return err('Forbidden', 403, origin);
      const incidentId = decodeURIComponent(incidentDetailMatch[1]);

      const incident = await db.prepare('SELECT * FROM incidents WHERE id = ?').bind(incidentId).first();
      if (!incident) return err('Incident not found', 404, origin);

      const { results: investigations } = await db.prepare(`
        SELECT inv.*, e.name AS investigator_name
        FROM incident_investigations inv
        LEFT JOIN employees e ON e.id = inv.investigator_id
        WHERE inv.incident_id = ?
        ORDER BY inv.assigned_at ASC
      `).bind(incidentId).all();

      const { results: reviews } = await db.prepare(`
        SELECT r.*, ec.name AS chairperson_name, ee.name AS employer_name
        FROM incident_committee_reviews r
        LEFT JOIN employees ec ON ec.id = r.chairperson_id
        LEFT JOIN employees ee ON ee.id = r.employer_id
        WHERE r.incident_id = ?
        ORDER BY r.meeting_date ASC
      `).bind(incidentId).all();

      const { results: witnesses } = await db.prepare(`
        SELECT w.*, e.name AS employee_name
        FROM incident_witnesses w
        LEFT JOIN employees e ON e.id = w.witness_employee_id
        WHERE w.incident_id = ?
        ORDER BY w.id ASC
      `).bind(incidentId).all();

      await log(db, actor.sub, 'view', `incident:${incidentId}`, null, ip);
      return json({ incident, investigations, reviews, witnesses }, 200, origin);
    }

    // ── PATCH /api/incidents/:id ──────────────────────────────────────────────
    // Update mutable fields only. status and reported_at are not patchable here.
    if (incidentDetailMatch && method === 'PATCH') {
      if (!can(actor.role, ['admin','safety_manager','supervisor'] as Role[])) return err('Forbidden', 403, origin);
      const incidentId = decodeURIComponent(incidentDetailMatch[1]);

      const incident = await db.prepare('SELECT id FROM incidents WHERE id = ?').bind(incidentId).first();
      if (!incident) return err('Incident not found', 404, origin);

      const b = await req.json().catch(() => ({})) as {
        description?: string;
        location_freetext?: string;
        location_asset_id?: string;
        body_part?: string;
        injury_effect?: string;
        machinery_involved?: string;
      };

      const fields: string[] = [];
      const vals: unknown[]  = [];

      if (b.description       !== undefined) { fields.push('description = ?');       vals.push(b.description.trim()); }
      if (b.location_freetext !== undefined) { fields.push('location_freetext = ?'); vals.push(b.location_freetext?.trim() ?? null); }
      if (b.location_asset_id !== undefined) { fields.push('location_asset_id = ?'); vals.push(b.location_asset_id?.trim() ?? null); }
      if (b.body_part         !== undefined) { fields.push('body_part = ?');         vals.push(b.body_part?.trim() ?? null); }
      if (b.injury_effect     !== undefined) { fields.push('injury_effect = ?');     vals.push(b.injury_effect ?? null); }
      if (b.machinery_involved !== undefined) { fields.push('machinery_involved = ?'); vals.push(b.machinery_involved?.trim() ?? null); }

      if (!fields.length) return err('No patchable fields provided', 400, origin);
      vals.push(incidentId);

      await db.prepare(`UPDATE incidents SET ${fields.join(', ')} WHERE id = ?`).bind(...vals).run();
      await log(db, actor.sub, 'update', `incident:${incidentId}`, b, ip);
      const updated = await db.prepare('SELECT * FROM incidents WHERE id = ?').bind(incidentId).first();
      return json({ incident: updated }, 200, origin);
    }

    // ── POST /api/incidents/:id/notify ────────────────────────────────────────
    // Record that the immediate telephone/fax notification was made to the
    // Provincial Director. Section 24 serious incidents only.
    if (incidentSubMatch && incidentSubMatch[2] === 'notify' && method === 'POST') {
      if (!can(actor.role, ['admin','safety_manager'] as Role[])) return err('Forbidden', 403, origin);
      const incidentId = decodeURIComponent(incidentSubMatch[1]);

      const incident = await db.prepare(
        'SELECT id, classification, immediate_notification_sent FROM incidents WHERE id = ?'
      ).bind(incidentId).first<{ id: string; classification: string; immediate_notification_sent: number }>();
      if (!incident) return err('Incident not found', 404, origin);
      if (incident.classification !== 'section_24_serious')
        return err('Immediate notification only applies to section_24_serious incidents', 409, origin);
      if (incident.immediate_notification_sent)
        return err('Immediate notification already recorded', 409, origin);

      const now = new Date().toISOString();
      await db.prepare(`
        UPDATE incidents SET
          immediate_notification_sent = 1,
          immediate_notification_at   = ?,
          immediate_notification_by   = ?
        WHERE id = ?
      `).bind(now, actor.sub, incidentId).run();

      await log(db, actor.sub, 'update', `incident:${incidentId}/notify`, null, ip);
      return json({ ok: true, immediate_notification_at: now }, 200, origin);
    }

    // ── POST /api/incidents/:id/formal-report ─────────────────────────────────
    // Record that the formal written report was submitted to the Provincial
    // Director within 7 days. Section 24 incidents only.
    if (incidentSubMatch && incidentSubMatch[2] === 'formal-report' && method === 'POST') {
      if (!can(actor.role, ['admin','safety_manager'] as Role[])) return err('Forbidden', 403, origin);
      const incidentId = decodeURIComponent(incidentSubMatch[1]);

      const incident = await db.prepare(
        'SELECT id, classification, formal_report_sent FROM incidents WHERE id = ?'
      ).bind(incidentId).first<{ id: string; classification: string; formal_report_sent: number }>();
      if (!incident) return err('Incident not found', 404, origin);
      if (!['section_24_serious','section_24_other'].includes(incident.classification))
        return err('Formal report only applies to Section 24 incidents', 409, origin);
      if (incident.formal_report_sent)
        return err('Formal report already recorded', 409, origin);

      const now = new Date().toISOString();
      await db.prepare(`
        UPDATE incidents SET formal_report_sent = 1, formal_report_sent_at = ? WHERE id = ?
      `).bind(now, incidentId).run();

      await log(db, actor.sub, 'update', `incident:${incidentId}/formal-report`, null, ip);
      return json({ ok: true, formal_report_sent_at: now }, 200, origin);
    }

    // ── POST /api/incidents/:id/investigate ───────────────────────────────────
    // Assign an investigator. Sets investigation_due_at = incident_at + 3 days.
    // Status → under_investigation.
    // Body: { investigator_id }
    if (incidentSubMatch && incidentSubMatch[2] === 'investigate' && method === 'POST') {
      if (!can(actor.role, ['admin','safety_manager','supervisor'] as Role[])) return err('Forbidden', 403, origin);
      const incidentId = decodeURIComponent(incidentSubMatch[1]);

      const b = await req.json().catch(() => ({})) as { investigator_id?: string };
      if (!b.investigator_id?.trim()) return err('investigator_id is required', 400, origin);

      const incident = await db.prepare(
        'SELECT id, incident_at, status FROM incidents WHERE id = ?'
      ).bind(incidentId).first<{ id: string; incident_at: string; status: string }>();
      if (!incident) return err('Incident not found', 404, origin);
      if (incident.status === 'closed') return err('Cannot assign investigator to a closed incident', 409, origin);

      const investigator = await db.prepare('SELECT id FROM employees WHERE id = ? AND active = 1')
        .bind(b.investigator_id.trim()).first();
      if (!investigator) return err('Investigator not found or inactive', 404, origin);

      // investigation_due_at = incident_at + 3 calendar days
      const dueDt = new Date(incident.incident_at);
      dueDt.setDate(dueDt.getDate() + 3);
      const investigationDueAt = dueDt.toISOString();
      const now = new Date().toISOString();

      const result = await db.prepare(`
        INSERT INTO incident_investigations
          (incident_id, investigator_id, assigned_at, assigned_by, investigation_due_at)
        VALUES (?, ?, ?, ?, ?)
      `).bind(incidentId, b.investigator_id.trim(), now, actor.sub, investigationDueAt).run();

      await db.prepare(`UPDATE incidents SET status = 'under_investigation' WHERE id = ?`)
        .bind(incidentId).run();

      await log(db, actor.sub, 'create', `incident:${incidentId}/investigation`, { investigator_id: b.investigator_id }, ip);
      return json({ id: result.meta.last_row_id, investigation_due_at: investigationDueAt }, 201, origin);
    }

    // ── PATCH /api/incidents/:id/investigate ──────────────────────────────────
    // Submit investigation findings. Once completed_at is set, status →
    // pending_committee. All finding fields are optional on each PATCH to allow
    // progressive saving — completed_at must be explicitly supplied to finalise.
    // Body: { findings?, root_cause?, corrective_actions?, completed_at? }
    if (incidentSubMatch && incidentSubMatch[2] === 'investigate' && method === 'PATCH') {
      if (!can(actor.role, ['admin','safety_manager','supervisor'] as Role[])) return err('Forbidden', 403, origin);
      const incidentId = decodeURIComponent(incidentSubMatch[1]);

      const b = await req.json().catch(() => ({})) as {
        findings?: string;
        root_cause?: string;
        corrective_actions?: string;
        completed_at?: string;
      };

      // Find the latest investigation record for this incident
      const inv = await db.prepare(`
        SELECT id, completed_at FROM incident_investigations
        WHERE incident_id = ? ORDER BY assigned_at DESC LIMIT 1
      `).bind(incidentId).first<{ id: number; completed_at: string | null }>();
      if (!inv) return err('No investigation assigned to this incident', 404, origin);
      if (inv.completed_at) return err('Investigation is already finalised', 409, origin);

      const fields: string[] = [];
      const vals: unknown[]  = [];

      if (b.findings          !== undefined) { fields.push('findings = ?');           vals.push(b.findings?.trim() ?? null); }
      if (b.root_cause        !== undefined) { fields.push('root_cause = ?');         vals.push(b.root_cause?.trim() ?? null); }
      if (b.corrective_actions !== undefined) { fields.push('corrective_actions = ?'); vals.push(b.corrective_actions?.trim() ?? null); }
      if (b.completed_at      !== undefined) { fields.push('completed_at = ?');       vals.push(new Date().toISOString()); }

      if (!fields.length) return err('No fields to update', 400, origin);
      vals.push(inv.id);

      await db.prepare(`UPDATE incident_investigations SET ${fields.join(', ')} WHERE id = ?`).bind(...vals).run();

      // If investigation is being finalised, advance incident status
      if (b.completed_at !== undefined) {
        await db.prepare(`UPDATE incidents SET status = 'pending_committee' WHERE id = ?`)
          .bind(incidentId).run();
      }

      await log(db, actor.sub, 'update', `incident:${incidentId}/investigation`, { completed: b.completed_at !== undefined }, ip);
      return json({ ok: true }, 200, origin);
    }

    // ── POST /api/incidents/:id/committee-review ──────────────────────────────
    // Create a committee review record. One per meeting — a second meeting
    // creates a second record, preserving full audit trail.
    // Body: { meeting_date, chairperson_id, employer_id, committee_remarks? }
    if (incidentSubMatch && incidentSubMatch[2] === 'committee-review' && method === 'POST') {
      if (!can(actor.role, ['admin','safety_manager'] as Role[])) return err('Forbidden', 403, origin);
      const incidentId = decodeURIComponent(incidentSubMatch[1]);

      const b = await req.json().catch(() => ({})) as {
        meeting_date?: string;
        chairperson_id?: string;
        employer_id?: string;
        committee_remarks?: string;
      };

      if (!b.meeting_date?.trim())    return err('meeting_date is required', 400, origin);
      if (!b.chairperson_id?.trim())  return err('chairperson_id is required', 400, origin);
      if (!b.employer_id?.trim())     return err('employer_id is required', 400, origin);

      const incident = await db.prepare('SELECT id FROM incidents WHERE id = ?').bind(incidentId).first();
      if (!incident) return err('Incident not found', 404, origin);

      const chairperson = await db.prepare('SELECT id FROM employees WHERE id = ? AND active = 1')
        .bind(b.chairperson_id.trim()).first();
      if (!chairperson) return err('Chairperson not found or inactive', 404, origin);

      const employer = await db.prepare('SELECT id FROM employees WHERE id = ? AND active = 1')
        .bind(b.employer_id.trim()).first();
      if (!employer) return err('Employer representative not found or inactive', 404, origin);

      const result = await db.prepare(`
        INSERT INTO incident_committee_reviews
          (incident_id, meeting_date, chairperson_id, employer_id, committee_remarks)
        VALUES (?, ?, ?, ?, ?)
      `).bind(
        incidentId,
        b.meeting_date.trim(),
        b.chairperson_id.trim(),
        b.employer_id.trim(),
        b.committee_remarks?.trim() ?? null,
      ).run();

      await log(db, actor.sub, 'create', `incident:${incidentId}/committee-review`, { meeting_date: b.meeting_date }, ip);
      return json({ id: result.meta.last_row_id }, 201, origin);
    }

    // ── POST /api/incidents/:id/endorse/chairperson ───────────────────────────
    // Chairperson endorses the most recent committee review.
    // Immutable — 409 if already endorsed.
    const endorseMatch = path.match(/^\/api\/incidents\/([^/]+)\/endorse\/(chairperson|employer)$/);
    if (endorseMatch && method === 'POST') {
      if (!can(actor.role, ['admin','safety_manager'] as Role[])) return err('Forbidden', 403, origin);
      const incidentId  = decodeURIComponent(endorseMatch[1]);
      const endorseRole = endorseMatch[2] as 'chairperson' | 'employer';

      const incident = await db.prepare('SELECT id, status FROM incidents WHERE id = ?')
        .bind(incidentId).first<{ id: string; status: string }>();
      if (!incident) return err('Incident not found', 404, origin);
      if (incident.status === 'closed') return err('Incident is already closed', 409, origin);

      // Find the latest review for this incident
      const review = await db.prepare(`
        SELECT id, chairperson_endorsed_at, employer_endorsed_at
        FROM incident_committee_reviews
        WHERE incident_id = ?
        ORDER BY id DESC LIMIT 1
      `).bind(incidentId).first<{
        id: number;
        chairperson_endorsed_at: string | null;
        employer_endorsed_at: string | null;
      }>();
      if (!review) return err('No committee review exists for this incident', 404, origin);

      const column = endorseRole === 'chairperson'
        ? 'chairperson_endorsed_at'
        : 'employer_endorsed_at';

      // Immutability guard
      if (review[column] !== null)
        return err(`${endorseRole} endorsement already recorded — create a new committee review to supersede`, 409, origin);

      const now = new Date().toISOString();
      await db.prepare(`UPDATE incident_committee_reviews SET ${column} = ? WHERE id = ?`)
        .bind(now, review.id).run();

      // Check whether both endorsements are now set — auto-close if so
      const updated = await db.prepare(`
        SELECT chairperson_endorsed_at, employer_endorsed_at
        FROM incident_committee_reviews WHERE id = ?
      `).bind(review.id).first<{ chairperson_endorsed_at: string | null; employer_endorsed_at: string | null }>();

      let closed = false;
      if (updated?.chairperson_endorsed_at && updated?.employer_endorsed_at) {
        await db.prepare(`UPDATE incidents SET status = 'closed' WHERE id = ?`).bind(incidentId).run();
        closed = true;
      }

      await log(db, actor.sub, 'update', `incident:${incidentId}/endorse/${endorseRole}`, { closed }, ip);
      return json({ ok: true, endorsed_at: now, incident_closed: closed }, 200, origin);
    }

    // ── POST /api/incidents/:id/witnesses ─────────────────────────────────────
    // Add a witness record to an incident.
    // Body: { witness_name, contact_details, witness_employee_id?, statement? }
    if (incidentSubMatch && incidentSubMatch[2] === 'witnesses' && method === 'POST') {
      if (!can(actor.role, ['admin','safety_manager','supervisor'] as Role[])) return err('Forbidden', 403, origin);
      const incidentId = decodeURIComponent(incidentSubMatch[1]);

      const b = await req.json().catch(() => ({})) as {
        witness_name?: string;
        contact_details?: string;
        witness_employee_id?: string;
        statement?: string;
      };

      if (!b.witness_name?.trim())    return err('witness_name is required', 400, origin);
      if (!b.contact_details?.trim()) return err('contact_details is required', 400, origin);

      const incident = await db.prepare('SELECT id FROM incidents WHERE id = ?').bind(incidentId).first();
      if (!incident) return err('Incident not found', 404, origin);

      const result = await db.prepare(`
        INSERT INTO incident_witnesses
          (incident_id, witness_name, witness_employee_id, contact_details, statement)
        VALUES (?, ?, ?, ?, ?)
      `).bind(
        incidentId,
        b.witness_name.trim(),
        b.witness_employee_id?.trim() ?? null,
        b.contact_details.trim(),
        b.statement?.trim() ?? null,
      ).run();

      await log(db, actor.sub, 'create', `incident:${incidentId}/witness`, { witness_name: b.witness_name }, ip);
      return json({ id: result.meta.last_row_id }, 201, origin);
    }

    // ── END INCIDENT INVESTIGATION ────────────────────────────────────────────
    return err('Not found', 404, origin);
  },
};
