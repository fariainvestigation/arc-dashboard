/**
 * Smoke test for the serverless API handlers in ./api.
 * Runs the handlers behind a plain Node http server, exercising the same
 * routing shape Vercel uses (file-based routes + [id] params).
 */
const http = require("http");
const path = require("path");
const fs = require("fs");
const os = require("os");

const root = path.resolve(__dirname, "..");
const tempDatabase = fs.mkdtempSync(path.join(os.tmpdir(), "arc-smoke-"));
process.env.ARC_SMOKE_DB = tempDatabase;

const routes = [
  [/^\/api\/health$/, "api/health.js"],
  [/^\/api\/cases$/, "api/cases/index.js"],
  [/^\/api\/cases\/[^/]+$/, "api/cases/[id].js"],
  [/^\/api\/report-assets$/, "api/report-assets/index.js"],
  [/^\/api\/report-assets\/manifest$/, "api/report-assets/manifest.js"],
  [/^\/api\/report-assets\/files\/[^/]+$/, "api/report-assets/files/[id].js"],
  [/^\/api\/report-assets\/[^/]+$/, "api/report-assets/[id].js"]
];

function resolveHandler(pathname) {
  for (const [pattern, file] of routes) {
    if (pattern.test(pathname)) return require(path.join(root, file));
  }
  return null;
}

const server = http.createServer(function (request, response) {
  const url = new URL(request.url, "http://127.0.0.1");
  const handler = resolveHandler(url.pathname);
  if (!handler) {
    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "Not found" }));
    return;
  }
  handler(request, response);
});

function assert(condition, message) {
  if (!condition) throw new Error("Assertion failed: " + message);
}

async function main() {
  await new Promise(function (resolve) { server.listen(0, "127.0.0.1", resolve); });
  const base = "http://127.0.0.1:" + server.address().port;
  const results = {};

  const health = await (await fetch(base + "/api/health")).json();
  assert(health.status === "ok", "health status");
  results.storageMode = health.storage.mode;

  const created = await (await fetch(base + "/api/cases", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Smoke Matter", docket: "SMOKE-0001" })
  })).json();
  assert(created.id, "case id created");
  results.caseId = created.id;

  const list = await (await fetch(base + "/api/cases")).json();
  assert(list.some(function (item) { return item.id === created.id; }), "case appears in list");

  const fetched = await (await fetch(base + "/api/cases/" + created.id)).json();
  assert(fetched.docket === "SMOKE-0001", "case round trip");

  const asset = await (await fetch(base + "/api/report-assets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      caseId: created.id,
      id: "picture_smoke",
      type: "picture",
      title: "Smoke exhibit",
      status: "approved",
      selectedForFinal: true,
      reportOrder: 1
    })
  })).json();
  assert(asset.id === "picture_smoke", "asset saved");

  const payload = Buffer.from("ARC serverless upload smoke test\n");
  const upload = await (await fetch(
    base + "/api/report-assets/files/picture_smoke?caseId=" + encodeURIComponent(created.id) + "&filename=smoke.txt",
    { method: "PUT", headers: { "Content-Type": "text/plain" }, body: payload }
  )).json();
  assert(upload.sha256 && upload.size === payload.length, "upload hashed and sized");
  results.sha256 = upload.sha256;

  const download = await fetch(
    base + "/api/report-assets/files/picture_smoke?caseId=" + encodeURIComponent(created.id)
  );
  const downloaded = Buffer.from(await download.arrayBuffer());
  assert(downloaded.equals(payload), "download matches upload");

  const manifest = await (await fetch(
    base + "/api/report-assets/manifest?caseId=" + encodeURIComponent(created.id)
  )).json();
  assert(manifest.records.length === 1, "manifest includes approved asset");

  const otherCaseAssets = await (await fetch(base + "/api/report-assets?caseId=other-case")).json();
  assert(otherCaseAssets.length === 0, "cross-case isolation");

  const deleted = await (await fetch(
    base + "/api/report-assets/picture_smoke?caseId=" + encodeURIComponent(created.id),
    { method: "DELETE" }
  )).json();
  assert(deleted.deleted === true, "asset deleted");

  await fetch(base + "/api/cases/" + created.id, { method: "DELETE" });
  const missing = await fetch(base + "/api/cases/" + created.id);
  assert(missing.status === 404, "case removed");

  results.status = "passed";
  console.log(JSON.stringify(results));
  server.close();
}

main().catch(function (error) {
  console.error(error);
  server.close();
  process.exit(1);
});
