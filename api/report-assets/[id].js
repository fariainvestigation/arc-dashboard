const { sendJson, query, safeToken, handler } = require("../_lib/http");
const store = require("../_lib/store");
const { assertCaseAccess } = require("./index");

function indexKey(caseId) { return "arc:assets:index:" + caseId; }
function assetKey(caseId, id) { return "arc:asset:" + caseId + ":" + id; }
function blobKey(caseId, id) { return "arc:assetfile:" + caseId + ":" + id; }

function assetIdFrom(request) {
  const url = new URL(request.url, "http://localhost");
  const fromQuery = url.searchParams.get("id");
  const fromPath = url.pathname.split("/").filter(Boolean).pop();
  return safeToken(fromQuery || fromPath || "");
}

module.exports = handler(async function (request, response) {
  const user = request.user;
  if (!user) return sendJson(response, 401, { error: "Unauthorized" });

  const caseId = query(request, "caseId");
  const id = assetIdFrom(request);
  if (!caseId || !id) return sendJson(response, 400, { error: "Missing case or asset id" });
  await assertCaseAccess(user, caseId);

  if (request.method === "GET") {
    const record = await store.getJson(assetKey(caseId, id));
    if (!record) return sendJson(response, 404, { error: "Report asset not found" });
    return sendJson(response, 200, record);
  }

  if (request.method === "DELETE") {
    const record = await store.getJson(assetKey(caseId, id));
    if (!record) return sendJson(response, 404, { error: "Report asset not found" });
    await store.delKey(blobKey(caseId, id));
    await store.delKey(assetKey(caseId, id));
    await store.removeFromIndex(indexKey(caseId), id);
    return sendJson(response, 200, { deleted: true, id: id, caseId: caseId });
  }

  return false;
});
