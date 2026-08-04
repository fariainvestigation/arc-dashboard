const { sendJson, query, handler } = require("../_lib/http");
const store = require("../_lib/store");
const { listAssets, assertCaseAccess } = require("./index");

module.exports = handler(async function (request, response) {
  if (request.method !== "GET") return false;
  const user = request.user;
  if (!user) return sendJson(response, 401, { error: "Unauthorized" });
  const caseId = query(request, "caseId");
  if (!caseId) return sendJson(response, 400, { error: "Missing case id" });
  await assertCaseAccess(user, caseId);

  const selected = (await listAssets(caseId)).filter(function (item) {
    return item.selectedForFinal && ["approved", "included"].includes(item.status);
  });

  const approved = [];
  const unapproved = [];
  for (const asset of selected) {
    const serverApproval =
      (await store.getJson("arc:approval:asset:" + asset.id)) ||
      (await store.getJson("arc:approval:" + asset.id));
    const assetApproved =
      (serverApproval && serverApproval.status === "approved") ||
      asset.status === "approved" ||
      asset.status === "included";

    // Prefer explicit server approval records when present; otherwise require
    // the asset status itself to be approved/included and stamp reviewer.
    if (serverApproval && serverApproval.status !== "approved") {
      unapproved.push(asset);
      continue;
    }
    if (!assetApproved) {
      unapproved.push(asset);
      continue;
    }
    approved.push(Object.assign({}, asset, {
      approval: serverApproval
        ? {
            approvedBy: serverApproval.reviewerId || serverApproval.reviewerEmail,
            approvedAt: serverApproval.timestamp
          }
        : {
            approvedBy: asset.modifiedBy || user.userId,
            approvedAt: asset.updatedAt || asset.createdAt || null,
            source: "asset-status"
          }
    }));
  }

  if (unapproved.length > 0) {
    return sendJson(response, 409, {
      error: "Cannot include unapproved assets in final report",
      approved: approved.length,
      unapproved: unapproved.length,
      unapprovedAssets: unapproved.map(function (asset) {
        return { id: asset.id, title: asset.title || asset.name || asset.id, status: asset.status };
      }),
      message: "Unapproved assets: " + unapproved.map(function (a) {
        return a.title || a.name || a.id;
      }).join(", ")
    });
  }

  approved.sort(function (left, right) {
    return Number(left.reportOrder || 0) - Number(right.reportOrder || 0);
  });

  return sendJson(response, 200, {
    schema: "arc-final-report-manifest",
    schemaVersion: 2,
    caseId: caseId,
    generatedAt: new Date().toISOString(),
    records: approved,
    count: approved.length,
    certification: {
      allApproved: true,
      reviewedBy: user.userId
    }
  });
});
