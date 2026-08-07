const crypto = require("crypto");
const { sendJson, readBody, query, handler } = require("./_lib/http");
const { canAccessCase } = require("./_lib/auth");
const store = require("./_lib/store");

const caseKey = function (id) { return "arc:case:" + id; };
const workspaceKey = function (caseId) { return "arc:investigation-workspace:" + caseId; };
const MAX_ITEMS = 500;

function clean(value, max) {
  const output = String(value == null ? "" : value).trim();
  return max ? output.slice(0, max) : output;
}

function normalizeId(value) {
  return clean(value, 180).replace(/[^a-zA-Z0-9_-]/g, "");
}

async function assertCaseAccess(user, caseId) {
  const data = await store.getJson(caseKey(caseId));
  if (!data) {
    if (String(process.env.ARC_ALLOW_LEGACY_CASES || "").trim() === "1") return { id: caseId, ownerId: user.userId };
    const error = new Error("Case not found");
    error.statusCode = 404;
    throw error;
  }
  if (!canAccessCase(user, data)) {
    const error = new Error("Access denied");
    error.statusCode = 403;
    throw error;
  }
  return data;
}

function normalizeRecord(value, type) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.assign({}, source, {
    id: clean(source.id, 180) || type + "_" + crypto.randomUUID(),
    title: clean(source.title || source.name || "Untitled", 300),
    name: clean(source.name || source.title || "Untitled", 300),
    type: clean(source.type || source.kind || type, 120),
    status: clean(source.status || source.approvalStatus || "suggested", 80),
    approvalStatus: clean(source.approvalStatus || source.status || "suggested", 80),
    priority: clean(source.priority || "Medium", 40),
    date: clean(source.date || "Not Listed", 80) || "Not Listed",
    time: clean(source.time || "Not Listed", 80) || "Not Listed",
    details: clean(source.details || source.text || "", 50000),
    sourceId: clean(source.sourceId, 180),
    sourceIds: Array.isArray(source.sourceIds) ? source.sourceIds.slice(0, 100).map(function (item) { return clean(item, 180); }).filter(Boolean) : [],
    sourceTitle: clean(source.sourceTitle, 300),
    citation: clean(source.citation || "Not Listed", 1000) || "Not Listed",
    citations: Array.isArray(source.citations) ? source.citations.slice(0, 100).map(function (item) { return clean(item, 1000); }).filter(Boolean) : [],
    basis: Array.isArray(source.basis) ? source.basis.slice(0, 20).map(function (item) { return clean(item, 1000); }).filter(Boolean) : [],
    factType: clean(source.factType || "investigative suggestion", 120),
    approvalRequired: source.approvalRequired !== false
  });
}

function normalizeSource(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    id: clean(source.id, 180) || "source_" + crypto.randomUUID(),
    kind: clean(source.kind || "record", 80),
    title: clean(source.title || "Untitled source", 300),
    citation: clean(source.citation || "Not Listed", 1000) || "Not Listed",
    sourceType: clean(source.sourceType || source.type || "Not Listed", 120),
    status: clean(source.status || "available", 80),
    text: clean(source.text, 50000),
    originalMetadata: source.originalMetadata && typeof source.originalMetadata === "object" ? source.originalMetadata : {}
  };
}

function normalizeWorkspace(body, caseId, previous, user) {
  const source = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  return {
    schema: "arc-investigation-development",
    schemaVersion: 1,
    id: previous.id || "investigation_" + crypto.randomUUID(),
    caseId: caseId,
    sources: Array.isArray(source.sources) ? source.sources.slice(0, MAX_ITEMS).map(normalizeSource) : [],
    entities: Array.isArray(source.entities) ? source.entities.slice(0, MAX_ITEMS).map(function (item) { return normalizeRecord(item, "entity"); }) : [],
    events: Array.isArray(source.events) ? source.events.slice(0, MAX_ITEMS).map(function (item) { return normalizeRecord(item, "event"); }) : [],
    leads: Array.isArray(source.leads) ? source.leads.slice(0, MAX_ITEMS).map(function (item) { return normalizeRecord(item, "lead"); }) : [],
    issues: Array.isArray(source.issues) ? source.issues.slice(0, MAX_ITEMS).map(function (item) { return normalizeRecord(item, "issue"); }) : [],
    tasks: Array.isArray(source.tasks) ? source.tasks.slice(0, MAX_ITEMS).map(function (item) { return normalizeRecord(item, "task"); }) : [],
    rejectedSuggestions: Array.isArray(source.rejectedSuggestions) ? source.rejectedSuggestions.slice(0, MAX_ITEMS).map(function (item) { return normalizeRecord(item, "rejected"); }) : [],
    generatedAt: clean(source.generatedAt, 80) || previous.generatedAt || null,
    createdAt: previous.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    savedAt: new Date().toISOString(),
    modifiedBy: user.userId,
    ownerId: previous.ownerId || user.userId
  };
}

module.exports = handler(async function (request, response) {
  const user = request.user;
  if (!user) return sendJson(response, 401, { error: "Unauthorized" });
  const rawCaseId = query(request, "caseId");
  const caseId = normalizeId(rawCaseId);
  if (!caseId) return sendJson(response, 400, { error: "Missing case id" });

  await assertCaseAccess(user, caseId);

  if (request.method === "GET") {
    const data = await store.getJson(workspaceKey(caseId));
    return sendJson(response, 200, data || {
      schema: "arc-investigation-development",
      schemaVersion: 1,
      caseId: caseId,
      sources: [],
      entities: [],
      events: [],
      leads: [],
      issues: [],
      tasks: [],
      rejectedSuggestions: []
    });
  }

  if (request.method === "PUT" || request.method === "POST") {
    const body = await readBody(request);
    const previous = (await store.getJson(workspaceKey(caseId))) || {};
    const payload = normalizeWorkspace(body, caseId, previous, user);
    await store.setJson(workspaceKey(caseId), payload);
    return sendJson(response, 200, payload);
  }

  return false;
});
