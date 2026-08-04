const { sendJson, readBody, handler } = require("../_lib/http");
const { canAccessCase } = require("../_lib/auth");
const store = require("../_lib/store");

const GLOBAL_INDEX = "arc:cases:index";
const caseKey = function (id) { return "arc:case:" + id; };
const userIndexKey = function (userId) { return "arc:cases:index:" + userId; };

function caseIdFrom(request) {
  const url = new URL(request.url, "http://localhost");
  const fromQuery = url.searchParams.get("id");
  const fromPath = url.pathname.split("/").filter(Boolean).pop();
  return String(fromQuery || fromPath || "").replace(/[^a-zA-Z0-9_-]/g, "");
}

module.exports = handler(async function (request, response) {
  const user = request.user;
  if (!user) return sendJson(response, 401, { error: "Unauthorized" });

  const id = caseIdFrom(request);
  if (!id) return sendJson(response, 400, { error: "Missing case id" });

  if (request.method === "GET") {
    const data = await store.getJson(caseKey(id));
    if (!data) return sendJson(response, 404, { error: "Case not found" });
    if (!canAccessCase(user, data)) return sendJson(response, 403, { error: "Access denied" });
    return sendJson(response, 200, data);
  }

  if (request.method === "PUT" || request.method === "PATCH" || request.method === "POST") {
    const body = await readBody(request);
    const previous = (await store.getJson(caseKey(id))) || {};

    if (Object.keys(previous).length) {
      if (!canAccessCase(user, previous)) {
        return sendJson(response, 403, { error: "Access denied" });
      }
      // Optimistic locking (P2.2 foundation)
      if (body.updatedAt && previous.updatedAt && body.updatedAt !== previous.updatedAt) {
        return sendJson(response, 409, {
          error: "Case was modified. Your changes conflict.",
          conflict: {
            attemptedAt: body.updatedAt,
            currentUpdatedAt: previous.updatedAt,
            current: previous
          }
        });
      }
    }

    const payload = Object.assign({}, previous, body, {
      id: id,
      ownerId: previous.ownerId || user.userId,
      createdAt: previous.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      modifiedBy: user.userId
    });
    // Prevent ownership reassignment by non-admins
    if (user.role !== "admin") payload.ownerId = previous.ownerId || user.userId;

    await store.setJson(caseKey(id), payload);
    await store.addToIndex(userIndexKey(payload.ownerId), id);
    await store.addToIndex(GLOBAL_INDEX, id);
    return sendJson(response, 200, payload);
  }

  if (request.method === "DELETE") {
    const previous = await store.getJson(caseKey(id));
    if (!previous) return sendJson(response, 404, { error: "Case not found" });
    if (!canAccessCase(user, previous)) return sendJson(response, 403, { error: "Access denied" });
    await store.delKey(caseKey(id));
    await store.removeFromIndex(userIndexKey(previous.ownerId || user.userId), id);
    await store.removeFromIndex(GLOBAL_INDEX, id);
    return sendJson(response, 200, { deleted: true, id: id });
  }

  return false;
});
