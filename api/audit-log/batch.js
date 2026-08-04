const { sendJson, readBody, handler } = require("../_lib/http");
const store = require("../_lib/store");
const { loadOwnedCase, auditKey, normalizeEntry } = require("./index");

module.exports = handler(async function (request, response) {
  if (request.method !== "POST") return false;
  const user = request.user;
  if (!user) return sendJson(response, 401, { error: "Unauthorized" });

  const body = await readBody(request);
  const entries = Array.isArray(body.entries) ? body.entries : [];
  let synced = 0;

  for (const raw of entries.slice(0, 200)) {
    const caseId = String(raw.caseId || "").trim();
    if (!caseId || !raw.action) continue;
    try {
      await loadOwnedCase(user, caseId);
    } catch (error) {
      continue;
    }
    const entry = normalizeEntry(raw, user);
    const logs = (await store.getJson(auditKey(caseId))) || [];
    if (logs.some(function (item) { return item.id === entry.id; })) {
      synced += 1;
      continue;
    }
    logs.push(entry);
    await store.setJson(auditKey(caseId), logs.slice(-5000));
    synced += 1;
  }

  return sendJson(response, 200, { synced: synced });
});
