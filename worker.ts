/**
 * Operum — Cloudflare Worker (worker.ts)
 * v1.0 — Register module: employees + asset tree + documents
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
 *
 * GET  /api/assets/:id/documents           list documents for a node
 * POST /api/assets/:id/documents           attach document to node
 * DELETE /api/documents/:id               remove document
 *
 * GET  /api/log                            access log (admin only, ?limit=&offset=)
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface Env {
  DB: D1Database;
  OPERUM_JWT_SECRET: string;
  CORS_ORIGIN: string;
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

// ─── Main handler ────────────────────────────────────────────────────────────

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = env.CORS_ORIGIN || '*';
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
      let libRows: { prefix: string; description: string; use_count: number }[] = [];
      if (nodeType) {
        const all = await db.prepare(
          `SELECT prefix, description, use_count FROM suffix_library ORDER BY use_count DESC, prefix ASC`
        ).all<{ prefix: string; description: string; use_count: number }>();
        // Filter in JS — SQLite JSON functions are limited in D1
        libRows = all.results.filter(r => {
          try {
            const types: string[] = JSON.parse(r.node_types || '[]') as string[];
            return types.includes(nodeType);
          } catch { return true; }
        });
      } else {
        const all = await db.prepare(
          `SELECT prefix, description, use_count FROM suffix_library ORDER BY use_count DESC, prefix ASC`
        ).all<{ prefix: string; description: string; use_count: number }>();
        libRows = all.results;
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
    if (method === 'GET' && path === '/api/assets') {
      const parentId = url.searchParams.get('parent_id') || null;
      const rows = await db.prepare(
        `SELECT * FROM assets WHERE parent_id ${parentId ? '= ?' : 'IS NULL'} ORDER BY id`
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

    return err('Not found', 404, origin);
  },
};
