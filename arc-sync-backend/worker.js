/**
 * ARC Shared Case Sync - Cloudflare Worker
 *
 * A minimal, strongly-consistent backend so two investigators on separate
 * laptops see and edit the same cases. Runs behind Cloudflare Zero Trust
 * Access, which supplies the signed-in identity on every request.
 *
 * Storage: D1 (SQLite). One row per case. Strong consistency and real
 * transactions, so a save from one laptop is immediately visible to the other
 * and concurrent saves cannot silently clobber each other.
 *
 * Routes (all under /sync):
 *   GET  /sync/cases            -> { cases: [...], serverTime }
 *   GET  /sync/case/:id         -> { case }
 *   PUT  /sync/case/:id         -> upsert one case, optimistic-lock on rev
 *   DELETE /sync/case/:id       -> soft delete
 *   GET  /sync/whoami           -> { email } from the Access header
 *
 * The Worker never sees API keys and never calls a model. It only stores case
 * JSON. Keys stay in each browser, exactly as before.
 */

const JSON_HEADERS = { "Content-Type": "application/json" };

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...extra }
  });
}

// Cloudflare Access forwards the authenticated user's email in this header.
// It is set by Access after the identity check and cannot be spoofed by the
// browser when the route is actually protected by an Access policy.
function identity(request) {
  const email =
    request.headers.get("Cf-Access-Authenticated-User-Email") ||
    request.headers.get("cf-access-authenticated-user-email") ||
    "";
  return email.trim().toLowerCase();
}

async function ensureSchema(db) {
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
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "");

    // CORS preflight for the tools, which are served from the same Access app.
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": request.headers.get("Origin") || "*",
          "Access-Control-Allow-Methods": "GET,PUT,DELETE,OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Allow-Credentials": "true"
        }
      });
    }

    const cors = {
      "Access-Control-Allow-Origin": request.headers.get("Origin") || "*",
      "Access-Control-Allow-Credentials": "true"
    };

    if (!env.ARC_DB) {
      return json({ error: "D1 binding ARC_DB is not configured" }, 500, cors);
    }

    const user = identity(request);
    if (!user) {
      // Without an Access identity we refuse rather than trust the caller.
      return json(
        {
          error:
            "No authenticated identity. This backend must run behind Cloudflare Access."
        },
        401,
        cors
      );
    }

    await ensureSchema(env.ARC_DB);

    try {
      if (path === "/sync/whoami" && request.method === "GET") {
        return json({ email: user }, 200, cors);
      }

      if (path === "/sync/cases" && request.method === "GET") {
        const rows = await env.ARC_DB.prepare(
          "SELECT id, data, rev, updated_at, updated_by FROM cases WHERE deleted = 0"
        ).all();
        const cases = (rows.results || []).map((row) => {
          const obj = JSON.parse(row.data);
          obj.__rev = row.rev;
          obj.__updatedAt = row.updated_at;
          obj.__updatedBy = row.updated_by;
          return obj;
        });
        return json({ cases, serverTime: new Date().toISOString() }, 200, cors);
      }

      const caseMatch = path.match(/^\/sync\/case\/([A-Za-z0-9_.:-]+)$/);
      if (caseMatch) {
        const id = caseMatch[1];

        if (request.method === "GET") {
          const row = await env.ARC_DB.prepare(
            "SELECT data, rev, updated_at, updated_by FROM cases WHERE id = ? AND deleted = 0"
          )
            .bind(id)
            .first();
          if (!row) return json({ error: "Case not found" }, 404, cors);
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
          const clientRev = Number(body.__rev || 0);
          const now = new Date().toISOString();
          const clean = { ...body };
          delete clean.__rev;
          delete clean.__updatedAt;
          delete clean.__updatedBy;
          const dataText = JSON.stringify(clean);

          const existing = await env.ARC_DB.prepare(
            "SELECT rev FROM cases WHERE id = ?"
          )
            .bind(id)
            .first();

          if (!existing) {
            await env.ARC_DB.prepare(
              "INSERT INTO cases (id, data, rev, deleted, updated_at, updated_by) VALUES (?, ?, 1, 0, ?, ?)"
            )
              .bind(id, dataText, now, user)
              .run();
            return json({ ok: true, id, rev: 1, updatedBy: user }, 200, cors);
          }

          // Optimistic lock: reject a stale write so nobody silently overwrites
          // a newer edit made on the other laptop.
          if (clientRev && clientRev !== existing.rev) {
            return json(
              {
                error: "conflict",
                message:
                  "This case was changed on another device. Reload to get the latest version before saving.",
                serverRev: existing.rev
              },
              409,
              cors
            );
          }

          const nextRev = existing.rev + 1;
          await env.ARC_DB.prepare(
            "UPDATE cases SET data = ?, rev = ?, deleted = 0, updated_at = ?, updated_by = ? WHERE id = ?"
          )
            .bind(dataText, nextRev, now, user, id)
            .run();
          return json({ ok: true, id, rev: nextRev, updatedBy: user }, 200, cors);
        }

        if (request.method === "DELETE") {
          const now = new Date().toISOString();
          await env.ARC_DB.prepare(
            "UPDATE cases SET deleted = 1, updated_at = ?, updated_by = ? WHERE id = ?"
          )
            .bind(now, user, id)
            .run();
          return json({ ok: true, id, deleted: true }, 200, cors);
        }
      }

      return json({ error: "Not found" }, 404, cors);
    } catch (error) {
      return json({ error: "Server error", detail: String(error && error.message) }, 500, cors);
    }
  }
};
