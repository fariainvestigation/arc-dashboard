const crypto = require("crypto");
const { sendJson, readBody, query, safeToken, handler } = require("../_lib/http");
const { canAccessCase } = require("../_lib/auth");
const store = require("../_lib/store");

const ALLOWED_STATUS = ["draft", "selected", "approved", "rejected", "included", "archived"];

function indexKey(caseId) { return "arc:assets:index:" + caseId; }
function assetKey(caseId, id) { return "arc:asset:" + caseId + ":" + id; }
function caseKey(id) { return "arc:case:" + id; }

async function assertCaseAccess(user, caseId) {
  const caseData = await store.getJson(caseKey(caseId));
  if (!caseData) {
    // Allow creating assets for a case the user is about to own locally only if legacy flag is on,
    // otherwise require an existing owned case record.
    if (String(process.env.ARC_ALLOW_LEGACY_CASES || "").trim() === "1") return { id: caseId, ownerId: user.userId };
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

async function listAssets(caseId) {
  const ids = await store.readIndex(indexKey(caseId));
  const items = [];
  for (const id of ids) {
    const record = await store.getJson(assetKey(caseId, id));
    if (record && record.status !== "archived") items.push(record);
  }
  return items;
}

module.exports = handler(async function (request, response) {
  const user = request.user;
  if (!user) return sendJson(response, 401, { error: "Unauthorized" });
  const caseId = query(request, "caseId");

  if (request.method === "GET") {
    if (!caseId) return sendJson(response, 400, { error: "Missing case id" });
    await assertCaseAccess(user, caseId);
    return sendJson(response, 200, await listAssets(caseId));
  }

  if (request.method === "POST") {
    const body = await readBody(request);
    const targetCase = String(body.caseId || caseId || "").trim();
    if (!targetCase) return sendJson(response, 400, { error: "Missing case id" });
    await assertCaseAccess(user, targetCase);
    const id = safeToken(body.id || crypto.randomUUID());
    const previous = (await store.getJson(assetKey(targetCase, id))) || {};
    const submitted = Object.assign({}, body);
    delete submitted.file;
    const record = Object.assign({}, previous, submitted, {
      schemaVersion: 1,
      id: id,
      caseId: targetCase,
      ownerId: previous.ownerId || user.userId,
      type: safeToken(body.type || previous.type || "record"),
      status: ALLOWED_STATUS.includes(body.status) ? body.status : (previous.status || "draft"),
      createdAt: previous.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      modifiedBy: user.userId
    });
    await store.setJson(assetKey(targetCase, id), record);
    await store.addToIndex(indexKey(targetCase), id);
    return sendJson(response, 200, record);
  }

  return false;
});

module.exports.listAssets = listAssets;
module.exports.indexKey = indexKey;
module.exports.assetKey = assetKey;
module.exports.assertCaseAccess = assertCaseAccess;
