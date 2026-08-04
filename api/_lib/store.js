/**
 * ARC storage adapter.
 *
 * Production (Vercel): uses an Upstash / Vercel KV REST endpoint when
 * KV_REST_API_URL + KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL/TOKEN)
 * are configured. No npm dependency is required; plain fetch is used.
 *
 * Local development: falls back to JSON files under ./database.
 * On Vercel without KV configured it falls back to /tmp, which is
 * EPHEMERAL and will lose data between deployments and cold starts.
 */

const fs = require("fs");
const path = require("path");

const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
const kvEnabled = Boolean(KV_URL && KV_TOKEN);
const onVercel = Boolean(process.env.VERCEL);

const localRoot = onVercel
  ? "/tmp/arc-database"
  : path.resolve(__dirname, "..", "..", "database");

function storageMode() {
  if (kvEnabled) return "kv";
  return onVercel ? "ephemeral-tmp" : "local-file";
}

function durable() {
  return kvEnabled || !onVercel;
}

function allowEphemeralWrites() {
  return String(process.env.ARC_ALLOW_EPHEMERAL_STORAGE || "").trim() === "1";
}

function assertWritable() {
  if (durable() || allowEphemeralWrites()) return;
  const error = new Error(
    "Durable storage is not configured. Connect Upstash/Vercel KV (KV_REST_API_URL + KV_REST_API_TOKEN) before writing case or report data on Vercel."
  );
  error.statusCode = 503;
  throw error;
}

async function kv(command) {
  const response = await fetch(KV_URL, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + KV_TOKEN,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) {
    throw new Error("Storage request failed (" + response.status + ")");
  }
  const data = await response.json();
  if (data && data.error) throw new Error(String(data.error));
  return data ? data.result : null;
}

function fileFor(key) {
  const safe = String(key).replace(/[^a-zA-Z0-9:._-]+/g, "-").replace(/:/g, "__");
  return path.join(localRoot, safe + ".json");
}

function ensureLocalRoot() {
  if (!fs.existsSync(localRoot)) fs.mkdirSync(localRoot, { recursive: true });
}

async function getJson(key) {
  if (kvEnabled) {
    const raw = await kv(["GET", key]);
    if (raw == null) return null;
    try {
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (error) {
      return null;
    }
  }
  const target = fileFor(key);
  if (!fs.existsSync(target)) return null;
  try {
    return JSON.parse(fs.readFileSync(target, "utf8"));
  } catch (error) {
    return null;
  }
}

async function setJson(key, value) {
  assertWritable();
  if (kvEnabled) {
    await kv(["SET", key, JSON.stringify(value)]);
    return value;
  }
  ensureLocalRoot();
  const target = fileFor(key);
  const temporary = target + ".tmp";
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2));
  fs.renameSync(temporary, target);
  return value;
}

async function delKey(key) {
  assertWritable();
  if (kvEnabled) {
    await kv(["DEL", key]);
    return true;
  }
  const target = fileFor(key);
  if (fs.existsSync(target)) fs.unlinkSync(target);
  return true;
}

/** Index helpers: an index is a JSON array of ids stored under one key. */
async function readIndex(indexKey) {
  const value = await getJson(indexKey);
  return Array.isArray(value) ? value : [];
}

async function addToIndex(indexKey, id) {
  const current = await readIndex(indexKey);
  if (!current.includes(id)) {
    current.push(id);
    await setJson(indexKey, current);
  }
  return current;
}

async function removeFromIndex(indexKey, id) {
  const current = await readIndex(indexKey);
  const next = current.filter(function (item) { return item !== id; });
  await setJson(indexKey, next);
  return next;
}

async function batchGetJson(keys) {
  const list = Array.isArray(keys) ? keys : [];
  if (!list.length) return [];
  if (kvEnabled) {
    const results = await kv(["MGET"].concat(list));
    const values = Array.isArray(results) ? results : [];
    return list.map(function (_key, index) {
      const raw = values[index];
      if (raw == null) return null;
      try {
        return typeof raw === "string" ? JSON.parse(raw) : raw;
      } catch (error) {
        return null;
      }
    });
  }
  const output = [];
  for (const key of list) output.push(await getJson(key));
  return output;
}

async function setJsonWithTtl(key, value, ttlSeconds) {
  assertWritable();
  const ttl = Number(ttlSeconds);
  if (kvEnabled && Number.isFinite(ttl) && ttl > 0) {
    await kv(["SET", key, JSON.stringify(value), "EX", Math.floor(ttl)]);
    return value;
  }
  return setJson(key, value);
}

async function incr(key) {
  assertWritable();
  if (kvEnabled) {
    const value = await kv(["INCR", key]);
    return Number(value) || 0;
  }
  const current = Number((await getJson(key)) || 0) || 0;
  const next = current + 1;
  await setJson(key, next);
  return next;
}

async function expire(key, ttlSeconds) {
  const ttl = Math.floor(Number(ttlSeconds) || 0);
  if (!ttl) return false;
  if (kvEnabled) {
    await kv(["EXPIRE", key, ttl]);
    return true;
  }
  return true;
}

module.exports = {
  storageMode,
  durable,
  allowEphemeralWrites,
  assertWritable,
  getJson,
  setJson,
  setJsonWithTtl,
  delKey,
  readIndex,
  addToIndex,
  removeFromIndex,
  batchGetJson,
  incr,
  expire
};
