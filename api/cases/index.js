const { sendJson, readBody, handler } = require("../_lib/http");
const { canAccessCase } = require("../_lib/auth");
const store = require("../_lib/store");

const GLOBAL_INDEX = "arc:cases:index";
const caseKey = function (id) { return "arc:case:" + id; };
const userIndexKey = function (userId) { return "arc:cases:index:" + userId; };

module.exports = handler(async function (request, response) {
  const user = request.user;
  if (!user) return sendJson(response, 401, { error: "Unauthorized" });

  if (request.method === "GET") {
    const ids = await store.readIndex(userIndexKey(user.userId));
    const caseKeys = ids.map(caseKey);
    const caseObjects = await store.batchGetJson(caseKeys);
    const cases = [];
    for (let index = 0; index < caseObjects.length; index += 1) {
      const data = caseObjects[index];
      if (!data) continue;
      if (!canAccessCase(user, data)) continue;
      cases.push({
        id: data.id || ids[index],
        name: data.name || (data.meta && data.meta.caseName) || "Untitled",
        docket: data.docket || (data.meta && data.meta.docket) || "",
        ownerId: data.ownerId || null,
        updatedAt: data.updatedAt || data.createdAt || null
      });
    }
    return sendJson(response, 200, cases);
  }

  if (request.method === "POST") {
    const body = await readBody(request);
    const submittedId = String(body.id || "").replace(/[^a-zA-Z0-9_-]/g, "");
    const id = submittedId || (require("crypto").randomUUID());
    const previous = (await store.getJson(caseKey(id))) || {};

    if (previous.ownerId && previous.ownerId !== user.userId && user.role !== "admin") {
      return sendJson(response, 403, { error: "Access denied" });
    }

    const payload = Object.assign({}, previous, body, {
      id: id,
      ownerId: previous.ownerId || user.userId,
      createdAt: previous.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      modifiedBy: user.userId
    });
    await store.setJson(caseKey(id), payload);
    await store.addToIndex(userIndexKey(user.userId), id);
    await store.addToIndex(GLOBAL_INDEX, id);
    return sendJson(response, 200, payload);
  }

  return false;
});
