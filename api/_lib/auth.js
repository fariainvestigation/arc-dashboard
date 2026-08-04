/**
 * Per-user authentication for ARC.
 *
 * Order:
 * 1) Cloudflare Access JWT (CF-Access-JWT-Assertion)
 * 2) Opaque session token (x-session-token header or arc_session cookie)
 *
 * Shared ARC_ACCESS_TOKEN is intentionally not accepted.
 */

const crypto = require("crypto");
const store = require("./store");

const SESSION_TTL_MS = Number(process.env.ARC_SESSION_TTL_MS || 12 * 60 * 60 * 1000);
const jwksCache = { fetchedAt: 0, keys: [] };

function header(request, name) {
  const headers = request.headers || {};
  const direct = headers[name] || headers[name.toLowerCase()];
  if (direct) return String(Array.isArray(direct) ? direct[0] : direct).trim();
  // Node lowercases header names
  const lower = name.toLowerCase();
  const value = headers[lower];
  return value ? String(Array.isArray(value) ? value[0] : value).trim() : "";
}

function getCookie(request, name) {
  const cookie = header(request, "cookie");
  if (!cookie) return "";
  const match = cookie.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
  return match ? decodeURIComponent(match[1]) : "";
}

function b64urlJson(part) {
  const padded = part + "=".repeat((4 - (part.length % 4)) % 4);
  return JSON.parse(Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
}

function sessionKey(token) {
  return "arc:session:" + token;
}

function userKey(userId) {
  return "arc:user:" + userId;
}

function hashPassword(password, salt) {
  const usedSalt = salt || crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(String(password), usedSalt, 64).toString("hex");
  return { salt: usedSalt, hash: derived };
}

function verifyPassword(password, salt, expectedHash) {
  const derived = crypto.scryptSync(String(password), String(salt), 64).toString("hex");
  const a = Buffer.from(derived, "hex");
  const b = Buffer.from(String(expectedHash), "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function parseAuthUsers() {
  const raw = String(process.env.ARC_AUTH_USERS || "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

async function ensureBootstrapUser() {
  const email = String(process.env.ARC_BOOTSTRAP_EMAIL || "").trim().toLowerCase();
  const password = String(process.env.ARC_BOOTSTRAP_PASSWORD || "");
  if (!email || !password) return null;
  const userId = "bootstrap:" + crypto.createHash("sha256").update(email).digest("hex").slice(0, 16);
  const existing = await store.getJson(userKey(userId));
  if (existing) return existing;
  const hashed = hashPassword(password);
  const user = {
    userId: userId,
    email: email,
    role: "admin",
    salt: hashed.salt,
    passwordHash: hashed.hash,
    createdAt: new Date().toISOString()
  };
  await store.setJson(userKey(userId), user);
  return user;
}

async function findUserByEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return null;

  const fromEnv = parseAuthUsers().find(function (entry) {
    return String(entry.email || "").trim().toLowerCase() === normalized;
  });
  if (fromEnv) {
    return {
      userId: fromEnv.userId || ("user:" + crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 16)),
      email: normalized,
      role: fromEnv.role || "investigator",
      salt: fromEnv.salt,
      passwordHash: fromEnv.passwordHash,
      password: fromEnv.password
    };
  }

  await ensureBootstrapUser();
  const bootstrapEmail = String(process.env.ARC_BOOTSTRAP_EMAIL || "").trim().toLowerCase();
  if (bootstrapEmail && bootstrapEmail === normalized) {
    const userId = "bootstrap:" + crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 16);
    return store.getJson(userKey(userId));
  }
  return null;
}

async function fetchCloudflareJwks() {
  const team = String(process.env.CF_ACCESS_TEAM_DOMAIN || "").trim();
  if (!team) return [];
  const now = Date.now();
  if (jwksCache.keys.length && now - jwksCache.fetchedAt < 60 * 60 * 1000) {
    return jwksCache.keys;
  }
  const response = await fetch("https://" + team + ".cloudflareaccess.com/cdn-cgi/access/certs", {
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error("Cloudflare JWKS fetch failed (" + response.status + ")");
  const data = await response.json();
  jwksCache.keys = Array.isArray(data.keys) ? data.keys : [];
  jwksCache.fetchedAt = now;
  return jwksCache.keys;
}

function jwkToPem(jwk) {
  // Minimal RSA JWK → PEM for Cloudflare Access certs
  function b64urlToBuffer(value) {
    const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
    return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  }
  const modulus = b64urlToBuffer(jwk.n);
  const exponent = b64urlToBuffer(jwk.e);
  function derLen(length) {
    if (length < 0x80) return Buffer.from([length]);
    if (length < 0x100) return Buffer.from([0x81, length]);
    return Buffer.from([0x82, (length >> 8) & 0xff, length & 0xff]);
  }
  function derInt(buffer) {
    let value = buffer;
    if (value[0] & 0x80) value = Buffer.concat([Buffer.from([0x00]), value]);
    return Buffer.concat([Buffer.from([0x02]), derLen(value.length), value]);
  }
  const ints = Buffer.concat([derInt(modulus), derInt(exponent)]);
  const sequence = Buffer.concat([Buffer.from([0x30]), derLen(ints.length), ints]);
  const bitString = Buffer.concat([Buffer.from([0x03]), derLen(sequence.length + 1), Buffer.from([0x00]), sequence]);
  const rsaOid = Buffer.from("300d06092a864886f70d0101010500", "hex");
  const body = Buffer.concat([rsaOid, bitString]);
  const spki = Buffer.concat([Buffer.from([0x30]), derLen(body.length), body]);
  const b64 = spki.toString("base64").match(/.{1,64}/g).join("\n");
  return "-----BEGIN PUBLIC KEY-----\n" + b64 + "\n-----END PUBLIC KEY-----";
}

async function verifyCloudflareAccess(request) {
  const token = header(request, "cf-access-jwt-assertion");
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  let headerJson;
  let payload;
  try {
    headerJson = b64urlJson(parts[0]);
    payload = b64urlJson(parts[1]);
  } catch (error) {
    return null;
  }

  const aud = String(process.env.CF_ACCESS_AUD || "").trim();
  const team = String(process.env.CF_ACCESS_TEAM_DOMAIN || "").trim();
  if (!aud || !team) {
    // Require explicit Cloudflare config before trusting edge JWT claims.
    return null;
  }

  const tokenAud = payload.aud;
  const audOk = Array.isArray(tokenAud) ? tokenAud.includes(aud) : tokenAud === aud;
  if (!audOk) return null;
  if (payload.exp && payload.exp * 1000 < Date.now()) return null;

  try {
    const keys = await fetchCloudflareJwks();
    const jwk = keys.find(function (key) { return key.kid === headerJson.kid; }) || keys[0];
    if (!jwk) return null;
    const pem = jwkToPem(jwk);
    const verifier = crypto.createVerify("RSA-SHA256");
    verifier.update(parts[0] + "." + parts[1]);
    verifier.end();
    const signature = Buffer.from(parts[2].replace(/-/g, "+").replace(/_/g, "/"), "base64");
    if (!verifier.verify(pem, signature)) return null;
  } catch (error) {
    return null;
  }

  return {
    userId: String(payload.email || payload.sub || "").toLowerCase(),
    email: payload.email || null,
    groups: payload.groups || [],
    role: "investigator",
    expiresAt: payload.exp ? payload.exp * 1000 : null,
    source: "cloudflare-access"
  };
}

async function verifySessionToken(request) {
  const token =
    header(request, "x-session-token") ||
    getCookie(request, "arc_session") ||
    "";
  if (!token) return null;
  const session = await store.getJson(sessionKey(token));
  if (!session || !session.expiresAt || session.expiresAt < Date.now()) {
    return null;
  }
  return {
    userId: session.userId,
    email: session.email || null,
    role: session.role || "investigator",
    expiresAt: session.expiresAt,
    source: "session",
    token: token
  };
}

async function authenticate(request) {
  const cfUser = await verifyCloudflareAccess(request);
  if (cfUser && cfUser.userId) return cfUser;
  const sessionUser = await verifySessionToken(request);
  if (sessionUser && sessionUser.userId) return sessionUser;
  return null;
}

async function createSession(user) {
  const token = crypto.randomBytes(32).toString("hex");
  const session = {
    token: token,
    userId: user.userId,
    email: user.email || null,
    role: user.role || "investigator",
    createdAt: new Date().toISOString(),
    expiresAt: Date.now() + SESSION_TTL_MS
  };
  await store.setJson(sessionKey(token), session);
  return session;
}

async function destroySession(token) {
  if (!token) return false;
  await store.delKey(sessionKey(token));
  return true;
}

async function loginWithPassword(email, password) {
  const user = await findUserByEmail(email);
  if (!user) return null;

  let ok = false;
  if (user.passwordHash && user.salt) {
    ok = verifyPassword(password, user.salt, user.passwordHash);
  } else if (user.password) {
    // Env-configured plaintext only for tightly controlled bootstrap lists.
    ok = String(user.password) === String(password);
  }
  if (!ok) return null;

  return {
    userId: user.userId,
    email: user.email,
    role: user.role || "investigator"
  };
}

function canAccessCase(user, caseData) {
  if (!user || !caseData) return false;
  if (user.role === "admin") return true;
  if (!caseData.ownerId) {
    return String(process.env.ARC_ALLOW_LEGACY_CASES || "").trim() === "1";
  }
  return caseData.ownerId === user.userId;
}

function sessionCookie(token, maxAgeSeconds) {
  const secure = Boolean(process.env.VERCEL) || process.env.NODE_ENV === "production";
  const parts = [
    "arc_session=" + encodeURIComponent(token),
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=" + String(maxAgeSeconds)
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

module.exports = {
  authenticate,
  verifyCloudflareAccess,
  verifySessionToken,
  createSession,
  destroySession,
  loginWithPassword,
  canAccessCase,
  sessionCookie,
  hashPassword,
  ensureBootstrapUser,
  getCookie,
  header
};
