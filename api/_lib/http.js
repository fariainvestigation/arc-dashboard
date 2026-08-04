/** Shared helpers for the ARC serverless API routes. */

const crypto = require("crypto");
const { authenticate } = require("./auth");

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.end(JSON.stringify(payload));
  return true;
}

function safeToken(value, fallback) {
  return String(value || fallback || "item")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180) || "item";
}

function query(request, name) {
  const url = new URL(request.url, "http://localhost");
  return String(url.searchParams.get(name) || "").trim();
}

async function readBody(request) {
  if (request.body && typeof request.body === "object" && !Buffer.isBuffer(request.body)) {
    return request.body;
  }
  if (typeof request.body === "string") {
    try { return JSON.parse(request.body || "{}"); } catch (error) { throw new Error("Invalid JSON body"); }
  }
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try { return JSON.parse(raw); } catch (error) { throw new Error("Invalid JSON body"); }
}

async function readRaw(request) {
  if (Buffer.isBuffer(request.body)) return request.body;
  if (typeof request.body === "string") return Buffer.from(request.body, "utf8");
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function requestPath(request) {
  try {
    return new URL(request.url, "http://localhost").pathname;
  } catch (error) {
    return String(request.url || "");
  }
}

function tokensEqual(supplied, expected) {
  const a = Buffer.from(String(supplied || ""), "utf8");
  const b = Buffer.from(String(expected || ""), "utf8");
  if (a.length !== b.length || a.length === 0) return false;
  return crypto.timingSafeEqual(a, b);
}

function isPublicApiPath(pathname) {
  return (
    pathname === "/api/health" ||
    pathname === "/api/auth/login" ||
    pathname === "/api/auth/logout" ||
    pathname === "/api/auth/session" ||
    pathname.endsWith("/api/health") ||
    pathname.endsWith("/api/auth/login") ||
    pathname.endsWith("/api/auth/logout") ||
    pathname.endsWith("/api/auth/session")
  );
}

/**
 * Per-user auth gate. Public auth/health routes stay open.
 * Shared ARC_ACCESS_TOKEN is no longer accepted.
 */
async function accessDenied(request, response) {
  if (isPublicApiPath(requestPath(request))) return false;
  const user = await authenticate(request);
  if (user) {
    request.user = user;
    return false;
  }
  sendJson(response, 401, {
    error: "Unauthorized",
    hint: "Sign in via /login or Cloudflare Access. Send x-session-token or arc_session cookie."
  });
  return true;
}

function handler(fn, options) {
  const authRequired = !options || options.auth !== false;
  return async function (request, response) {
    try {
      if (authRequired && (await accessDenied(request, response))) return;
      if (!authRequired && !request.user) {
        request.user = await authenticate(request);
      }
      const handled = await fn(request, response);
      if (handled === false && !response.writableEnded) {
        sendJson(response, 405, { error: "Method not allowed" });
      }
    } catch (error) {
      if (!response.writableEnded) {
        const status = Number.isInteger(error.statusCode) && error.statusCode >= 400 && error.statusCode <= 599
          ? error.statusCode
          : 500;
        sendJson(response, status, { error: error.message || "Server error" });
      }
    }
  };
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

module.exports = {
  sendJson,
  safeToken,
  query,
  readBody,
  readRaw,
  handler,
  httpError,
  accessDenied,
  tokensEqual,
  isPublicApiPath
};
