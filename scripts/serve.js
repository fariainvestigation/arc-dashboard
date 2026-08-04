const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const root = path.resolve(__dirname, "..");

function loadEnvFile() {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index < 1) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile();

const dataDir = path.join(root, "database");
const reportAssetDir = path.join(dataDir, "report-assets");
const reportAssetIndex = path.join(reportAssetDir, "index.json");
const uploadDir = path.join(root, "uploads", "report-assets");
const { accessDenied } = require("../api/_lib/http");
const boardCommand = require("../api/gemini-board-command");
const authSession = require("../api/auth/session");
const authLogin = require("../api/auth/login");
const authLogout = require("../api/auth/logout");
const aiExtract = require("../api/ai/extract");
const health = require("../api/health");
const casesIndex = require("../api/cases/index");
const casesId = require("../api/cases/[id]");
const reportAssetsIndex = require("../api/report-assets/index");
const reportAssetsId = require("../api/report-assets/[id]");
const reportAssetsManifest = require("../api/report-assets/manifest");
const reportAssetsFiles = require("../api/report-assets/files/[id]");
const geocodingSearch = require("../api/geocoding/search");
const routingRoute = require("../api/routing/route");
const auditLog = require("../api/audit-log/index");
const auditLogBatch = require("../api/audit-log/batch");
const reportApprovals = require("../api/report-approvals");

function positiveInteger(name, value, fallback, maximum) {
  const parsed = value == null || value === "" ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || (maximum && parsed > maximum)) {
    throw new Error(name + " must be a positive integer" + (maximum ? " no greater than " + maximum : ""));
  }
  return parsed;
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

const maxUploadBytes = positiveInteger("ARC_MAX_UPLOAD_BYTES", process.env.ARC_MAX_UPLOAD_BYTES, 2 * 1024 * 1024 * 1024);
const port = positiveInteger("PORT", process.env.PORT, 8777, 65535);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8"
};

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(reportAssetDir)) fs.mkdirSync(reportAssetDir, { recursive: true });
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

function safeToken(value, fallback) {
  return String(value || fallback || "item").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 180) || "item";
}

function caseStorageToken(caseId) {
  const raw = String(caseId || "").trim();
  const digest = crypto.createHash("sha256").update(raw || "item").digest("hex").slice(0, 16);
  return safeToken(raw) + "__" + digest;
}

function caseUploadFolder(caseId) {
  return path.join(uploadDir, caseStorageToken(caseId));
}

function readReportAssets() {
  if (!fs.existsSync(reportAssetIndex)) return [];
  try {
    const value = JSON.parse(fs.readFileSync(reportAssetIndex, "utf8"));
    return Array.isArray(value) ? value : [];
  } catch (error) {
    throw new Error("Report asset index is invalid");
  }
}

function writeReportAssets(items) {
  const temporary = reportAssetIndex + ".tmp";
  fs.writeFileSync(temporary, JSON.stringify(items, null, 2));
  fs.renameSync(temporary, reportAssetIndex);
}

function reportAssetFor(caseId, assetId) {
  return readReportAssets().find(function (item) {
    return item.caseId === caseId && item.id === assetId && item.status !== "archived";
  });
}

function streamAssetUpload(request, caseId, assetId, filename, contentType) {
  return new Promise(function (resolve, reject) {
    const declaredLength = Number(request.headers["content-length"] || 0);
    if (Number.isFinite(declaredLength) && declaredLength > maxUploadBytes) {
      request.resume();
      reject(httpError(413, "Upload exceeds the configured size limit"));
      return;
    }
    const caseFolder = caseUploadFolder(caseId);
    fs.mkdirSync(caseFolder, { recursive: true });
    const storedName = safeToken(assetId) + "-" + safeToken(filename, "upload.bin");
    const target = path.join(caseFolder, storedName);
    const temporary = target + "." + crypto.randomBytes(8).toString("hex") + ".upload";
    const hash = crypto.createHash("sha256");
    const output = fs.createWriteStream(temporary, { flags: "wx" });
    let size = 0;
    let settled = false;

    function finish(error, payload) {
      if (settled) return;
      settled = true;
      if (error) {
        request.unpipe(output);
        output.destroy();
        output.once("close", function () {
          try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch (cleanupError) {}
        });
        request.resume();
        reject(error);
      } else {
        resolve(payload);
      }
    }

    request.on("data", function (chunk) {
      size += chunk.length;
      if (size > maxUploadBytes) {
        finish(httpError(413, "Upload exceeds the configured size limit"));
        return;
      }
      hash.update(chunk);
    });
    request.on("error", finish);
    output.on("error", finish);
    output.on("finish", function () {
      if (settled) return;
      try {
        fs.renameSync(temporary, target);
      } catch (renameError) {
        finish(renameError);
        return;
      }
      finish(null, {
        name: String(filename || "upload.bin").slice(0, 240),
        storedName: storedName,
        relativePath: path.relative(root, target).replace(/\\/g, "/"),
        size: size,
        type: String(contentType || "application/octet-stream").slice(0, 160),
        sha256: hash.digest("hex")
      });
    });
    request.pipe(output);
  });
}

function sendReportAssetFile(request, response, asset) {
  const relativePath = asset && asset.file && asset.file.relativePath;
  const target = relativePath ? path.resolve(root, relativePath) : "";
  const caseFolder = caseUploadFolder(asset && asset.caseId);
  const legacyFolder = path.join(uploadDir, safeToken(asset && asset.caseId));
  const underCase =
    target &&
    (target.startsWith(caseFolder + path.sep) || target.startsWith(legacyFolder + path.sep));
  if (!underCase || !fs.existsSync(target)) {
    return sendJson(response, 404, { error: "Uploaded file not found" });
  }
  const stat = fs.statSync(target);
  const range = String(request.headers.range || "").match(/^bytes=(\d*)-(\d*)$/);
  const contentType = asset.file.type || "application/octet-stream";
  const headers = {
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff"
  };
  if (/^text\/html\b/i.test(contentType) || /\.html?$/i.test(asset.file.name || relativePath || "")) {
    headers["Content-Disposition"] = 'attachment; filename="' + safeToken(asset.file.name || "download.html", "download.html") + '"';
    headers["Content-Type"] = "application/octet-stream";
  }
  if (range) {
    const suffixLength = !range[1] && range[2] ? Number(range[2]) : 0;
    const start = suffixLength ? Math.max(stat.size - suffixLength, 0) : Number(range[1] || 0);
    const end = suffixLength ? stat.size - 1 : (range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || !stat.size || start < 0 || end < start || start >= stat.size) {
      response.writeHead(416, { "Content-Range": "bytes */" + stat.size });
      response.end();
      return true;
    }
    headers["Content-Range"] = "bytes " + start + "-" + end + "/" + stat.size;
    headers["Content-Length"] = end - start + 1;
    response.writeHead(206, headers);
    fs.createReadStream(target, { start: start, end: end }).pipe(response);
    return true;
  }
  headers["Content-Length"] = stat.size;
  response.writeHead(200, headers);
  fs.createReadStream(target).pipe(response);
  return true;
}

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(body);
}

function readBody(request) {
  return new Promise(function (resolve, reject) {
    const chunks = [];
    let size = 0;
    request.on("data", function (chunk) {
      size += chunk.length;
      if (size > 50 * 1024 * 1024) {
        reject(new Error("Payload too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", function () {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch (error) { reject(new Error("Invalid JSON body")); }
    });
    request.on("error", reject);
  });
}

function serveStatic(pathname, response) {
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const segments = relative.split(/[\\/]+/).filter(Boolean);
  const protectedPath = segments.some(function (segment) { return segment.startsWith("."); }) ||
    ["database", "uploads"].includes(String(segments[0] || "").toLowerCase()) ||
    /(?:^|[\\/])[^\\/]+\.(?:upload|tmp)$/i.test(relative);
  if (protectedPath) {
    response.writeHead(404, { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    response.end("Not found");
    return;
  }
  let target = path.resolve(root, relative);
  if (target !== root && !target.startsWith(root + path.sep)) {
    response.writeHead(403); response.end("Forbidden"); return;
  }
  fs.stat(target, function (statError, stat) {
    if (statError) { response.writeHead(404); response.end("Not found"); return; }
    if (stat.isDirectory()) target = path.join(target, "index.html");
    fs.stat(target, function (fileError, fileStat) {
      if (fileError || !fileStat.isFile()) { response.writeHead(404); response.end("Not found"); return; }
      response.writeHead(200, {
        "Content-Type": types[path.extname(target).toLowerCase()] || "application/octet-stream",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
      });
      fs.createReadStream(target).pipe(response);
    });
  });
}

async function handleApi(request, response, url) {
  const pathname = url.pathname;

  // Shared serverless handlers so local and Vercel auth/ownership match.
  if (pathname === "/api/health") return health(request, response);
  if (pathname === "/api/auth/login") return authLogin(request, response);
  if (pathname === "/api/auth/logout") return authLogout(request, response);
  if (pathname === "/api/auth/session") return authSession(request, response);
  if (pathname === "/api/gemini-board-command") return boardCommand(request, response);
  if (pathname === "/api/ai/extract") return aiExtract(request, response);
  if (pathname === "/api/geocoding/search") return geocodingSearch(request, response);
  if (pathname === "/api/routing/route") return routingRoute(request, response);
  if (pathname === "/api/cases") return casesIndex(request, response);
  if (pathname.startsWith("/api/cases/")) return casesId(request, response);
  if (pathname === "/api/report-assets") return reportAssetsIndex(request, response);
  if (pathname === "/api/report-assets/manifest") return reportAssetsManifest(request, response);
  if (pathname.startsWith("/api/report-assets/files/")) return reportAssetsFiles(request, response);
  if (pathname.startsWith("/api/report-assets/")) return reportAssetsId(request, response);
  if (pathname === "/api/audit-log/batch") return auditLogBatch(request, response);
  if (pathname === "/api/audit-log") return auditLog(request, response);
  if (pathname === "/api/report-approvals") return reportApprovals(request, response);

  return false;
}

const server = http.createServer(async function (request, response) {
  let url;
  try { url = new URL(request.url, "http://127.0.0.1"); }
  catch (error) { response.writeHead(400); response.end("Bad request"); return; }

  if (url.pathname.startsWith("/api/")) {
    try {
      const handled = await handleApi(request, response, url);
      if (handled === false) sendJson(response, 404, { error: "Not found" });
    } catch (error) {
      console.error(error);
      if (!response.headersSent && !response.destroyed) {
        const status = Number.isInteger(error.statusCode) && error.statusCode >= 400 && error.statusCode <= 599 ? error.statusCode : 500;
        sendJson(response, status, { error: error.message || "Server error" });
      }
    }
    return;
  }

  serveStatic(url.pathname, response);
});

server.listen(port, "127.0.0.1", function () {
  console.log("ARC Integrated System: http://127.0.0.1:" + port + "/");
  console.log("Investigation Map: http://127.0.0.1:" + port + "/map/");
  console.log("Sign in: http://127.0.0.1:" + port + "/login.html");
});
