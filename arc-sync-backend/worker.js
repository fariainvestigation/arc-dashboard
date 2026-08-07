/**
 * ARC Shared Case Sync - Cloudflare Worker
 *
 * A minimal, strongly-consistent backend so investigators on separate laptops
 * see and edit the same cases. Runs behind Cloudflare Zero Trust Access and
 * verifies the Access JWT on every request.
 *
 * Storage: D1 (SQLite). One row per case. Strong consistency and real
 * transactions, so a save from one laptop is immediately visible to the other
 * and concurrent saves cannot silently clobber each other.
 *
 * Routes (served under BOTH the /api and /sync prefixes so the app converges
 * on one Worker; legacy pages still call /sync/cases* and /sync/case/:id):
 *   GET    /api/cases  | /sync/cases        -> { cases: [...], serverTime }
 *   POST   /api/cases  | /sync/cases        -> create case (id in body)
 *   GET    /api/cases/:id | /sync/cases/:id -> { case }
 *   PUT    /api/cases/:id | /sync/cases/:id -> update (requires expectedRev)
 *   DELETE /api/cases/:id | /sync/cases/:id -> soft delete (requires expectedRev)
 *   GET    /api/whoami | /sync/whoami       -> { email, sub }
 * (/sync/case/:id, singular, is accepted as a legacy alias for /sync/cases/:id)
 *
 * Security properties enforced here:
 *   - CORS: Access-Control-Allow-Origin is returned ONLY for origins listed in
 *     the ARC_ALLOWED_ORIGINS env var (comma-separated, exact match). Never a
 *     wildcard together with credentials. "Vary: Origin" is always sent with
 *     CORS headers. Requests with no Origin header (same-origin) get no CORS
 *     headers at all. Non-allowlisted preflights are rejected with 403.
 *   - Optimistic locking: every UPDATE/DELETE of an existing case requires an
 *     explicit integer expectedRev (If-Match header, or expectedRev / legacy
 *     __rev in the body). Missing/zero/non-integer -> 428, mismatch -> 409
 *     with a { conflict: { currentRev, current } } payload. The rev comparison
 *     and mutation happen atomically in one D1 statement (compare-and-swap).
 *   - Case ids must match /^[A-Za-z0-9_-]{4,64}$/. Invalid ids -> 400. Ids are
 *     NEVER normalized or stripped (stripping characters, e.g. colons, broke
 *     audit/approval lookups in the old Vercel handler - do not replicate).
 *   - Case-level authorization: cases have an owner (owner_user_id) and a
 *     case_members table. Listing returns only cases the caller owns or is a
 *     member of; single-case routes return 404 for non-members (no existence
 *     leak); writes additionally require role owner or editor.
 *
 * Provider calls are intentionally NOT handled by this Worker. Gemini/Claude,
 * CourtListener, and Firecrawl have dedicated authenticated Workers. Keeping
 * case storage separate from provider routing prevents legacy provider paths
 * from silently reappearing under the broad /api/* compatibility route.
 */

const JSON_HEADERS = { "Content-Type": "application/json" };

// Canonical case id format. Validate only - never rewrite or strip characters.
const ID_PATTERN = /^[A-Za-z0-9_-]{4,64}$/;

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...extra }
  });
}

/* ------------------------------------------------------------------ CORS -- */

// ARC_ALLOWED_ORIGINS is a comma-separated list of exact origins, e.g.
// "https://arcdefensereport.com,https://staging.arcdefensereport.com".
function allowedOrigins(env) {
  return String(env.ARC_ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Returns:
//   {}      -> no Origin header (same-origin request): omit CORS headers.
//   null    -> Origin present but NOT allowlisted.
//   headers -> Origin allowlisted: echo exactly that origin + Vary: Origin.
// Never returns a wildcard origin (we use credentials).
function corsFor(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin) return {};
  if (!allowedOrigins(env).includes(origin)) return null;
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin"
  };
}

/* -------------------------------------------------------------- Identity -- */

function decodeJwtPayload(token) {
  try {
    const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch (_) {
    return null;
  }
}

const enc = new TextEncoder();
const dec = new TextDecoder();
const jwksCache = { keys: null, fetched: 0 };

function b64uToBytes(value) {
  const b64 = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

async function verifyAccessJwt(token, env) {
  if (!token) throw new Error("Missing Cloudflare Access token");
  if (env.__verifyJwt) return env.__verifyJwt(token);
  const [h, p, sig] = String(token).split(".");
  if (!h || !p || !sig) throw new Error("Malformed Access token");
  const header = JSON.parse(dec.decode(b64uToBytes(h)));
  const payload = JSON.parse(dec.decode(b64uToBytes(p)));
  const nowS = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < nowS) throw new Error("Access token expired");
  const audOk = [].concat(payload.aud || []).includes(env.ACCESS_AUD);
  if (!audOk) throw new Error("Access token audience mismatch");
  if (payload.iss !== `https://${env.ACCESS_TEAM_DOMAIN}`) throw new Error("Access token issuer mismatch");
  if (!jwksCache.keys || Date.now() - jwksCache.fetched > 3600e3) {
    const response = await fetch(`https://${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`);
    if (!response.ok) throw new Error("Unable to fetch Access certs");
    jwksCache.keys = (await response.json()).keys;
    jwksCache.fetched = Date.now();
  }
  const jwk = jwksCache.keys.find((key) => key.kid === header.kid);
  if (!jwk) throw new Error("Unknown Access signing key");
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64uToBytes(sig), enc.encode(`${h}.${p}`));
  if (!ok) throw new Error("Access token signature invalid");
  if (!payload.email) throw new Error("Access token has no email identity");
  return { email: String(payload.email).trim().toLowerCase(), sub: String(payload.sub || "").trim() };
}

async function identity(request, env) {
  const verified = await verifyAccessJwt(request.headers.get("Cf-Access-Jwt-Assertion") || "", env);
  const email = String(verified.email || "").trim().toLowerCase();
  const sub = String(verified.sub || "").trim();
  // ARC production uses the verified Access email as the canonical case-membership key.
  // This keeps Case Dashboard, Legal, Research, and AI authorization on one identity namespace.
  const key = email;
  if (!email || !key) throw new Error("Access token has no usable identity");
  return { email, sub, key };
}

/* ---------------------------------------------------------------- Schema -- */

// Schema bootstrap / migration block. Runs once per isolate on first request.
//
// Migration notes:
//   - owner_user_id was added after initial deploys. D1/SQLite has no
//     "ADD COLUMN IF NOT EXISTS", so the ALTER TABLE is guarded by try/catch.
//   - Rows created before the ownership migration have owner_user_id NULL and
//     are invisible to everyone until backfilled; see DEPLOY.md for the
//     one-line backfill command.
let schemaReady = false;

async function ensureSchema(db) {
  if (schemaReady) return;

  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS cases (
         id TEXT PRIMARY KEY,
         data TEXT NOT NULL,
         rev INTEGER NOT NULL DEFAULT 1,
         deleted INTEGER NOT NULL DEFAULT 0,
         updated_at TEXT NOT NULL,
         updated_by TEXT NOT NULL
       )`
    )
    .run();

  try {
    await db.prepare("ALTER TABLE cases ADD COLUMN owner_user_id TEXT").run();
  } catch (_) {
    // Column already exists - expected on every run after the first.
  }

  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS case_members (
         case_id TEXT NOT NULL,
         user_id TEXT NOT NULL,
         role TEXT NOT NULL CHECK(role IN ('owner','editor','reviewer','reader')),
         granted_by TEXT,
         granted_at TEXT,
         PRIMARY KEY (case_id, user_id)
       )`
    )
    .run();

  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS final_reports (
         id TEXT PRIMARY KEY,
         case_id TEXT NOT NULL,
         revision INTEGER NOT NULL DEFAULT 1,
         payload TEXT NOT NULL,
         payload_hash TEXT NOT NULL DEFAULT '',
         approved INTEGER NOT NULL DEFAULT 0,
         approved_by TEXT NOT NULL DEFAULT '',
         approved_at TEXT NOT NULL DEFAULT '',
         approved_revision INTEGER NOT NULL DEFAULT 0,
         invalidated_at TEXT NOT NULL DEFAULT '',
         updated_at TEXT NOT NULL,
         updated_by TEXT NOT NULL
       )`
    )
    .run();

  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS final_report_versions (
         id TEXT PRIMARY KEY,
         report_id TEXT NOT NULL,
         case_id TEXT NOT NULL,
         revision INTEGER NOT NULL,
         snapshot TEXT NOT NULL,
         saved_by TEXT NOT NULL,
         created_at TEXT NOT NULL
       )`
    )
    .run();

  await db.prepare(`CREATE TABLE IF NOT EXISTS arc_audit (
    id TEXT PRIMARY KEY, case_id TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL,
    report_id TEXT DEFAULT '', details TEXT DEFAULT '{}', created_at TEXT NOT NULL
  )`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_arc_audit_case ON arc_audit(case_id, created_at)`).run();

  await db.prepare(`CREATE TABLE IF NOT EXISTS report_reviews (
    report_id TEXT PRIMARY KEY, case_id TEXT NOT NULL, status TEXT NOT NULL, reviewer TEXT NOT NULL,
    notes TEXT DEFAULT '', updated_at TEXT NOT NULL
  )`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_report_reviews_case ON report_reviews(case_id, updated_at)`).run();

  await db.prepare(`CREATE TABLE IF NOT EXISTS report_assets (
    case_id TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL DEFAULT '{}',
    file_key TEXT DEFAULT '', file_name TEXT DEFAULT '', file_type TEXT DEFAULT '',
    file_size INTEGER NOT NULL DEFAULT 0, sha256 TEXT DEFAULT '',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, modified_by TEXT NOT NULL,
    PRIMARY KEY(case_id, id)
  )`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_report_assets_case ON report_assets(case_id, updated_at)`).run();

  await db.prepare(`CREATE TABLE IF NOT EXISTS investigation_workspaces (
    case_id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL
  )`).run();

  await db.prepare(`CREATE TABLE IF NOT EXISTS case_module_state (
    case_id TEXT NOT NULL, module_id TEXT NOT NULL, payload TEXT NOT NULL, rev INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL, updated_by TEXT NOT NULL, PRIMARY KEY(case_id, module_id)
  )`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_case_module_state_case ON case_module_state(case_id, updated_at)`).run();

  schemaReady = true;
}

/* ---------------------------------------------------------- Access rules -- */

// Loads a case row together with the caller's membership role in one query.
async function loadCaseAccess(db, id, userKey) {
  const row = await db
    .prepare(
      `SELECT c.id, c.data, c.rev, c.deleted, c.updated_at, c.updated_by,
              c.owner_user_id, m.role AS member_role
         FROM cases c
         LEFT JOIN case_members m ON m.case_id = c.id AND m.user_id = ?
        WHERE c.id = ?`
    )
    .bind(userKey, id)
    .first();
  if (!row) return { exists: false };
  const isOwner = row.owner_user_id === userKey || row.member_role === "owner";
  const isMember = isOwner || Boolean(row.member_role);
  const canWrite = isOwner || row.member_role === "editor";
  const canReview = canWrite || row.member_role === "reviewer";
  return { exists: true, row, isMember, canWrite, canReview };
}

/* --------------------------------------------------- Revision extraction -- */

// Every update/delete of an existing case must carry the revision the client
// believes is current. Accepted, in order of precedence:
//   1. If-Match: 7        (also tolerates a quoted ETag form: If-Match: "7")
//   2. body.expectedRev
//   3. body.__rev         (legacy field the older sync pages send)
// Missing, zero, negative, or non-integer values are all rejected (428).
function readExpectedRev(request, body) {
  let raw;
  const ifMatch = request.headers.get("If-Match");
  if (ifMatch !== null && ifMatch.trim() !== "") {
    raw = ifMatch.trim().replace(/^"(.*)"$/, "$1");
  } else if (body && body.expectedRev !== undefined && body.expectedRev !== null) {
    raw = body.expectedRev;
  } else if (body && body.__rev !== undefined && body.__rev !== null) {
    raw = body.__rev;
  } else {
    return { ok: false };
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return { ok: false };
  return { ok: true, rev: n };
}

function revisionRequired(cors) {
  return json(
    {
      error: "revision_required",
      message:
        "Updates and deletes require the current case revision (If-Match header or expectedRev in the body)."
    },
    428,
    cors
  );
}

// 409 conflict payload. Includes limited metadata only - never the full case
// body of someone else's newer edit - plus serverRev for older callers.
function conflict(row, cors) {
  return json(
    {
      error: "conflict",
      message:
        "This case was changed on another device. Reload to get the latest version before saving.",
      serverRev: row.rev,
      conflict: {
        currentRev: row.rev,
        current: {
          id: row.id,
          rev: row.rev,
          updatedAt: row.updated_at,
          updatedBy: row.updated_by
        }
      }
    },
    409,
    cors
  );
}

// Strip server-managed fields before persisting the client-provided body.
function cleanCaseBody(body) {
  const clean = { ...body };
  delete clean.__rev;
  delete clean.__updatedAt;
  delete clean.__updatedBy;
  delete clean.expectedRev;
  return clean;
}

function uuid() {
  return crypto.randomUUID();
}

async function sha256Text(value) {
  const bytes = enc.encode(String(value || ""));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeAssetToken(value, fallback = "record") {
  const out = String(value == null ? "" : value).trim().replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 180);
  return out || fallback;
}

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

async function requireCaseRead(db, caseId, user, cors) {
  if (!ID_PATTERN.test(caseId)) return { response: json({ error: "Invalid case id" }, 400, cors) };
  const access = await loadCaseAccess(db, caseId, user.key);
  if (!access.exists || !access.isMember || access.row.deleted) return { response: json({ error: "Case not found" }, 404, cors) };
  return { access };
}

async function requireCaseReview(db, caseId, user, cors) {
  const checked = await requireCaseRead(db, caseId, user, cors);
  if (checked.response) return checked;
  if (!checked.access.canReview) return { response: json({ error: "Forbidden: requires owner, editor, or reviewer role" }, 403, cors) };
  return checked;
}

function byteRangeHeader(value, size) {
  const m = String(value || "").match(/^bytes=(\d*)-(\d*)$/);
  if (!m) return null;
  let start = m[1] === "" ? null : Number(m[1]);
  let end = m[2] === "" ? null : Number(m[2]);
  if (start === null && end === null) return null;
  if (start === null) {
    const suffix = end;
    if (!Number.isInteger(suffix) || suffix <= 0) return { unsatisfiable: true };
    start = Math.max(0, size - suffix); end = size - 1;
  } else {
    if (!Number.isInteger(start) || start < 0) return { unsatisfiable: true };
    if (end === null) end = size - 1;
  }
  if (!Number.isInteger(end) || end < start || start >= size) return { unsatisfiable: true };
  return { start, end: Math.min(end, size - 1) };
}

async function sha256Readable(stream) {
  if (crypto.DigestStream) {
    const digest = new crypto.DigestStream("SHA-256");
    const done = stream.pipeTo(digest);
    const buffer = await digest.digest;
    await done;
    return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  const buffer = await new Response(stream).arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function requireCaseWrite(db, caseId, user, cors) {
  if (!ID_PATTERN.test(caseId)) {
    return { response: json({ error: "Invalid case id (expected 4-64 chars of A-Z a-z 0-9 _ -)" }, 400, cors) };
  }
  const access = await loadCaseAccess(db, caseId, user.key);
  if (!access.exists || !access.isMember || access.row.deleted) {
    return { response: json({ error: "Case not found" }, 404, cors) };
  }
  if (!access.canWrite) {
    return { response: json({ error: "Forbidden: requires owner or editor role" }, 403, cors) };
  }
  return { access };
}

function finalReportId(caseId) {
  return caseId + "::final-report";
}

// Creates a case plus its owner membership row atomically (D1 batch).
async function createCase(db, id, body, user, cors) {
  const now = new Date().toISOString();
  const dataText = JSON.stringify(cleanCaseBody(body));
  await db.batch([
    db
      .prepare(
        "INSERT INTO cases (id, data, rev, deleted, updated_at, updated_by, owner_user_id) VALUES (?, ?, 1, 0, ?, ?, ?)"
      )
      .bind(id, dataText, now, user.email || user.key, user.key),
    db
      .prepare(
        "INSERT INTO case_members (case_id, user_id, role, granted_by, granted_at) VALUES (?, ?, 'owner', ?, ?)"
      )
      .bind(id, user.key, user.key, now)
  ]);
  return json(
    { ok: true, id, rev: 1, updatedAt: now, updatedBy: user.email || user.key },
    200,
    cors
  );
}

/* ---------------------------------------------------------------- Worker -- */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "");

    // CORS preflight. Allowlisted origins get the usual grant; origins not on
    // the allowlist are refused outright with NO CORS headers. A preflight
    // with no Origin header is answered plainly (nothing to grant).
    if (request.method === "OPTIONS") {
      const grant = corsFor(request, env);
      if (grant === null) {
        return new Response(null, { status: 403 });
      }
      const headers = { ...grant };
      if (grant["Access-Control-Allow-Origin"]) {
        headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,DELETE,OPTIONS";
        headers["Access-Control-Allow-Headers"] = "Content-Type, If-Match, Cf-Access-Jwt-Assertion, X-ARC-Case-ID";
        headers["Access-Control-Max-Age"] = "600";
      }
      return new Response(null, { status: 204, headers });
    }

    // Match AI/Research/Legal: reject disallowed Origins before auth or work.
    // Same-origin requests (no Origin header) continue normally.
    const corsGrant = corsFor(request, env);
    if (corsGrant === null) {
      return json({ error: "Origin not allowed" }, 403);
    }
    const cors = corsGrant;

    if (!env.ARC_DB) {
      return json({ error: "D1 binding ARC_DB is not configured" }, 500, cors);
    }

    let user;
    try {
      user = await identity(request, env);
    } catch (_) {
      return json(
        {
          error:
            "No authenticated identity. This backend requires a valid Cloudflare Access token."
        },
        401,
        cors
      );
    }

    await ensureSchema(env.ARC_DB);

    // Both /api/* and /sync/* map to the same case/report compatibility handlers.
    // Provider routes are owned by their dedicated Workers and are never proxied here.
    const norm = path.replace(/^\/api(?=\/|$)/, "/sync");

    try {
      if (norm === "/sync/whoami" && request.method === "GET") {
        return json({ email: user.email, sub: user.sub || null }, 200, cors);
      }

      /* ---- Production health / compatibility routes -------------------- */
      if (norm === "/sync/health" && request.method === "GET") {
        return json({
          ok: true,
          status: "ok",
          backend: "cloudflare",
          d1: Boolean(env.ARC_DB),
          r2: Boolean(env.FILES),
          reportAssets: Boolean(env.FILES),
          accessVerified: true,
          timestamp: new Date().toISOString()
        }, env.FILES ? 200 : 503, cors);
      }

      /* ---- Shared audit log (legacy /api/audit-log compatibility) ------- */
      if ((norm === "/sync/audit-log" || norm === "/sync/audit-log/batch") && request.method === "POST") {
        const body = await request.json().catch(() => null);
        const entries = norm.endsWith("/batch") ? (body && Array.isArray(body.entries) ? body.entries.slice(0, 100) : []) : [body];
        if (!entries.length || entries.some((entry) => !entry || !ID_PATTERN.test(String(entry.caseId || "")))) {
          return json({ error: "Valid audit caseId required" }, 400, cors);
        }
        for (const entry of entries) {
          const caseId = String(entry.caseId);
          const accessCheck = await requireCaseRead(env.ARC_DB, caseId, user, cors);
          if (accessCheck.response) return accessCheck.response;
        }
        const now = new Date().toISOString();
        await env.ARC_DB.batch(entries.map((entry) => env.ARC_DB.prepare(
          `INSERT OR REPLACE INTO arc_audit (id,case_id,actor,action,report_id,details,created_at) VALUES (?,?,?,?,?,?,?)`
        ).bind(
          safeAssetToken(entry.id || uuid(), uuid()), String(entry.caseId), user.email,
          String(entry.action || "event").slice(0, 120), String(entry.reportId || "").slice(0, 180),
          JSON.stringify(entry.details || {}), now
        )));
        return json({ ok: true, count: entries.length }, 200, cors);
      }
      if (norm === "/sync/audit-log" && request.method === "GET") {
        const caseId = String(url.searchParams.get("caseId") || "");
        const accessCheck = await requireCaseRead(env.ARC_DB, caseId, user, cors);
        if (accessCheck.response) return accessCheck.response;
        const rows = await env.ARC_DB.prepare(
          "SELECT id,case_id,actor,action,report_id,details,created_at FROM arc_audit WHERE case_id=? ORDER BY created_at DESC LIMIT 1000"
        ).bind(caseId).all();
        return json({ entries: (rows.results || []).map((r) => ({ ...r, details: parseJson(r.details, {}) })) }, 200, cors);
      }

      /* ---- Report review status (legacy /api/report-approvals) ---------- */
      if (norm === "/sync/report-approvals") {
        if (request.method === "POST") {
          const body = await request.json().catch(() => null);
          const caseId = String(body && body.caseId || "");
          const reportId = safeAssetToken(body && body.reportId || "", "");
          const status = String(body && body.status || "").toLowerCase();
          if (!reportId || !["approved","rejected","pending","revised"].includes(status)) return json({ error: "Invalid report review" }, 400, cors);
          const accessCheck = await requireCaseReview(env.ARC_DB, caseId, user, cors);
          if (accessCheck.response) return accessCheck.response;
          const now = new Date().toISOString();
          await env.ARC_DB.prepare(`INSERT INTO report_reviews (report_id,case_id,status,reviewer,notes,updated_at)
            VALUES (?,?,?,?,?,?) ON CONFLICT(report_id) DO UPDATE SET case_id=excluded.case_id,status=excluded.status,reviewer=excluded.reviewer,notes=excluded.notes,updated_at=excluded.updated_at`)
            .bind(reportId, caseId, status, user.email, String(body.notes || "").slice(0,4000), now).run();
          return json({ reportId, caseId, status, reviewerEmail: user.email, timestamp: now }, 200, cors);
        }
        if (request.method === "GET") {
          const reportId = safeAssetToken(url.searchParams.get("reportId") || "", "");
          const caseId = String(url.searchParams.get("caseId") || "");
          if (reportId) {
            const row = await env.ARC_DB.prepare("SELECT * FROM report_reviews WHERE report_id=?").bind(reportId).first();
            if (!row) return json({ error: "Approval not found" }, 404, cors);
            const accessCheck = await requireCaseRead(env.ARC_DB, row.case_id, user, cors);
            if (accessCheck.response) return accessCheck.response;
            return json(row, 200, cors);
          }
          const accessCheck = await requireCaseRead(env.ARC_DB, caseId, user, cors);
          if (accessCheck.response) return accessCheck.response;
          const rows = await env.ARC_DB.prepare("SELECT * FROM report_reviews WHERE case_id=? ORDER BY updated_at DESC").bind(caseId).all();
          return json({ caseId, approvals: rows.results || [] }, 200, cors);
        }
      }

      /* ---- Investigation-development workspace ------------------------- */
      if (norm === "/sync/investigation-workspace") {
        const caseId = String(url.searchParams.get("caseId") || "");
        if (request.method === "GET") {
          const accessCheck = await requireCaseRead(env.ARC_DB, caseId, user, cors);
          if (accessCheck.response) return accessCheck.response;
          const row = await env.ARC_DB.prepare("SELECT payload FROM investigation_workspaces WHERE case_id=?").bind(caseId).first();
          if (!row) return json({ error: "Workspace not found" }, 404, cors);
          return json(parseJson(row.payload, {}), 200, cors);
        }
        if (request.method === "PUT") {
          const accessCheck = await requireCaseWrite(env.ARC_DB, caseId, user, cors);
          if (accessCheck.response) return accessCheck.response;
          const body = await request.json().catch(() => null);
          if (!body || typeof body !== "object") return json({ error: "Workspace payload required" }, 400, cors);
          body.caseId = caseId;
          body.savedAt = new Date().toISOString();
          await env.ARC_DB.prepare(`INSERT INTO investigation_workspaces(case_id,payload,updated_at,updated_by) VALUES(?,?,?,?)
            ON CONFLICT(case_id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at,updated_by=excluded.updated_by`)
            .bind(caseId, JSON.stringify(body), body.savedAt, user.email).run();
          return json(body, 200, cors);
        }
      }

      /* ---- Per-case specialty module state ------------------------------ */
      if (norm === "/sync/module-state") {
        const caseId = String(url.searchParams.get("caseId") || "");
        const moduleId = String(url.searchParams.get("module") || "").toLowerCase();
        if (!/^[a-z0-9_-]{2,80}$/.test(moduleId)) return json({ error: "Valid module id required" }, 400, cors);
        if (request.method === "GET") {
          const accessCheck = await requireCaseRead(env.ARC_DB, caseId, user, cors);
          if (accessCheck.response) return accessCheck.response;
          const row = await env.ARC_DB.prepare("SELECT payload,rev,updated_at,updated_by FROM case_module_state WHERE case_id=? AND module_id=?")
            .bind(caseId, moduleId).first();
          if (!row) return json({ caseId, moduleId, payload: null, rev: 0, updatedAt: null, updatedBy: null }, 200, cors);
          return json({ caseId, moduleId, payload: parseJson(row.payload, null), rev: Number(row.rev || 1), updatedAt: row.updated_at, updatedBy: row.updated_by }, 200, cors);
        }
        if (request.method === "PUT") {
          const accessCheck = await requireCaseWrite(env.ARC_DB, caseId, user, cors);
          if (accessCheck.response) return accessCheck.response;
          const body = await request.json().catch(() => null);
          if (!body || typeof body !== "object" || !("payload" in body)) return json({ error: "Module payload required" }, 400, cors);
          const serialized = JSON.stringify(body.payload);
          if (serialized.length > 2 * 1024 * 1024) return json({ error: "Module state exceeds 2 MB limit" }, 413, cors);
          const current = await env.ARC_DB.prepare("SELECT rev FROM case_module_state WHERE case_id=? AND module_id=?").bind(caseId,moduleId).first();
          const headerRev = String(request.headers.get("If-Match") || "").replace(/[^0-9]/g, "");
          const supplied = Number(headerRev || body.expectedRev);
          const now = new Date().toISOString();
          if (!current) {
            if (Number.isFinite(supplied) && supplied > 0) return json({ error:"Module state conflict", conflict:{ currentRev:0 } },409,cors);
            await env.ARC_DB.prepare("INSERT INTO case_module_state(case_id,module_id,payload,rev,updated_at,updated_by) VALUES(?,?,?,?,?,?)")
              .bind(caseId,moduleId,serialized,1,now,user.email).run();
            return json({ ok:true, caseId, moduleId, rev:1, updatedAt:now },200,cors);
          }
          const currentRev = Number(current.rev || 1);
          if (!Number.isInteger(supplied) || supplied <= 0) return json({ error:"If-Match or expectedRev is required for an existing module state", conflict:{ currentRev } },428,cors);
          if (supplied !== currentRev) return json({ error:"Module state changed elsewhere", conflict:{ currentRev } },409,cors);
          const result = await env.ARC_DB.prepare("UPDATE case_module_state SET payload=?,rev=rev+1,updated_at=?,updated_by=? WHERE case_id=? AND module_id=? AND rev=?")
            .bind(serialized,now,user.email,caseId,moduleId,currentRev).run();
          if (!result.meta || Number(result.meta.changes || 0) !== 1) {
            const latest = await env.ARC_DB.prepare("SELECT rev FROM case_module_state WHERE case_id=? AND module_id=?").bind(caseId,moduleId).first();
            return json({ error:"Module state changed elsewhere", conflict:{ currentRev:Number(latest?.rev || currentRev) } },409,cors);
          }
          return json({ ok:true, caseId, moduleId, rev:currentRev+1, updatedAt:now },200,cors);
        }
      }

      /* ---- Report assets: D1 metadata + R2 binary ----------------------- */
      if (norm === "/sync/report-assets" || norm === "/sync/report-assets/manifest" || /^\/sync\/report-assets\//.test(norm)) {
        const caseId = String(url.searchParams.get("caseId") || "");
        const isManifest = norm === "/sync/report-assets/manifest";
        const fileMatch = norm.match(/^\/sync\/report-assets\/files\/([^/]+)$/);
        const itemMatch = norm.match(/^\/sync\/report-assets\/([^/]+)$/);

        if (isManifest && request.method === "GET") {
          const accessCheck = await requireCaseRead(env.ARC_DB, caseId, user, cors);
          if (accessCheck.response) return accessCheck.response;
          const rows = await env.ARC_DB.prepare("SELECT * FROM report_assets WHERE case_id=? ORDER BY updated_at DESC").bind(caseId).all();
          const records = (rows.results || []).map((row) => {
            const record = parseJson(row.payload, {});
            if (row.file_key) record.file = { name: row.file_name, storedName: row.file_key.split('/').pop(), relativePath: "r2://" + row.file_key, size: row.file_size, type: row.file_type, sha256: row.sha256 };
            return record;
          }).filter((record) => record.selectedForFinal && ["approved","included"].includes(String(record.status || "").toLowerCase()));
          return json({ schema:"arc-final-report-manifest", schemaVersion:3, caseId, generatedAt:new Date().toISOString(), records, count:records.length, certification:{ allApproved:true, reviewedBy:user.email } }, 200, cors);
        }

        if (fileMatch) {
          const assetId = safeAssetToken(fileMatch[1], "");
          if (!caseId || !assetId) return json({ error:"Missing case or asset id" },400,cors);
          if (request.method === "PUT") {
            const accessCheck = await requireCaseWrite(env.ARC_DB, caseId, user, cors);
            if (accessCheck.response) return accessCheck.response;
            if (!env.FILES) return json({ error:"R2 binding FILES is not configured" },503,cors);
            const max = 250 * 1024 * 1024;
            const declared = Number(request.headers.get("content-length") || 0);
            if (declared && declared > max) return json({ error:"Upload exceeds 250 MB limit" },413,cors);
            if (!request.body) return json({ error:"Upload body required" },400,cors);
            let counted = 0;
            const limiter = new TransformStream({ transform(chunk, controller) { counted += chunk.byteLength; if (counted > max) throw new Error("UPLOAD_TOO_LARGE"); controller.enqueue(chunk); } });
            const limited = request.body.pipeThrough(limiter);
            const [uploadStream, hashStream] = limited.tee();
            const filename = String(url.searchParams.get("filename") || "upload.bin").slice(0,240);
            const contentType = String(request.headers.get("content-type") || "application/octet-stream").slice(0,160);
            const key = "cases/" + caseId + "/report-assets/" + assetId + "/" + safeAssetToken(filename,"upload.bin");
            let sha;
            try {
              const results = await Promise.all([
                env.FILES.put(key, uploadStream, { httpMetadata: { contentType }, customMetadata: { caseId, assetId, originalName: filename } }),
                sha256Readable(hashStream)
              ]);
              sha = results[1];
            } catch (error) {
              try { await env.FILES.delete(key); } catch (_) {}
              if (String(error && error.message).includes("UPLOAD_TOO_LARGE")) return json({ error:"Upload exceeds 250 MB limit" },413,cors);
              throw error;
            }
            const now = new Date().toISOString();
            const prior = await env.ARC_DB.prepare("SELECT * FROM report_assets WHERE case_id=? AND id=?").bind(caseId, assetId).first();
            const record = prior ? parseJson(prior.payload,{}) : { schemaVersion:1, id:assetId, caseId, type:"record", status:"draft", createdAt:now };
            record.id=assetId; record.caseId=caseId; record.title=record.title||filename; record.updatedAt=now; record.modifiedBy=user.email;
            const file = { name:filename, storedName:key.split('/').pop(), relativePath:"r2://"+key, size:counted, type:contentType, sha256:sha };
            record.file=file;
            await env.ARC_DB.prepare(`INSERT INTO report_assets(case_id,id,payload,file_key,file_name,file_type,file_size,sha256,created_at,updated_at,modified_by)
              VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(case_id,id) DO UPDATE SET payload=excluded.payload,file_key=excluded.file_key,file_name=excluded.file_name,file_type=excluded.file_type,file_size=excluded.file_size,sha256=excluded.sha256,updated_at=excluded.updated_at,modified_by=excluded.modified_by`)
              .bind(caseId,assetId,JSON.stringify(record),key,filename,contentType,counted,sha,prior&&prior.created_at||now,now,user.email).run();
            return json(file,200,cors);
          }
          if (request.method === "GET") {
            const accessCheck = await requireCaseRead(env.ARC_DB, caseId, user, cors);
            if (accessCheck.response) return accessCheck.response;
            if (!env.FILES) return json({ error:"R2 binding FILES is not configured" },503,cors);
            const row = await env.ARC_DB.prepare("SELECT * FROM report_assets WHERE case_id=? AND id=?").bind(caseId,assetId).first();
            if (!row || !row.file_key) return json({ error:"Uploaded file not found" },404,cors);
            const range = byteRangeHeader(request.headers.get("range"), Number(row.file_size||0));
            if (range && range.unsatisfiable) return new Response(null,{status:416,headers:{...cors,"Content-Range":"bytes */"+row.file_size}});
            const object = await env.FILES.get(row.file_key, range ? { range:{ offset:range.start, length:range.end-range.start+1 } } : undefined);
            if (!object) return json({ error:"Uploaded file not found" },404,cors);
            let type = row.file_type || "application/octet-stream";
            const headers = { ...cors, "Content-Type":type, "Cache-Control":"private, no-store", "X-Content-Type-Options":"nosniff", "Accept-Ranges":"bytes" };
            if (/^text\/html\b/i.test(type) || /\.html?$/i.test(row.file_name||"")) { headers["Content-Type"]="application/octet-stream"; headers["Content-Disposition"]='attachment; filename="'+safeAssetToken(row.file_name||"download.html","download.html")+'"'; }
            if (range) { headers["Content-Range"]="bytes "+range.start+"-"+range.end+"/"+row.file_size; headers["Content-Length"]=String(range.end-range.start+1); return new Response(object.body,{status:206,headers}); }
            headers["Content-Length"]=String(row.file_size||object.size||0);
            return new Response(object.body,{status:200,headers});
          }
        }

        if (itemMatch && !fileMatch && !isManifest) {
          const assetId = safeAssetToken(itemMatch[1], "");
          const accessCheck = request.method === "DELETE" ? await requireCaseWrite(env.ARC_DB, caseId, user, cors) : await requireCaseRead(env.ARC_DB, caseId, user, cors);
          if (accessCheck.response) return accessCheck.response;
          const row = await env.ARC_DB.prepare("SELECT * FROM report_assets WHERE case_id=? AND id=?").bind(caseId,assetId).first();
          if (!row) return json({ error:"Report asset not found" },404,cors);
          if (request.method === "GET") return json(parseJson(row.payload,{}),200,cors);
          if (request.method === "DELETE") { if (row.file_key && env.FILES) await env.FILES.delete(row.file_key); await env.ARC_DB.prepare("DELETE FROM report_assets WHERE case_id=? AND id=?").bind(caseId,assetId).run(); return json({deleted:true,id:assetId,caseId},200,cors); }
        }

        if (norm === "/sync/report-assets") {
          if (request.method === "GET") {
            const accessCheck = await requireCaseRead(env.ARC_DB, caseId, user, cors);
            if (accessCheck.response) return accessCheck.response;
            const rows = await env.ARC_DB.prepare("SELECT * FROM report_assets WHERE case_id=? ORDER BY updated_at DESC").bind(caseId).all();
            const records = (rows.results || []).map((row) => { const record=parseJson(row.payload,{}); if(row.file_key)record.file={name:row.file_name,storedName:row.file_key.split('/').pop(),relativePath:"r2://"+row.file_key,size:row.file_size,type:row.file_type,sha256:row.sha256}; return record; }).filter((r)=>String(r.status||"").toLowerCase()!=="archived");
            return json(records,200,cors);
          }
          if (request.method === "POST") {
            const body = await request.json().catch(()=>null);
            const targetCase = String(body && body.caseId || caseId || "");
            const accessCheck = await requireCaseWrite(env.ARC_DB,targetCase,user,cors);
            if(accessCheck.response)return accessCheck.response;
            if(!body||typeof body!=="object")return json({error:"Asset payload required"},400,cors);
            const assetId=safeAssetToken(body.id||uuid());
            const prior=await env.ARC_DB.prepare("SELECT * FROM report_assets WHERE case_id=? AND id=?").bind(targetCase,assetId).first();
            const previous=prior?parseJson(prior.payload,{}):{};
            const submitted={...body}; delete submitted.file;
            const now=new Date().toISOString();
            const record={...previous,...submitted,id:assetId,caseId:targetCase,createdAt:previous.createdAt||now,updatedAt:now,modifiedBy:user.email};
            if(!record.status)record.status="draft";
            if(prior&&prior.file_key)record.file={name:prior.file_name,storedName:prior.file_key.split('/').pop(),relativePath:"r2://"+prior.file_key,size:prior.file_size,type:prior.file_type,sha256:prior.sha256};
            await env.ARC_DB.prepare(`INSERT INTO report_assets(case_id,id,payload,file_key,file_name,file_type,file_size,sha256,created_at,updated_at,modified_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)
              ON CONFLICT(case_id,id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at,modified_by=excluded.modified_by`)
              .bind(targetCase,assetId,JSON.stringify(record),prior&&prior.file_key||"",prior&&prior.file_name||"",prior&&prior.file_type||"",prior&&prior.file_size||0,prior&&prior.sha256||"",prior&&prior.created_at||now,now,user.email).run();
            return json(record,200,cors);
          }
        }
      }

      /* ---- Collection: list + create ---- */
      if (norm === "/sync/cases") {
        if (request.method === "GET") {
          // Only cases the caller owns or is a member of. Non-members never
          // see other people's cases in the list.
          const rows = await env.ARC_DB.prepare(
            `SELECT c.id, c.data, c.rev, c.updated_at, c.updated_by
               FROM cases c
               LEFT JOIN case_members m
                 ON m.case_id = c.id AND m.user_id = ?
              WHERE c.deleted = 0
                AND (c.owner_user_id = ? OR m.user_id IS NOT NULL)`
          )
            .bind(user.key, user.key)
            .all();
          const cases = (rows.results || []).map((row) => {
            const obj = JSON.parse(row.data);
            obj.__rev = row.rev;
            obj.__updatedAt = row.updated_at;
            obj.__updatedBy = row.updated_by;
            return obj;
          });
          return json(
            { cases, serverTime: new Date().toISOString() },
            200,
            cors
          );
        }

        if (request.method === "POST") {
          const body = await request.json().catch(() => null);
          if (!body || typeof body !== "object") {
            return json({ error: "Invalid case body" }, 400, cors);
          }
          const id = typeof body.id === "string" ? body.id : "";
          if (!ID_PATTERN.test(id)) {
            return json(
              { error: "Invalid case id (expected 4-64 chars of A-Z a-z 0-9 _ -)" },
              400,
              cors
            );
          }
          const existing = await env.ARC_DB.prepare(
            "SELECT id FROM cases WHERE id = ?"
          )
            .bind(id)
            .first();
          if (existing) {
            return json({ error: "Case id already exists" }, 409, cors);
          }
          return await createCase(env.ARC_DB, id, body, user, cors);
        }

        return json({ error: "Method not allowed" }, 405, cors);
      }

      /* ---- Final report: server-side version + approval state ---- */
      const finalReportMatch = norm.match(/^\/sync\/final-report\/([^/]+)(?:\/(approve|versions))?$/);
      if (finalReportMatch) {
        const caseId = finalReportMatch[1];
        const sub = finalReportMatch[2] || "";
        const accessCheck = await requireCaseWrite(env.ARC_DB, caseId, user, cors);
        if (accessCheck.response) return accessCheck.response;
        const id = finalReportId(caseId);

        if (!sub && request.method === "GET") {
          const row = await env.ARC_DB.prepare("SELECT * FROM final_reports WHERE id=? AND case_id=?").bind(id, caseId).first();
          if (!row) return json({ report: null }, 200, cors);
          return json({ report: row }, 200, cors);
        }

        if (!sub && request.method === "PUT") {
          const body = await request.json().catch(() => null);
          if (!body || typeof body !== "object" || !body.report) {
            return json({ error: "Final report payload required" }, 400, cors);
          }
          const now = new Date().toISOString();
          const payload = JSON.stringify(body.report);
          const hash = await sha256Text(payload);
          const existing = await env.ARC_DB.prepare("SELECT * FROM final_reports WHERE id=? AND case_id=?").bind(id, caseId).first();
          if (!existing) {
            await env.ARC_DB.prepare(`INSERT INTO final_reports
              (id, case_id, revision, payload, payload_hash, approved, updated_at, updated_by)
              VALUES (?, ?, 1, ?, ?, 0, ?, ?)`)
              .bind(id, caseId, payload, hash, now, user.email).run();
            return json({ ok: true, id, caseId, revision: 1, approved: false, updatedAt: now }, 200, cors);
          }
          const changed = existing.payload_hash !== hash;
          const revision = changed ? Number(existing.revision || 1) + 1 : Number(existing.revision || 1);
          if (changed) {
            await env.ARC_DB.prepare(`INSERT INTO final_report_versions
              (id, report_id, case_id, revision, snapshot, saved_by, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`)
              .bind(uuid(), id, caseId, existing.revision, existing.payload, user.email, now).run();
          }
          await env.ARC_DB.prepare(`UPDATE final_reports SET
            revision=?, payload=?, payload_hash=?, approved=CASE WHEN ? THEN 0 ELSE approved END,
            approved_by=CASE WHEN ? THEN '' ELSE approved_by END,
            approved_at=CASE WHEN ? THEN '' ELSE approved_at END,
            approved_revision=CASE WHEN ? THEN 0 ELSE approved_revision END,
            invalidated_at=CASE WHEN ? THEN ? ELSE invalidated_at END,
            updated_at=?, updated_by=?
            WHERE id=? AND case_id=?`)
            .bind(revision, payload, hash, changed ? 1 : 0, changed ? 1 : 0, changed ? 1 : 0, changed ? 1 : 0,
              changed ? 1 : 0, changed ? now : "", now, user.email, id, caseId).run();
          return json({ ok: true, id, caseId, revision, approved: changed ? false : Boolean(existing.approved), updatedAt: now }, 200, cors);
        }

        if (sub === "approve" && request.method === "POST") {
          const now = new Date().toISOString();
          const row = await env.ARC_DB.prepare("SELECT * FROM final_reports WHERE id=? AND case_id=?").bind(id, caseId).first();
          if (!row) return json({ error: "Final report has not been saved" }, 428, cors);
          await env.ARC_DB.prepare(`UPDATE final_reports SET approved=1, approved_by=?, approved_at=?,
            approved_revision=revision, invalidated_at='', updated_at=?, updated_by=? WHERE id=? AND case_id=?`)
            .bind(user.email, now, now, user.email, id, caseId).run();
          return json({ ok: true, id, caseId, revision: row.revision, approved: true, approvedBy: user.email, approvedAt: now }, 200, cors);
        }

        if (sub === "versions" && request.method === "GET") {
          const rows = await env.ARC_DB.prepare(
            "SELECT id, revision, saved_by, created_at FROM final_report_versions WHERE report_id=? AND case_id=? ORDER BY revision DESC"
          ).bind(id, caseId).all();
          return json({ versions: rows.results || [] }, 200, cors);
        }

        return json({ error: "Method not allowed" }, 405, cors);
      }

      /* ---- Single case: GET / PUT / DELETE ---- */
      // /sync/cases/:id, with /sync/case/:id kept as a legacy alias.
      const caseMatch = norm.match(/^\/sync\/cases?\/([^/]+)$/);
      if (caseMatch) {
        const id = caseMatch[1];
        // Validate only. Ids are never normalized or characters stripped -
        // rewriting ids broke audit/approval lookups in the old handler.
        if (!ID_PATTERN.test(id)) {
          return json(
            { error: "Invalid case id (expected 4-64 chars of A-Z a-z 0-9 _ -)" },
            400,
            cors
          );
        }

        const access = await loadCaseAccess(env.ARC_DB, id, user.key);

        if (request.method === "GET") {
          // Non-members get the same 404 as a truly missing case, so this
          // route never confirms that a case id exists.
          if (!access.exists || !access.isMember || access.row.deleted) {
            return json({ error: "Case not found" }, 404, cors);
          }
          const row = access.row;
          const obj = JSON.parse(row.data);
          obj.__rev = row.rev;
          obj.__updatedAt = row.updated_at;
          obj.__updatedBy = row.updated_by;
          return json({ case: obj }, 200, cors);
        }

        if (request.method === "PUT") {
          const body = await request.json().catch(() => null);
          if (!body || typeof body !== "object") {
            return json({ error: "Invalid case body" }, 400, cors);
          }

          // Upsert semantics preserved for the frontend: PUT of an id that
          // does not exist yet creates it, owned by the caller.
          if (!access.exists) {
            return await createCase(env.ARC_DB, id, body, user, cors);
          }
          if (!access.isMember) {
            return json({ error: "Case not found" }, 404, cors); // no leak
          }
          if (!access.canWrite) {
            return json(
              { error: "Forbidden: requires owner or editor role" },
              403,
              cors
            );
          }

          const expected = readExpectedRev(request, body);
          if (!expected.ok) return revisionRequired(cors);

          // Atomic compare-and-swap: the revision check and the write happen
          // in ONE statement, so two concurrent saves can never both pass.
          const now = new Date().toISOString();
          const dataText = JSON.stringify(cleanCaseBody(body));
          const result = await env.ARC_DB.prepare(
            "UPDATE cases SET data = ?, rev = rev + 1, deleted = 0, updated_at = ?, updated_by = ? WHERE id = ? AND rev = ?"
          )
            .bind(dataText, now, user.email || user.key, id, expected.rev)
            .run();
          const changed =
            (result.meta && (result.meta.changes ?? result.meta.rows_written)) || 0;
          if (changed !== 1) {
            // Lost the race (or client is stale): report current state,
            // never silently overwrite.
            const current = await env.ARC_DB.prepare(
              "SELECT id, rev, updated_at, updated_by FROM cases WHERE id = ?"
            )
              .bind(id)
              .first();
            if (!current) return json({ error: "Case not found" }, 404, cors);
            return conflict(current, cors);
          }
          return json(
            {
              ok: true,
              id,
              rev: expected.rev + 1,
              updatedAt: now,
              updatedBy: user.email || user.key
            },
            200,
            cors
          );
        }

        if (request.method === "DELETE") {
          if (!access.exists || !access.isMember || access.row.deleted) {
            return json({ error: "Case not found" }, 404, cors); // no leak
          }
          if (!access.canWrite) {
            return json(
              { error: "Forbidden: requires owner or editor role" },
              403,
              cors
            );
          }

          const body = await request.json().catch(() => null);
          const expected = readExpectedRev(request, body);
          if (!expected.ok) return revisionRequired(cors);

          // Soft delete with the same atomic compare-and-swap pattern.
          const now = new Date().toISOString();
          const result = await env.ARC_DB.prepare(
            "UPDATE cases SET deleted = 1, rev = rev + 1, updated_at = ?, updated_by = ? WHERE id = ? AND rev = ? AND deleted = 0"
          )
            .bind(now, user.email || user.key, id, expected.rev)
            .run();
          const changed =
            (result.meta && (result.meta.changes ?? result.meta.rows_written)) || 0;
          if (changed !== 1) {
            const current = await env.ARC_DB.prepare(
              "SELECT id, rev, updated_at, updated_by FROM cases WHERE id = ? AND deleted = 0"
            )
              .bind(id)
              .first();
            if (!current) return json({ error: "Case not found" }, 404, cors);
            return conflict(current, cors);
          }
          return json({ ok: true, id, deleted: true, rev: expected.rev + 1 }, 200, cors);
        }

        return json({ error: "Method not allowed" }, 405, cors);
      }

      return json({ error: "Not found" }, 404, cors);
    } catch (error) {
      return json(
        { error: "Server error", detail: String(error && error.message) },
        500,
        cors
      );
    }
  }
};
