const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const failures = [];
const warnings = [];
const expectedPages = [
  "index.html",
  "00_Case_Intake_Dashboard.html",
  "00_Legal_Research_Dashboard.html",
  "arc-notebook.html",
  "01_Report_Generator.html",
  "02_Legal_Research.html",
  "03_Motion_Bank.html",
  "04_Discovery_Review.html",
  "05_Chain_of_Custody_Analyzer.html",
  "06_Timeline_Discrepancy.html",
  "07_Intelligence_Slides_Analysis_Investigator.html",
  "08_Defense_Map.html",
  "09_Intelligence_Board.html",
  "10_Investigation_Map.html",
  "11_Reports_Dashboard.html",
  "12_Report_Pictures.html",
  "13_Report_Videos.html",
  "14_Report_Transcripts.html",
  "15_Report_Translations.html",
  "16_Report_Full_Motions.html",
  "17_Evidence_Dashboard.html",
  "18_External_Tools_Dashboard.html"
];

function fail(message) { failures.push(message); }
function warn(message) { warnings.push(message); }
function read(file) { return fs.readFileSync(path.join(root, file), "utf8"); }
function walkFiles(directory, output) {
  output = output || [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && [".git", "database", "uploads", "node_modules"].includes(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walkFiles(target, output);
    else output.push(path.relative(root, target).replace(/\\/g, "/"));
  }
  return output;
}

for (const page of expectedPages) {
  if (!fs.existsSync(path.join(root, page))) fail(`Missing required page: ${page}`);
}

const nestedDuplicate = path.join(root, path.basename(root));
if (fs.existsSync(nestedDuplicate)) fail(`Nested duplicate project directory must be removed: ${path.basename(root)}/${path.basename(root)}`);
if (!fs.existsSync(path.join(root, "LICENSE"))) fail("Missing proprietary LICENSE notice");
if (!fs.existsSync(path.join(root, "scripts", "dependency-smoke.html"))) fail("Missing browser dependency smoke page");
if (!fs.existsSync(path.join(root, "19_Final_Client_Report.html"))) fail("Missing final attorney report template");
if (!fs.existsSync(path.join(root, "arc_final_report_bridge.js"))) fail("Missing final attorney report data bridge");

for (const file of fs.readdirSync(root).filter(function (name) { return name.endsWith(".json"); })) {
  try { JSON.parse(read(file)); }
  catch (error) { fail(`${file}: invalid JSON (${error.message})`); }
}

const htmlFiles = fs.readdirSync(root).filter(function (name) { return name.endsWith(".html"); });
const localReferencePattern = /(?<![-\w])(?:src|href)\s*=\s*["']([^"']+)["']/gi;
const scriptPattern = /<script([^>]*)>([\s\S]*?)<\/script>/gi;

for (const file of htmlFiles) {
  const source = read(file);
  let match;
  let scriptNumber = 0;

  while ((match = scriptPattern.exec(source))) {
    scriptNumber += 1;
    const attributes = match[1] || "";
    if (/\bsrc\s*=/.test(attributes) || /\btype\s*=\s*["'](?:application\/json|application\/ld\+json)["']/i.test(attributes)) continue;
    try { new vm.Script(match[2], { filename: `${file}#script-${scriptNumber}` }); }
    catch (error) { fail(`${file}: inline script ${scriptNumber} does not parse (${error.message})`); }
  }

  while ((match = localReferencePattern.exec(source))) {
    const reference = match[1].trim();
    if (!reference || reference.includes("${") || /^(?:https?:|data:|blob:|mailto:|tel:|#|javascript:|\{)/i.test(reference)) continue;
    const clean = reference.split(/[?#]/)[0].replace(/\\/g, "/");
    const target = path.resolve(root, clean);
    if (target !== root && !target.startsWith(root + path.sep)) fail(`${file}: local reference leaves the project root (${reference})`);
    else if (!fs.existsSync(target)) fail(`${file}: missing local asset (${reference})`);
  }
}

for (const file of ["map/index.html", "scripts/dependency-smoke.html"]) {
  const source = read(file);
  let match;
  let scriptNumber = 0;
  while ((match = scriptPattern.exec(source))) {
    scriptNumber += 1;
    const attributes = match[1] || "";
    if (/\bsrc\s*=/.test(attributes) || /\btype\s*=\s*["'](?:application\/json|application\/ld\+json)["']/i.test(attributes)) continue;
    try { new vm.Script(match[2], { filename: `${file}#script-${scriptNumber}` }); }
    catch (error) { fail(`${file}: inline script ${scriptNumber} does not parse (${error.message})`); }
  }
  localReferencePattern.lastIndex = 0;
  while ((match = localReferencePattern.exec(source))) {
    const reference = match[1].trim();
    if (!reference || reference.includes("${") || /^(?:https?:|data:|blob:|mailto:|tel:|#|javascript:|\{)/i.test(reference)) continue;
    const clean = reference.split(/[?#]/)[0].replace(/\\/g, "/");
    const target = path.resolve(root, path.dirname(file), clean);
    if (target !== root && !target.startsWith(root + path.sep)) fail(`${file}: local reference leaves the project root (${reference})`);
    else if (!fs.existsSync(target)) fail(`${file}: missing local asset (${reference})`);
  }
}

for (const file of walkFiles(root).filter(function (name) { return name.endsWith(".css"); })) {
  const source = read(file);
  const urlPattern = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;
  let match;
  while ((match = urlPattern.exec(source))) {
    const reference = match[1].trim();
    if (!reference || /^(?:https?:|data:|blob:|#)/i.test(reference)) continue;
    const clean = reference.split(/[?#]/)[0].replace(/\\/g, "/");
    const target = path.resolve(root, path.dirname(file), clean);
    if (target !== root && !target.startsWith(root + path.sep)) fail(`${file}: CSS reference leaves the project root (${reference})`);
    else if (!fs.existsSync(target)) fail(`${file}: missing CSS asset (${reference})`);
  }
}

for (const file of walkFiles(root).filter(function (name) { return name.endsWith(".js") && !name.startsWith("legacy/"); })) {
  // Files under arc-sync-backend/ are Cloudflare Worker ES modules and use
  // export/import, which vm.Script cannot parse. Syntax-check them as modules.
  if (file.startsWith("arc-sync-backend/")) {
    const result = require("child_process").spawnSync(
      process.execPath,
      ["--input-type=module", "--check"],
      { input: read(file), encoding: "utf8" }
    );
    if (result.status !== 0) fail(`${file}: module does not parse (${(result.stderr || "").split("\n")[0]})`);
    continue;
  }
  try { new vm.Script(read(file), { filename: file }); }
  catch (error) { fail(`${file}: script does not parse (${error.message})`); }
}

for (const file of expectedPages.slice(1)) {
  const source = read(file);
  if (!source.includes('src="arc_unified_bridge.js"')) fail(`${file}: unified bridge is not loaded`);
  if (!source.includes('src="arc_report_header.js"')) fail(`${file}: shared report header is not loaded`);
}

for (const file of ["index.html", "arc-notebook.html", "01_Report_Generator.html", "03_Motion_Bank.html", "07_Intelligence_Slides_Analysis_Investigator.html", "08_Defense_Map.html"]) {
  if (!read(file).includes('src="arc_shared_keys.js"')) fail(`${file}: shared key vault is not loaded`);
}

const sharedKeys = read("arc_shared_keys.js");
if (/googleCseId:\s*["'][^"']+["']/.test(sharedKeys)) fail("arc_shared_keys.js: a default Google CSE ID must not be bundled");

const reportBuilder = read("01_Report_Generator.html");
if (!reportBuilder.includes('src="libs/purify.min.js"') || !reportBuilder.includes("sanitizeReportHtml")) fail("01_Report_Generator.html: report HTML sanitizer is not wired in");
if (!reportBuilder.includes("decodeLegacyEscapedReportHtml") || !reportBuilder.includes("sanitizeReportHtmlFallback")) fail("01_Report_Generator.html: escaped-report recovery and sanitizer fallback are not wired in");
if (!reportBuilder.includes('src="libs/html2pdf.bundle.min.js"')) fail("01_Report_Generator.html: local PDF export library is not wired in");
if (!reportBuilder.includes('src="libs/html-docx.js"') || !reportBuilder.includes("htmlDocx.asBlob")) fail("01_Report_Generator.html: real DOCX export is not wired in");
if (!reportBuilder.includes("font-size: 12.5pt") || !reportBuilder.includes(".report-paper thead")) fail("01_Report_Generator.html: 12.5-point report and repeating table-header styles are missing");
if (!reportBuilder.includes("21. Complete Source Appendices") || reportBuilder.includes("Selected Media Attachments")) fail("01_Report_Generator.html: complete source appendices are not enforced");
if (!reportBuilder.includes("CONFIDENTIAL ATTORNEY WORK PRODUCT") || !reportBuilder.includes("pdf.internal.getNumberOfPages")) fail("01_Report_Generator.html: PDF page furniture is not wired in");
for (const sectionNumber of Array.from({ length: 21 }, (_, index) => `${index + 1}.`)) {
  if (!reportBuilder.includes(`>${sectionNumber} `) && !reportBuilder.includes(`>${sectionNumber}`)) fail(`01_Report_Generator.html: report section ${sectionNumber} is missing`);
}
if (!reportBuilder.includes("publishUnifiedCase(caseItem)")) fail("01_Report_Generator.html: Full Report Builder does not publish its active case");
if (!reportBuilder.includes('src="arc_final_report_bridge.js"') || !reportBuilder.includes('data-fr-action="attorney"') || !reportBuilder.includes("ARCFinalReport.open")) {
  fail("01_Report_Generator.html: final attorney report action is not connected to Stage 6");
}
const finalClientReport = read("19_Final_Client_Report.html");
for (const marker of [
  'id="embedded-report"',
  "CASE_SCOPED_ARRAYS",
  "sanitizePayload",
  "visibleGroups",
  "sectionHasContent",
  "Revision ${prior+1}",
  "Download Report JSON",
  "Download Complete HTML",
  "Certification is recorded with one click"
]) {
  if (!finalClientReport.includes(marker)) fail(`19_Final_Client_Report.html: final report control is missing (${marker})`);
}
for (const section of ["dashboard", "scope", "case-information", "parties", "methodology", "investigator-report", "interviews", "transcripts", "timeline", "public-records", "follow-up", "evidence-inventory", "chain-custody", "media", "digital-location", "forensics", "evidence-analysis", "contradictions", "discovery-gaps", "defense-assessment", "unresolved", "legal-research", "legal-issues", "recommended-motions", "full-motions", "visual-exhibits", "sources", "document-index", "appendices", "certification"]) {
  if (!finalClientReport.includes(`['${section}'`)) fail(`19_Final_Client_Report.html: expanded report section is missing (${section})`);
}
const sharedCaseAdapters = {
  "02_Legal_Research.html": "applySharedLegalCase",
  "03_Motion_Bank.html": "applySharedMotionCase",
  "04_Discovery_Review.html": "ARC_REQUEST_ACTIVE_CASE",
  "05_Chain_of_Custody_Analyzer.html": "applySharedCustodyCase",
  "06_Timeline_Discrepancy.html": "timelineMatter",
  "07_Intelligence_Slides_Analysis_Investigator.html": "ARC.sharedCaseId",
  "08_Defense_Map.html": "ARC.sharedCaseId"
};
for (const [file, marker] of Object.entries(sharedCaseAdapters)) {
  const source = read(file);
  if (!source.includes(marker) || !source.includes("arc:case-context")) fail(`${file}: shared case adapter is not wired in`);
}

const restoredFeatureMarkers = {
  "arc-notebook.html": [
    "function arcPublishCaseBrief()",
    "ARC_CASE_BRIEF_V1",
    "arcPublishCaseBrief();"
  ],
  "02_Legal_Research.html": [
    "What you should know about this case",
    "Generate legal briefing with AI",
    "Send briefing to Main Report"
  ],
  "04_Discovery_Review.html": [
    "ARC Discovery Review",
    "ARC_SEND_DISCOVERY_GAP_REPORT",
    "Snip to Exhibit",
    "arc:case-context"
  ],
  "06_Timeline_Discrepancy.html": [
    "function collectEvents",
    "refreshNotebookTimeline",
    "ARC_CASE_BRIEF_V1"
  ],
  "07_Intelligence_Slides_Analysis_Investigator.html": [
    "ARC Investigation Rebuilt",
    "arc_investigator_rebuilt_v3",
    "Public Records Accountability",
    "Final Report Queue"
  ],
  "01_Report_Generator.html": [
    "async function arcPrintIsolatedReport()",
    "arc-print-isolated",
    "arc-export-printing"
  ]
};
for (const [file, markers] of Object.entries(restoredFeatureMarkers)) {
  const source = read(file);
  for (const marker of markers) {
    if (!source.includes(marker)) fail(`${file}: restored pre-v11.1 feature is missing (${marker})`);
  }
}

try {
  const timelineSource = read("06_Timeline_Discrepancy.html");
  const sourceStart = timelineSource.indexOf("function sourceFor");
  const collectEndMatch = /\r?\n\r?\n  function makeElement/.exec(timelineSource.slice(sourceStart));
  const collectEnd = collectEndMatch ? sourceStart + collectEndMatch.index : -1;
  if (sourceStart < 0 || collectEnd < 0) throw new Error("timeline parser not found");
  const timelineContext = {};
  vm.createContext(timelineContext);
  vm.runInContext(
    timelineSource.slice(sourceStart, collectEnd) + ";globalThis.collectEventsTest=collectEvents;",
    timelineContext,
    { filename: "06_Timeline_Discrepancy.html#parser-test" }
  );
  const events = timelineContext.collectEventsTest(
    "CAD dispatch logged 12:05 AM. Bodycam recorded 1:30 PM. Instrument result printed 23:15:09.",
    "2026-08-02"
  );
  const byStamp = Object.fromEntries(events.map(function (event) { return [event.stamp, event]; }));
  if (events.length !== 3 || byStamp["12:05 AM"].seconds !== 300 || byStamp["1:30 PM"].seconds !== 48600 || byStamp["23:15:09"].seconds !== 83709) {
    throw new Error("12-hour or 24-hour timestamp conversion is incorrect");
  }
  if (events.map(function (event) { return event.stamp; }).join("|") !== "12:05 AM|1:30 PM|23:15:09") {
    throw new Error("timeline events are not sorted chronologically");
  }
} catch (error) {
  fail(`06_Timeline_Discrepancy.html: timeline parser self-test failed (${error.message})`);
}

const unifiedBridge = read("arc_unified_bridge.js");
for (const field of ["caseId", "court", "clientName", "subjectName", "incidentDate", "priority", "status", "investigator", "notes"]) {
  if (!unifiedBridge.includes(`${field}:`)) fail(`arc_unified_bridge.js: shared case schema is missing ${field}`);
}

if (!unifiedBridge.includes('data-arc-destination=\'generator\'') ||
    !unifiedBridge.includes('data-arc-destination=\'editor\'') ||
    !unifiedBridge.includes("#4 ARC Generator") ||
    !unifiedBridge.includes("#5 Edit PDF")) {
  fail("arc_unified_bridge.js: the two-destination report export dialog is incomplete");
}
if (!unifiedBridge.includes("logicalKey") || !unifiedBridge.includes("isSameReportSeries")) {
  fail("arc_unified_bridge.js: report-series revision deduplication is missing");
}
if (!unifiedBridge.includes("layoutFloatingActions") || !unifiedBridge.includes("--arc-floating-tools-bottom")) {
  fail("arc_unified_bridge.js: floating page tools can overlap the report export action");
}
if (!read("map/style.css").includes("--arc-floating-tools-bottom: 88px")) {
  fail("map/style.css: shared page tools can overlap the map timeline");
}

try {
  const memory = new Map();
  const storage = {
    get length() { return memory.size; },
    key(index) { return Array.from(memory.keys())[index] || null; },
    getItem(key) { return memory.has(key) ? memory.get(key) : null; },
    setItem(key, value) { memory.set(key, String(value)); },
    removeItem(key) { memory.delete(key); }
  };
  const fakeDocument = {
    readyState: "loading",
    title: "Release Check",
    body: { appendChild() {} },
    addEventListener() {},
    dispatchEvent() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getElementById() { return null; },
    createElement() {
      return {
        style: {},
        setAttribute() {},
        addEventListener() {},
        appendChild() {},
        remove() {},
        closest() { return null; }
      };
    }
  };
  const fakeWindow = {
    localStorage: storage,
    sessionStorage: storage,
    document: fakeDocument,
    location: { pathname: "/release-check.html" },
    addEventListener() {},
    dispatchEvent() {},
    parent: null
  };
  fakeWindow.parent = fakeWindow;
  class FakeDOMParser {
    parseFromString(value) {
      return { body: { innerHTML: String(value || ""), querySelectorAll() { return []; } } };
    }
  }
  const bridgeContext = {
    window: fakeWindow,
    document: fakeDocument,
    localStorage: storage,
    sessionStorage: storage,
    location: fakeWindow.location,
    DOMParser: FakeDOMParser,
    console,
    Event: class Event { constructor(type, init) { this.type = type; Object.assign(this, init || {}); } },
    CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    Blob: class Blob {},
    URL: { createObjectURL() { return "blob:release-check"; }, revokeObjectURL() {} },
    setTimeout,
    clearTimeout
  };
  vm.createContext(bridgeContext);
  vm.runInContext(unifiedBridge, bridgeContext, { filename: "arc_unified_bridge.js#dedupe-test" });
  const api = fakeWindow.ARCUnified;
  api.saveReport({
    id: "chain_approved_pre_v10",
    title: "Evidence Integrity & Chain Report - Approved Final Section",
    reportType: "Chain Review Final",
    source: "chain-review",
    caseContext: { caseId: "CASE-100" },
    text: "legacy"
  });
  api.saveReport({
    id: "chain_approved_new_hash",
    logicalKey: "chain-review::case 100",
    title: "Evidence Integrity & Chain Report - Approved Final Section",
    reportType: "Chain Review Final",
    source: "chain-review",
    caseContext: { caseId: "CASE-100" },
    text: "current"
  });
  const reports = api.getReports();
  if (reports.length !== 1 || reports[0].revision !== 2 || reports[0].text !== "current") {
    fail("arc_unified_bridge.js: legacy chain reports do not deduplicate as revisions");
  }
  api.updateReportReview(reports[0].id, "approved", "Release Reviewer", "Verified.");
  const approved = api.getReports()[0];
  if (approved.reviewStatus !== "approved" || approved.reviewedBy !== "Release Reviewer") {
    fail("arc_unified_bridge.js: report approval state is not preserved");
  }
  api.saveReport({
    id: "chain_changed_after_approval",
    logicalKey: approved.logicalKey,
    title: approved.title,
    reportType: approved.reportType,
    source: approved.source,
    caseContext: approved.caseContext,
    text: "changed after approval"
  });
  const revised = api.getReports()[0];
  if (revised.reviewStatus !== "revised" || !/Approval reset/.test(revised.reviewNotes || "")) {
    fail("arc_unified_bridge.js: substantive report changes do not reset approval");
  }
  const workflow = api.getWorkflowStatus({ caseId: "CASE-100", matter: "Test", docket: "100", investigator: "Reviewer" });
  if (!Array.isArray(workflow) || workflow.length !== 6) {
    fail("arc_unified_bridge.js: six-stage workflow status is unavailable");
  }
} catch (error) {
  fail(`arc_unified_bridge.js: report dedupe self-test failed (${error.message})`);
}

const chainReview = read("05_Chain_of_Custody_Analyzer.html");
if (!chainReview.includes("function connectionFingerprint") ||
    !chainReview.includes("Analytical connection requires investigator approval") ||
    !chainReview.includes("Every included factual finding and analytical connection must have a valid source citation.")) {
  fail("05_Chain_of_Custody_Analyzer.html: analytical connections can bypass investigator review");
}
if (!chainReview.includes('crop.toDataURL("image/jpeg",.92)') ||
    !chainReview.includes("drawImage(baseCanvas") ||
    !chainReview.includes("imageDataUrl")) {
  fail("05_Chain_of_Custody_Analyzer.html: Snip-to-Exhibit does not create a visual crop");
}
if (!chainReview.includes("class ArcSha256") ||
    !chainReview.includes("chunkSize=4*1024*1024") ||
    /512\s*\*\s*1024\s*\*\s*1024/.test(chainReview)) {
  fail("05_Chain_of_Custody_Analyzer.html: large-file streaming SHA-256 is not enforced");
}
try {
  const start = chainReview.indexOf("class ArcSha256");
  const endMatch = /\r?\n\r?\nasync function hashFile/.exec(chainReview.slice(start));
  const end = endMatch ? start + endMatch.index : -1;
  if (start < 0 || end < 0) throw new Error("SHA-256 implementation not found");
  const shaContext = { Uint8Array, Uint32Array };
  vm.createContext(shaContext);
  vm.runInContext(
    chainReview.slice(start, end) + ";globalThis.ArcSha256Test=ArcSha256;",
    shaContext,
    { filename: "05_Chain_of_Custody_Analyzer.html#sha256-test" }
  );
  const vectors = [
    ["", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
    ["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"]
  ];
  for (const [value, expected] of vectors) {
    const hasher = new shaContext.ArcSha256Test();
    hasher.update(new Uint8Array(Buffer.from(value, "utf8")));
    if (hasher.digestHex() !== expected) throw new Error(`incorrect digest for ${JSON.stringify(value)}`);
  }
} catch (error) {
  fail(`05_Chain_of_Custody_Analyzer.html: SHA-256 self-test failed (${error.message})`);
}

if (!reportBuilder.includes("buildInteractiveReportHtml") ||
    !reportBuilder.includes("Download Functional HTML") ||
    !reportBuilder.includes("report-live-preview")) {
  fail("01_Report_Generator.html: live Edit PDF or functional HTML export is incomplete");
}
const hasInvestigatorMediaSelection =
  reportBuilder.includes("include: false") &&
  reportBuilder.includes("state.media.filter((item) => item.include)") &&
  (
    reportBuilder.includes("Clear selection") ||
    reportBuilder.includes("Clear All") ||
    reportBuilder.includes('data-action="clear-media-selection"')
  ) &&
  (
    reportBuilder.includes("Select visible") ||
    reportBuilder.includes("Select All") ||
    reportBuilder.includes('data-action="select-visible-media"')
  );
if (!hasInvestigatorMediaSelection) {
  fail("01_Report_Generator.html: extracted images are not investigator-selected");
}
try {
  const start = reportBuilder.indexOf("function buildInteractiveReportHtml");
  const endSync = reportBuilder.indexOf("\nfunction downloadEditedReportHtml", start);
  const endAsync = reportBuilder.indexOf("\nasync function downloadEditedReportHtml", start);
  const end = endSync >= 0 ? endSync : endAsync;
  if (start < 0 || end < 0) throw new Error("functional HTML builder not found");
  const htmlContext = {
    escapeHtml(value) {
      return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
      });
    },
    escapeAttr(value) {
      return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
      });
    },
    formatDateTime(value) { return String(value || ""); },
    prepareReportHtmlForWordExport(value) { return String(value || ""); }
  };
  vm.createContext(htmlContext);
  vm.runInContext(
    reportBuilder.slice(start, end) + ";globalThis.buildInteractiveReportHtmlTest=buildInteractiveReportHtml;",
    htmlContext,
    { filename: "01_Report_Generator.html#functional-html-test" }
  );
  const generated = htmlContext.buildInteractiveReportHtmlTest({
    caseName: "Test Matter",
    docketNumber: "CASE-100",
    report: { reportTitle: "Test Report" },
    reportMeta: { responseId: "v1", generatedAt: "2026-07-31T00:00:00Z" },
    createdAt: "2026-07-30T00:00:00Z",
    updatedAt: "2026-07-31T00:00:00Z",
    reportMargin: "0.75in"
  }, "<h1>Test Report</h1><h2>Facts</h2><p>Supported fact.</p>");
  if (!generated.includes('id="searchBtn"') || !generated.includes('id="toc"')) {
    throw new Error("attorney navigation controls are missing");
  }
  const scriptMatch = generated.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
  if (!scriptMatch) throw new Error("embedded navigation script is missing");
  new vm.Script(scriptMatch[1], { filename: "functional-report.html#script" });
} catch (error) {
  fail(`01_Report_Generator.html: functional HTML self-test failed (${error.message})`);
}

const combinedWorkspace = read("07_Intelligence_Slides_Analysis_Investigator.html");
for (const marker of [
  "['dashboard','Dashboard']",
  "['parties','Parties']",
  "['tips','Investigator Tips']",
  "['evidence','Evidence']",
  "['tasks','Leads and Tasks']",
  "['contradictions','Contradictions']",
  "['publicrecords','Public Records Accountability']",
  "['reports','Reports Vault']",
  "['analysis','Analysis']",
  "window.ARCStore",
  "syncFinalReports"
]) {
  if (!combinedWorkspace.includes(marker)) fail(`07_Intelligence_Slides_Analysis_Investigator.html: missing rebuilt investigator marker ${marker}`);
}
const legacyDefenseMap = read("08_Defense_Map.html");
if (!legacyDefenseMap.includes("07_Intelligence_Slides_Analysis_Investigator.html#defmap") ||
    legacyDefenseMap.includes('class="rail"') ||
    legacyDefenseMap.includes('class="topbar"')) {
  fail("08_Defense_Map.html: obsolete standalone Defense Map layout is still shipped");
}
const shell = read("index.html");
if (shell.includes('["Defense Map", "08_Defense_Map.html"]') ||
    !shell.includes('if (data.type === "ARC_ROUTE_REPORT") handleRouteRequest(data);')) {
  fail("index.html: stale Defense Map navigation or report routing remains");
}
if (!shell.includes('["Intelligence Board", "09_Intelligence_Board.html"]')) {
  fail("index.html: Intelligence Board module is not registered");
}
if (!shell.includes('["Investigation Map", "map/index.html"]')) {
  fail("index.html: Investigation Map module is not registered");
}
if (!shell.includes('["Legal Research", "02_Legal_Research.html"') ||
    !shell.includes('["Legal Research Dashboard", "00_Legal_Research_Dashboard.html"')) {
  fail("index.html: Legal Research module or dashboard is not registered");
}
if (!fs.existsSync(path.join(root, "arc-knowledge-bank-v1.json"))) {
  fail("arc-knowledge-bank-v1.json: Legal Research knowledge bank is missing");
}
if (!read("02_Legal_Research.html").includes("arc-knowledge-bank-v1") ||
    !read("02_Legal_Research.html").includes("arc_legal_kb_v1")) {
  fail("02_Legal_Research.html: Knowledge Bank v1 wiring is missing");
}
if (!shell.includes('["Case Dashboard", "00_Case_Intake_Dashboard.html"')) {
  fail("index.html: Case Dashboard is not registered as the first bridge module");
}
const caseIntakeIdx = shell.indexOf('["Case Dashboard", "00_Case_Intake_Dashboard.html"');
const notebookIdx = shell.indexOf('["Notebook", "arc-notebook.html"]');
if (caseIntakeIdx < 0 || notebookIdx < 0 || caseIntakeIdx > notebookIdx) {
  fail("index.html: Case Dashboard must appear before Notebook in the module list");
}
if (!shell.includes('selectTarget("00_Case_Intake_Dashboard.html")')) {
  fail("index.html: Case Setup workflow stage does not open Case Intake");
}
if (!read("00_Case_Intake_Dashboard.html").includes("Generate Information") ||
    !read("00_Case_Intake_Dashboard.html").includes("ARCUnified.saveCase") ||
    !read("00_Case_Intake_Dashboard.html").includes("arc:case-context")) {
  fail("00_Case_Intake_Dashboard.html: intake generate/save bridge is incomplete");
}
if (!shell.includes('["Discovery Review", "04_Discovery_Review.html"]')) {
  fail("index.html: Discovery Review module is not registered");
}
if (!shell.includes("ARC_REQUEST_ACTIVE_CASE") || !shell.includes("ARC_SEND_DISCOVERY_GAP_REPORT")) {
  fail("index.html: Discovery Review shell bridge handlers are missing");
}
const discoveryReview = read("04_Discovery_Review.html");
if ((discoveryReview.match(/ev\.source !== window && \(window\.parent === window \|\| ev\.source !== window\.parent\)/g) || []).length < 2) {
  fail("04_Discovery_Review.html: cross-window message handlers are not source-restricted");
}
if (!read("arc_unified_bridge.js").includes("event.source !== window && (window.parent === window || event.source !== window.parent)")) {
  fail("arc_unified_bridge.js: cross-window messages are not source-restricted");
}
if (fs.existsSync(path.join(root, "04_Discovery_Gap_Map.html"))) {
  fail("04_Discovery_Gap_Map.html: obsolete Discovery Gap Map must not remain as the active module");
}
if (!fs.existsSync(path.join(root, "map", "index.html")) || !fs.existsSync(path.join(root, "map", "map-app.js"))) {
  fail("map/: Investigation Map assets are missing");
}
const mapEntry = read("map/index.html");
if (!mapEntry.includes("@geoman-io/leaflet-geoman-free@2.14.2/dist/leaflet-geoman.min.js") ||
    mapEntry.includes("@geoman-io/leaflet-geoman-free@2.14.2/dist/leaflet-geoman.js")) {
  fail("map/index.html: published Geoman JavaScript bundle is not configured");
}
if (!mapEntry.includes('<body class="dark-mode" data-workspace="map">') ||
    (unifiedBridge.match(/if \(document\.getElementById\("frame"\)\) return;/g) || []).length < 2) {
  fail("Investigation Map: direct-page tools or nested index detection is not configured correctly");
}
for (const match of mapEntry.matchAll(/<(?:script|link)\b[^>]*(?:src|href)=["']https:\/\/[^"']+["'][^>]*>/gi)) {
  if (!/\bintegrity=["']sha384-[^"']+["']/i.test(match[0]) || !/\bcrossorigin=["']anonymous["']/i.test(match[0])) {
    fail(`map/index.html: external executable or stylesheet is missing subresource integrity (${match[0].slice(0, 120)})`);
  }
}
const serverSource = read("scripts/serve.js");
if (!serverSource.includes('["database", "uploads"]') || !serverSource.includes('segment.startsWith(".")')) {
  fail("scripts/serve.js: runtime data and repository dotfiles are not protected from static serving");
}
const gitignore = read(".gitignore");
if (!gitignore.includes("database/**") || !gitignore.includes("uploads/**")) {
  fail(".gitignore: runtime databases and uploaded evidence are not fully excluded");
}
const workflow = read(".github/workflows/verify.yml");
if (!workflow.includes("npm test") || !workflow.includes("npm run test:api")) {
  fail(".github/workflows/verify.yml: complete release and API smoke coverage is not enabled");
}
const apiSmoke = read("scripts/report-assets-smoke.js");
for (const marker of ["ensureServer", "runtime database must not be served statically", "uploaded evidence must not be served statically", "smoke record must be removed after the test"]) {
  if (!apiSmoke.includes(marker)) fail(`scripts/report-assets-smoke.js: API release protection is missing (${marker})`);
}
if (!serverSource.includes("/api/geocoding/search") || !serverSource.includes("/api/routing/route")) {
  fail("scripts/serve.js: Investigation Map API routes are missing");
}
const routingSource = read("api/routing/route.js");
if (!routingSource.includes("valhalla1.openstreetmap.de/route") ||
    !routingSource.includes('walking: "pedestrian"') ||
    !routingSource.includes('cycling: "bicycle"')) {
  fail("api/routing/route.js: mode-aware Investigation Map routing is missing");
}
const casesSource = read("api/cases/index.js");
if (!casesSource.includes("ownerId") || !casesSource.includes("request.user")) {
  fail("api/cases/index.js: per-user case ownership is missing");
}
if (!read("api/_lib/auth.js").includes("authenticate") || !read("api/auth/login.js").includes("loginHandler")) {
  fail("api auth modules: per-user authentication is incomplete");
}
const mapApp = read("map/map-app.js");
if (!mapApp.includes("function escapeHtml(value)") ||
    mapApp.includes("<h4>${ev.title}</h4>") ||
    mapApp.includes("<div>${ev.notes}</div>")) {
  fail("map/map-app.js: map evidence rendering is not safely escaped");
}
for (const marker of ["MAP_PREFS_KEY", "btnFullscreen", "btnResetView", "setMapStatus", "Light Mode"]) {
  if (!mapApp.includes(marker) && !mapEntry.includes(marker)) fail(`Investigation Map: required workspace control is missing (${marker})`);
}
if (!serverSource.includes('stat.isDirectory()') || !serverSource.includes('path.join(target, "index.html")')) {
  fail("scripts/serve.js: directory index routing is missing");
}
if (!read("10_Investigation_Map.html").includes('location.search + location.hash')) {
  fail("10_Investigation_Map.html: query parameters must precede the URL fragment");
}
for (const marker of [
  'data-stage="case"',
  'data-stage="evidence"',
  'data-stage="analysis"',
  'data-stage="review"',
  'data-stage="builder"',
  'data-stage="export"',
  'Report Review & Approval',
  'Final Report Release Checklist',
  'id="clientName"',
  'id="investigator"'
]) {
  if (!shell.includes(marker)) fail(`index.html: product workflow marker is missing (${marker})`);
}
const requiredOrderedModules = [
  "00_Case_Intake_Dashboard.html",
  "17_Evidence_Dashboard.html",
  "00_Legal_Research_Dashboard.html",
  "18_External_Tools_Dashboard.html",
  "11_Reports_Dashboard.html",
  "12_Report_Pictures.html",
  "13_Report_Videos.html",
  "14_Report_Transcripts.html",
  "15_Report_Translations.html",
  "16_Report_Full_Motions.html",
  "__inbox__",
  "__review__",
  "01_Report_Generator.html"
];
let lastModuleIndex = -1;
for (const modulePath of requiredOrderedModules) {
  const moduleIndex = shell.indexOf('"' + modulePath + '"', lastModuleIndex + 1);
  if (moduleIndex < 0 || moduleIndex < lastModuleIndex) fail(`index.html: workflow module is missing or out of order (${modulePath})`);
  lastModuleIndex = moduleIndex;
}
if (!reportBuilder.includes('src="arc_report_assets.js"') || !reportBuilder.includes("approvedReportAssets")) {
  fail("01_Report_Generator.html: approved Reports workspace assets are not connected to generation metadata");
}
for (const marker of ["/api/report-assets", "/api/report-assets/manifest"]) {
  if (!serverSource.includes(marker)) fail(`scripts/serve.js: report asset API marker is missing (${marker})`);
}
const reportAssetsSource = read("api/report-assets/index.js") + read("api/report-assets/files/[id].js");
if (!reportAssetsSource.includes("assertCaseAccess") || !reportAssetsSource.includes("createHash(\"sha256\")")) {
  fail("api/report-assets: ownership checks or checksum hashing is incomplete");
}
if (!unifiedBridge.includes("injectPageTools") || !unifiedBridge.includes("Download HTML") || !unifiedBridge.includes("arc:edit-request")) {
  fail("arc_unified_bridge.js: shared edit, print, and HTML controls are incomplete");
}
const timelineSource = read("06_Timeline_Discrepancy.html");
if (!timelineSource.includes("timeline-no-case") || !timelineSource.includes("Example evidence is never displayed as case fact")) {
  fail("06_Timeline_Discrepancy.html: case-driven empty state is not enforced");
}
for (const marker of [
  "updateReportReview",
  "getReviewSummary",
  "getReleaseChecklist",
  "getWorkflowStatus",
  "Approval reset because the report changed after review",
  "Investigator approval is required before this report can enter Edit PDF"
]) {
  if (!unifiedBridge.includes(marker)) fail(`arc_unified_bridge.js: product review control is missing (${marker})`);
}
for (const marker of [
  "finalReleaseChecklist",
  "The report cannot be finalized yet",
  "report-export-pdf",
  "report-export-html",
  "report-finalized"
]) {
  if (!reportBuilder.includes(marker)) fail(`01_Report_Generator.html: final product release control is missing (${marker})`);
}
const notebook = read("arc-notebook.html");
if (!notebook.includes('src="libs/pptxgen.bundle.js"')) fail("arc-notebook.html: local PowerPoint export library is not wired in");
if (!notebook.includes('src="libs/html-docx.js"')) fail("arc-notebook.html: local Word export library is not wired in");
if (/cdnjs\.cloudflare\.com\/ajax\/libs\/(?:PptxGenJS|html-docx-js)\//i.test(notebook)) fail("arc-notebook.html: broken remote export-library URL is still present");
if ((notebook.match(/\n\s+style:\s*'/g) || []).length !== 9) fail("arc-notebook.html: every built-in report type must define a v4 style block");
if (!notebook.includes("STYLE FOR THIS REPORT: ' + type.style")) fail("arc-notebook.html: built-in v4 style assembly is not wired in");
if (!notebook.includes("STYLE FOR THIS REPORT: ' + REPORT_GENERAL_STYLE")) fail("arc-notebook.html: custom-report v4 style assembly is not wired in");
for (const file of htmlFiles) {
  if (read(file).includes("/* ARC shared system keys")) fail(`${file}: obsolete embedded key-vault implementation is still present`);
}

const textFiles = walkFiles(root).filter(function (name) {
  return /\.(?:css|html|js|json|md|txt|ya?ml)$/i.test(name);
});
const secretPatterns = [
  { name: "OpenAI API key", regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}\b/g },
  { name: "Google API key", regex: /\bAIza[A-Za-z0-9_-]{30,}\b/g },
  { name: "GitHub token", regex: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g }
];
for (const file of textFiles) {
  const source = read(file);
  for (const pattern of secretPatterns) {
    if (pattern.regex.test(source)) fail(`${file}: possible plaintext ${pattern.name}`);
    pattern.regex.lastIndex = 0;
  }
}

for (const warning of warnings) console.warn(`WARN: ${warning}`);
if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  console.error(`\nRelease check failed with ${failures.length} issue(s).`);
  process.exit(1);
}

console.log(`Release check passed: ${htmlFiles.length} HTML pages, local assets, JSON, JavaScript, bridge/header wiring, and secret scan.`);
