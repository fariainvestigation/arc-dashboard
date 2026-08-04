const assert = require("assert");
const path = require("path");
const { spawn } = require("child_process");

const explicitBase = process.env.ARC_BASE_URL || "";
const testPort = Number(process.env.ARC_TEST_PORT || 18000 + process.pid % 20000);
const base = explicitBase || "http://127.0.0.1:" + testPort;
const caseId = "ARC-RELEASE-SMOKE";
const otherCaseId = "ARC-RELEASE-SMOKE-OTHER";
const id = "picture_release_smoke";
const oversizedId = "picture_release_oversized";
let localServer = null;

async function healthReady() {
  try {
    const response = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(800) });
    return response.ok;
  } catch (error) {
    return false;
  }
}

async function ensureServer() {
  if (await healthReady()) return;
  if (explicitBase) throw new Error(`ARC_BASE_URL is not reachable: ${base}`);
  const port = new URL(base).port || "8777";
  localServer = spawn(process.execPath, [path.join(__dirname, "serve.js")], {
    env: Object.assign({}, process.env, { PORT: port, ARC_MAX_UPLOAD_BYTES: "64" }),
    stdio: "ignore"
  });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (await healthReady()) return;
    if (localServer.exitCode != null) break;
  }
  throw new Error("ARC test server did not become ready");
}

async function json(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `${response.status} ${response.statusText}`);
  return payload;
}

async function run() {
  await ensureServer();
  const health = await json(await fetch(`${base}/api/health`));
  assert.equal(health.reportAssets, true, "report asset API must be enabled");
  let cleanupRequired = false;
  let otherCleanupRequired = false;
  try {
    const saved = await json(await fetch(`${base}/api/report-assets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        caseId,
        type: "picture",
        title: "Release smoke asset",
        description: "Automated non-case test",
        status: "approved",
        selectedForFinal: true,
        reportOrder: 1
      })
    }));
    cleanupRequired = true;
    assert.equal(saved.id, id);

    const content = Buffer.from("ARC report asset range verification", "utf8");
    const uploaded = await json(await fetch(`${base}/api/report-assets/files/${id}?caseId=${caseId}&filename=smoke.txt`, {
      method: "PUT",
      headers: { "Content-Type": "text/plain" },
      body: content
    }));
    assert.equal(uploaded.size, content.length);
    assert.match(uploaded.sha256, /^[a-f0-9]{64}$/);

    const range = await fetch(`${base}/api/report-assets/files/${id}?caseId=${caseId}`, {
      headers: { Range: "bytes=0-2" }
    });
    assert.equal(range.status, 206);
    assert.equal(await range.text(), "ARC");

    const suffix = await fetch(`${base}/api/report-assets/files/${id}?caseId=${caseId}`, {
      headers: { Range: "bytes=-5" }
    });
    assert.equal(suffix.status, 206, "suffix byte range must be accepted");
    assert.equal(suffix.headers.get("content-range"), `bytes ${content.length - 5}-${content.length - 1}/${content.length}`);
    assert(Buffer.from(await suffix.arrayBuffer()).equals(content.subarray(content.length - 5)), "suffix byte range must return the final bytes");

    const invalidRange = await fetch(`${base}/api/report-assets/files/${id}?caseId=${caseId}`, {
      headers: { Range: "bytes=99-100" }
    });
    assert.equal(invalidRange.status, 416, "unsatisfiable byte range must be rejected");

    const crossCase = await json(await fetch(`${base}/api/report-assets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caseId: otherCaseId, id, type: "picture", status: "approved", file: uploaded })
    }));
    otherCleanupRequired = true;
    assert.equal(crossCase.file, undefined, "client-supplied file metadata must be ignored");
    const crossCaseFile = await fetch(`${base}/api/report-assets/files/${id}?caseId=${otherCaseId}`);
    assert.equal(crossCaseFile.status, 404, "one case must not read another case's uploaded file");

    const slashCaseId = "CASE/A";
    const dashCaseId = "CASE-A";
    const collisionId = "picture_collision_probe";
    const slashUpload = await json(await fetch(`${base}/api/report-assets/files/${collisionId}?caseId=${encodeURIComponent(slashCaseId)}&filename=slash.txt`, {
      method: "PUT",
      headers: { "Content-Type": "text/plain" },
      body: Buffer.from("slash-case", "utf8")
    }));
    const dashUpload = await json(await fetch(`${base}/api/report-assets/files/${collisionId}?caseId=${encodeURIComponent(dashCaseId)}&filename=dash.txt`, {
      method: "PUT",
      headers: { "Content-Type": "text/plain" },
      body: Buffer.from("dash-case", "utf8")
    }));
    assert.notEqual(slashUpload.relativePath, dashUpload.relativePath, "sanitized case ids must not share an upload path");
    const slashBody = await (await fetch(`${base}/api/report-assets/files/${collisionId}?caseId=${encodeURIComponent(slashCaseId)}`)).text();
    const dashBody = await (await fetch(`${base}/api/report-assets/files/${collisionId}?caseId=${encodeURIComponent(dashCaseId)}`)).text();
    assert.equal(slashBody, "slash-case");
    assert.equal(dashBody, "dash-case");
    await fetch(`${base}/api/report-assets/${collisionId}?caseId=${encodeURIComponent(slashCaseId)}`, { method: "DELETE" }).catch(() => {});
    await fetch(`${base}/api/report-assets/${collisionId}?caseId=${encodeURIComponent(dashCaseId)}`, { method: "DELETE" }).catch(() => {});

    const htmlUpload = await json(await fetch(`${base}/api/report-assets/files/${id}?caseId=${caseId}&filename=probe.html`, {
      method: "PUT",
      headers: { "Content-Type": "text/html" },
      body: Buffer.from("<script>window.pwned=1</script>", "utf8")
    }));
    const htmlGet = await fetch(`${base}/api/report-assets/files/${id}?caseId=${caseId}`);
    assert.match(String(htmlGet.headers.get("content-disposition") || ""), /attachment/i, "html uploads must force download");
    assert.match(String(htmlGet.headers.get("content-type") || ""), /octet-stream/i, "html uploads must not execute as text/html");
    assert.ok(htmlUpload.relativePath);
    const oversized = await fetch(`${base}/api/report-assets/files/${oversizedId}?caseId=${caseId}&filename=oversized.bin`, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: Buffer.alloc(65, 1)
    });
    assert.equal(oversized.status, 413, "oversized upload must return 413");

    const directDatabase = await fetch(`${base}/database/report-assets/index.json`);
    assert.equal(directDatabase.status, 404, "runtime database must not be served statically");
    const directUpload = await fetch(`${base}/${uploaded.relativePath}`);
    assert.equal(directUpload.status, 404, "uploaded evidence must not be served statically");
    const dotfile = await fetch(`${base}/.gitignore`);
    assert.equal(dotfile.status, 404, "repository dotfiles must not be served statically");

    const manifest = await json(await fetch(`${base}/api/report-assets/manifest?caseId=${caseId}`));
    assert.equal(manifest.schema, "arc-final-report-manifest");
    assert.equal(manifest.records.length, 1);
    assert.equal(manifest.records[0].id, id);

    const removed = await json(await fetch(`${base}/api/report-assets/${id}?caseId=${caseId}`, { method: "DELETE" }));
    cleanupRequired = false;
    assert.equal(removed.deleted, true);
    const afterDelete = await json(await fetch(`${base}/api/report-assets/manifest?caseId=${caseId}`));
    assert.equal(afterDelete.records.length, 0, "smoke record must be removed after the test");

    const removedOther = await json(await fetch(`${base}/api/report-assets/${id}?caseId=${otherCaseId}`, { method: "DELETE" }));
    otherCleanupRequired = false;
    assert.equal(removedOther.deleted, true, "cross-case probe record cleanup failed");

    console.log(JSON.stringify({
      status: "passed",
      savedId: saved.id,
      bytes: uploaded.size,
      sha256: uploaded.sha256,
      rangeStatus: range.status,
      suffixRangeStatus: suffix.status,
      protectedStaticPaths: true,
      crossCaseIsolation: true,
      oversizedUploadStatus: oversized.status,
      cleanup: true
    }));
  } finally {
    if (cleanupRequired) {
      await fetch(`${base}/api/report-assets/${id}?caseId=${caseId}`, { method: "DELETE" }).catch(() => {});
    }
    if (otherCleanupRequired) {
      await fetch(`${base}/api/report-assets/${id}?caseId=${otherCaseId}`, { method: "DELETE" }).catch(() => {});
    }
    if (localServer) localServer.kill();
  }
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
