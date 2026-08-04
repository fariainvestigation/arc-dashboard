const crypto = require("crypto");
const { sendJson, readBody, query, handler } = require("./_lib/http");
const { canAccessCase } = require("./_lib/auth");
const store = require("./_lib/store");

function caseKey(id) { return "arc:case:" + id; }
function approvalKey(reportId) { return "arc:approval:" + reportId; }
function approvalIndexKey(caseId) { return "arc:case:" + caseId + ":approvals"; }
function auditKey(caseId) { return "arc:audit:" + caseId; }

async function loadOwnedCase(user, caseId) {
  const caseData = await store.getJson(caseKey(caseId));
  if (!caseData) {
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

module.exports = handler(async function (request, response) {
  const user = request.user;
  if (!user) return sendJson(response, 401, { error: "Unauthorized" });

  if (request.method === "POST") {
    const body = await readBody(request);
    const reportId = String(body.reportId || "").trim();
    const caseId = String(body.caseId || "").trim();
    const status = String(body.status || "").trim().toLowerCase();
    if (!reportId || !caseId) return sendJson(response, 400, { error: "reportId and caseId required" });
    if (!["approved", "rejected", "pending", "revised"].includes(status)) {
      return sendJson(response, 400, { error: "Invalid approval status" });
    }
    await loadOwnedCase(user, caseId);

    const approval = {
      id: crypto.randomUUID(),
      reportId: reportId,
      caseId: caseId,
      status: status,
      reviewerId: user.userId,
      reviewerEmail: user.email || null,
      notes: body.notes ? String(body.notes).slice(0, 4000) : "",
      timestamp: new Date().toISOString()
    };
    await store.setJson(approvalKey(reportId), approval);
    await store.addToIndex(approvalIndexKey(caseId), reportId);

    const logs = (await store.getJson(auditKey(caseId))) || [];
    logs.push({
      id: crypto.randomUUID(),
      timestamp: approval.timestamp,
      userId: user.userId,
      email: user.email || null,
      action: "report_" + status,
      caseId: caseId,
      reportId: reportId,
      details: { notes: approval.notes },
      synced: true
    });
    await store.setJson(auditKey(caseId), logs.slice(-5000));

    return sendJson(response, 200, approval);
  }

  if (request.method === "GET") {
    const caseId = query(request, "caseId");
    const reportId = query(request, "reportId");
    if (reportId) {
      const approval = await store.getJson(approvalKey(reportId));
      if (!approval) return sendJson(response, 404, { error: "Approval not found" });
      await loadOwnedCase(user, approval.caseId);
      return sendJson(response, 200, approval);
    }
    if (!caseId) return sendJson(response, 400, { error: "caseId required" });
    await loadOwnedCase(user, caseId);
    const reportIds = await store.readIndex(approvalIndexKey(caseId));
    const approvals = [];
    for (const id of reportIds) {
      const approval = await store.getJson(approvalKey(id));
      if (approval) approvals.push(approval);
    }
    return sendJson(response, 200, { caseId: caseId, approvals: approvals });
  }

  return false;
});
