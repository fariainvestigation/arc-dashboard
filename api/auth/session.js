/**
 * Auth session endpoints.
 * GET  /api/auth/session  — current user or gate status
 * POST /api/auth/login    — email/password → HttpOnly session cookie
 * POST /api/auth/logout   — clear session
 * DELETE /api/auth/session — clear session
 */

const { sendJson, readBody, handler } = require("../_lib/http");
const {
  authenticate,
  loginWithPassword,
  createSession,
  destroySession,
  sessionCookie,
  getCookie,
  header,
  ensureBootstrapUser
} = require("../_lib/auth");

module.exports = handler(async function (request, response) {
  if (request.method === "GET") {
    const user = await authenticate(request);
    return sendJson(response, 200, {
      authenticated: Boolean(user),
      user: user
        ? { userId: user.userId, email: user.email, role: user.role, source: user.source }
        : null,
      modes: {
        cloudflareAccess: Boolean(process.env.CF_ACCESS_AUD && process.env.CF_ACCESS_TEAM_DOMAIN),
        passwordLogin: Boolean(
          process.env.ARC_BOOTSTRAP_EMAIL ||
          process.env.ARC_AUTH_USERS
        )
      },
      note: "Per-user auth required for case and report APIs. Shared ARC_ACCESS_TOKEN is not accepted."
    });
  }

  if (request.method === "POST") {
    // Support both /api/auth/session and routed login body on this file when used as session endpoint.
    const body = await readBody(request);
    if (body && (body.action === "logout" || body.logout)) {
      const token = header(request, "x-session-token") || getCookie(request, "arc_session");
      await destroySession(token);
      response.setHeader("Set-Cookie", sessionCookie("", 0));
      return sendJson(response, 200, { ok: true, cleared: true });
    }
    return sendJson(response, 400, { error: "Use POST /api/auth/login to sign in" });
  }

  if (request.method === "DELETE") {
    const token = header(request, "x-session-token") || getCookie(request, "arc_session");
    await destroySession(token);
    response.setHeader("Set-Cookie", sessionCookie("", 0));
    return sendJson(response, 200, { ok: true, cleared: true });
  }

  return false;
}, { auth: false });

// Separate login handler export for /api/auth/login.js convenience
module.exports.loginHandler = handler(async function (request, response) {
  if (request.method !== "POST") return false;
  await ensureBootstrapUser();
  const body = await readBody(request);
  const email = String(body.email || "").trim();
  const password = String(body.password || "");
  if (!email || !password) {
    return sendJson(response, 400, { error: "Email and password required" });
  }
  const user = await loginWithPassword(email, password);
  if (!user) return sendJson(response, 401, { error: "Invalid credentials" });
  const session = await createSession(user);
  response.setHeader(
    "Set-Cookie",
    sessionCookie(session.token, Math.floor((session.expiresAt - Date.now()) / 1000))
  );
  return sendJson(response, 200, {
    ok: true,
    token: session.token,
    expiresAt: session.expiresAt,
    user: { userId: user.userId, email: user.email, role: user.role }
  });
}, { auth: false });
