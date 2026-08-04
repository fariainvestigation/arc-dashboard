const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const storage = new Map();
const sameCase = "case-alpha";
const otherCase = "case-beta";
const windowValue = {
  ARCUnified: {
    getReports() {
      return [
        { id: "approved-same", title: "Investigator Report", text: "Approved findings", reviewStatus: "approved", caseContext: { caseId: sameCase } },
        { id: "approved-other", title: "Other Case Report", text: "Must not transfer", reviewStatus: "approved", caseContext: { caseId: otherCase } },
        { id: "pending-same", title: "Pending Report", text: "Must not transfer", reviewStatus: "pending", caseContext: { caseId: sameCase } }
      ];
    }
  },
  ARCReportAssets: {
    async list() {
      return [
        { id: "motion-same", caseId: sameCase, type: "motion", title: "Approved Motion", bodyText: "Motion body", status: "approved", selectedForFinal: true },
        { id: "motion-other", caseId: otherCase, type: "motion", title: "Other Motion", bodyText: "Must not transfer", status: "approved", selectedForFinal: true },
        { id: "draft-same", caseId: sameCase, type: "motion", title: "Draft Motion", bodyText: "Must not transfer", status: "draft", selectedForFinal: true }
      ];
    },
    listLocal() { return []; },
    fileUrl() { return ""; }
  },
  open() { return null; }
};

const context = {
  window: windowValue,
  globalThis: null,
  localStorage: {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); }
  },
  location: { protocol: "file:", href: "" },
  console,
  Blob,
  Map,
  Date,
  JSON,
  Promise,
  setTimeout,
  clearTimeout
};
context.globalThis = context;
windowValue.localStorage = context.localStorage;
windowValue.location = context.location;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, "arc_final_report_bridge.js"), "utf8"), context, { filename: "arc_final_report_bridge.js" });

const caseItem = {
  id: sameCase,
  caseName: "Commonwealth v. Alpha",
  docketNumber: "CR-100",
  court: "Trial Court",
  clientName: "Alpha",
  investigator: "Investigator",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-02-01T00:00:00.000Z",
  documents: [{ id: "doc-1", name: "report.pdf", type: "application/pdf", addedAt: "2026-01-02T00:00:00.000Z" }],
  report: {
    executiveSummary: ["Case summary"],
    caseInformation: [], methodology: [], people: [], charges: [], evidence: [], timeline: [], findingsSections: [],
    materialConflicts: [], verificationItems: [], recommendedActions: ["First complete action", "Second complete action", "Third complete action"], sourceIndex: [], conclusion: []
  }
};

(async function () {
  const payload = await windowValue.ARCFinalReport.buildPayload(caseItem, { documents: [], media: [] });
  assert.strictEqual(payload.meta.caseId, sameCase);
  assert.deepStrictEqual(Array.from(payload.generatedFrom.approvedReportIds), ["approved-same"]);
  assert.deepStrictEqual(Array.from(payload.generatedFrom.approvedAssetIds), ["motion-same"]);
  assert.deepStrictEqual(Array.from(payload.fullMotions, item => item.id), ["motion-same"]);
  assert.deepStrictEqual(Array.from(payload.executive.attorneyActions), ["First complete action", "Second complete action", "Third complete action"]);
  assert.ok(!JSON.stringify(payload).includes("Must not transfer"));
  assert.ok(payload.sources.every(item => item.caseId === sameCase));
  assert.ok(payload.documents.every(item => item.caseId === sameCase));
  windowValue.ARCFinalReport.savePayload(payload);
  assert.strictEqual(JSON.parse(storage.get(windowValue.ARCFinalReport.PAYLOAD_KEY)).meta.caseId, sameCase);
  console.log("Final report smoke passed: case isolation, approval filtering, and payload persistence.");
})().catch(function (error) {
  console.error(error);
  process.exit(1);
});
