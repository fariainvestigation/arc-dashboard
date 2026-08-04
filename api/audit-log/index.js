const crypto = require("crypto");
const { sendJson, readBody, query, handler } = require("../_lib/http");
const { canAccessCase } = require("../_lib/auth");
const store = require("../_lib/store");

function caseKey(id) { return "arc:case:" + id; }
function auditKey(caseId) { return "arc:audit:" + caseId; }

async function loadOwnedCase(user, caseId) {
  const caseData = await store.getJson(caseKey(caseId));
  if (!caseData) {
    const error = new Error("Case not found");
    error.statusCode = 404;
    throw error;
  }
  if (!canAccessCase(user, caseData)) {
    const error = new Error("Access denied");
    error.statusCode = 403;
    throw error;
  }
  return caseData;
}

function normalizeEntry(entry, user) {
  return {
    id: entry.id || crypto.randomUUID(),
    timestamp: entry.timestamp || new Date().toISOString(),
    userId: user.userId,
    email: user.email || null,
    action: String(entry.action || "").slice(0, 120),
    caseId: String(entry.caseId || "").trim(),
    reportId: entry.reportId ? String(entry.reportId).slice(0, 160) : null,
    details: entry.details && typeof entry.details === "object" ? entry.details : { summary: entry.summary || null },
    synced: true
  };
}

module.exports = handler(async function (request, response) {
  const user = request.user;
  if (!user) return sendJson(response, 401, { error: "Unauthorized" });

  if (request.method === "POST") {
    const body = await readBody(request);
    const caseId = String(body.caseId || "").trim();
    if (!caseId) return sendJson(response, 400, { error: "caseId required" });
    if (!body.action) return sendJson(response, 400, { error: "action required" });
    await loadOwnedCase(user, caseId);
    const entry = normalizeEntry(body, user);
    const logs = (await store.getJson(auditKey(caseId))) || [];
    logs.push(entry);
    await store.setJson(auditKey(caseId), logs.slice(-5000));
    return sendJson(response, 200, entry);
  }

  if (request.method === "GET") {
    const caseId = query(request, "caseId");
    if (!caseId) return sendJson(response, 400, { error: "caseId required" });
    await loadOwnedCase(user, caseId);
    const logs = (await store.getJson(auditKey(caseId))) || [];
    return sendJson(response, 200, { caseId: caseId, entries: logs });
  }

  return false;
});

module.exports.loadOwnedCase = loadOwnedCase;
module.exports.auditKey = auditKey;
module.exports.normalizeEntry = normalizeEntry;
