const { sendJson, handler } = require("./_lib/http");
const store = require("./_lib/store");

module.exports = handler(async function (request, response) {
  if (request.method !== "GET") return false;

  const geminiConfigured = Boolean(String(process.env.GEMINI_API_KEY || "").trim());
  const hostedUploadLimit = Number(process.env.ARC_MAX_UPLOAD_BYTES || 4 * 1024 * 1024);
  const health = {
    status: "ok",
    ok: true,
    routing: "enabled",
    version: "11.4.3",
    map: true,
    reportAssets: true,
    boardCommand: true,
    timestamp: new Date().toISOString(),
    environment: process.env.VERCEL ? "vercel" : "local",
    security: {
      auth: "per-user",
      cloudflareAccess: Boolean(process.env.CF_ACCESS_AUD && process.env.CF_ACCESS_TEAM_DOMAIN),
      passwordLogin: Boolean(process.env.ARC_BOOTSTRAP_EMAIL || process.env.ARC_AUTH_USERS),
      sharedAccessTokenAccepted: false,
      geminiServerKey: geminiConfigured,
      clientApiKeysAllowed: !process.env.VERCEL || String(process.env.ARC_ALLOW_CLIENT_API_KEYS || "").trim() === "1"
    },
    limits: {
      hostedUploadBytes: hostedUploadLimit,
      note: "Large evidence should use the local server (npm run serve)."
    }
  };

  const configuredKv = Boolean(
    (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL) &&
    (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN)
  );

  if (configuredKv) {
    const testKey = "arc:health-check:" + Date.now();
    try {
      // Bypass assertWritable for the probe by using get/set through store;
      // store.setJson will still throw if Vercel lacks KV — which is correct.
      await store.setJson(testKey, { test: true, at: new Date().toISOString() });
      const result = await store.getJson(testKey);
      await store.delKey(testKey);
      health.storage = {
        mode: "kv",
        durable: Boolean(result && result.test === true),
        kvReachable: Boolean(result && result.test === true),
        ephemeralWritesAllowed: store.allowEphemeralWrites()
      };
    } catch (error) {
      health.status = "degraded";
      health.ok = false;
      health.storage = {
        mode: "kv",
        durable: false,
        kvReachable: false,
        error: error.message || "KV probe failed",
        ephemeralWritesAllowed: store.allowEphemeralWrites()
      };
    }
  } else {
    const durable = store.durable();
    health.storage = {
      mode: store.storageMode(),
      durable: durable,
      kvReachable: false,
      note: process.env.VERCEL
        ? "KV not configured. Hosted writes are blocked unless ARC_ALLOW_EPHEMERAL_STORAGE=1."
        : "Using local JSON files under ./database",
      ephemeralWritesAllowed: store.allowEphemeralWrites()
    };
    if (process.env.VERCEL && !durable) {
      health.status = "degraded";
      health.ok = false;
    }
  }

  const statusCode = health.storage.durable ? 200 : (process.env.VERCEL ? 503 : 200);
  return sendJson(response, statusCode, health);
}, { auth: false });
