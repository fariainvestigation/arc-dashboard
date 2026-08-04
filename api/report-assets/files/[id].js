const crypto = require("crypto");
const { sendJson, query, safeToken, readRaw, handler } = require("../../_lib/http");
const store = require("../../_lib/store");
const { assertCaseAccess } = require("../index");

/**
 * Serverless upload limit. Vercel request bodies are capped around 4.5 MB, so
 * larger evidence files must be handled by the local server (npm run serve) or
 * an external object store. Keep this under the platform limit.
 */
const MAX_UPLOAD_BYTES = Number(process.env.ARC_MAX_UPLOAD_BYTES || 4 * 1024 * 1024);

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
  const assetId = assetIdFrom(request);
  if (!caseId || !assetId) return sendJson(response, 400, { error: "Missing case or asset id" });
  await assertCaseAccess(user, caseId);

  if (request.method === "PUT") {
    const filename = query(request, "filename") || "upload.bin";
    const declared = Number(request.headers["content-length"] || 0);
    if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES) {
      return sendJson(response, 413, {
        error: "Upload exceeds the hosted size limit. Use the local server for large evidence files."
      });
    }
    const buffer = await readRaw(request);
    if (buffer.length > MAX_UPLOAD_BYTES) {
      return sendJson(response, 413, {
        error: "Upload exceeds the hosted size limit. Use the local server for large evidence files."
      });
    }
    const file = {
      name: String(filename).slice(0, 240),
      storedName: safeToken(assetId) + "-" + safeToken(filename, "upload.bin"),
      relativePath: "kv://" + caseId + "/" + assetId,
      size: buffer.length,
      type: String(request.headers["content-type"] || "application/octet-stream").slice(0, 160),
      sha256: crypto.createHash("sha256").update(buffer).digest("hex")
    };
    await store.setJson(blobKey(caseId, assetId), {
      encoding: "base64",
      type: file.type,
      name: file.name,
      data: buffer.toString("base64")
    });
    const previous = (await store.getJson(assetKey(caseId, assetId))) || {};
    const record = Object.assign({}, previous, {
      schemaVersion: 1,
      id: assetId,
      caseId: caseId,
      type: previous.type || "record",
      title: previous.title || file.name,
      status: previous.status || "draft",
      file: file,
      createdAt: previous.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    await store.setJson(assetKey(caseId, assetId), record);
    await store.addToIndex(indexKey(caseId), assetId);
    return sendJson(response, 200, file);
  }

  if (request.method === "GET") {
    const record = await store.getJson(assetKey(caseId, assetId));
    if (!record || record.status === "archived") {
      return sendJson(response, 404, { error: "Report asset not found" });
    }
    const blob = await store.getJson(blobKey(caseId, assetId));
    if (!blob || !blob.data) return sendJson(response, 404, { error: "Uploaded file not found" });
    const buffer = Buffer.from(blob.data, "base64");
    let contentType = blob.type || "application/octet-stream";
    const headers = {
      "Content-Type": contentType,
      "Content-Length": buffer.length,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff"
    };
    if (/^text\/html\b/i.test(contentType) || /\.html?$/i.test(blob.name || "")) {
      headers["Content-Type"] = "application/octet-stream";
      headers["Content-Disposition"] =
        'attachment; filename="' + safeToken(blob.name || "download.html", "download.html") + '"';
    }
    response.writeHead(200, headers);
    response.end(buffer);
    return true;
  }

  return false;
});

module.exports.config = { api: { bodyParser: false } };
