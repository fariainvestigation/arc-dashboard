(function () {
  "use strict";

  if (window.parent !== window) document.documentElement.classList.add("arc-embedded");

  const REPORT_KEY = "arc_unified_report_inbox_v1";
  const CASE_KEY = "arc_unified_case_context_v1";
  const ROUTE_KEY = "arc_report_route_request_v1";
  const REVIEW_KEY = "arc_unified_review_records_v1";
  const AUDIT_KEY = "arc_unified_audit_v1";
  const WORKFLOW_KEY = "arc_investigation_workflow_v2";
  const OPEN_QUESTIONS_KEY = "arc_open_questions_v1";
  const FINDINGS_KEY = "arc_findings_v1";
  const FIELD_RECORDS_KEY = "arc_field_records_v1";
  const SUPPLEMENTAL_KEY = "arc_supplemental_records_v1";
  const STAGES = [
    { id: 1, key: "case", label: "Case Intake", route: "cases/intake/index.html" },
    { id: 2, key: "evidence", label: "Evidence Collection", route: "investigation.html#evidence" },
    { id: 3, key: "analysis", label: "Evidence Analysis", route: "investigation.html#analysis" },
    { id: 4, key: "field", label: "Field Investigation", route: "investigation.html#field" },
    { id: 5, key: "supplemental", label: "Supplemental Records & Reports", route: "investigation.html#supplemental" },
    { id: 6, key: "findings", label: "Final Analysis & Findings", route: "investigation.html#findings" },
    { id: 7, key: "report", label: "Report Production", route: "22_Report_Package_Builder.html" }
  ];

  const FIELD_SELECTORS = {
    matter: ["#matter", "#case-name", "#caseName", "#mCaption", "[name='matter']", "[name='caseName']", "[data-case-field='caseName']"],
    docket: ["#docket", "#docket-number", "#docketNumber", "#mDocket", "#cd_docket", "[name='docket']", "[name='docketNumber']", "[data-case-field='docketNumber']"],
    court: ["#court", "#mCourt", "#cd_court", "[name='court']", "[data-case='court']"],
    clientName: ["#clientName", "#fClient", "[name='clientName']", "[name='client']"],
    subjectName: ["#subjectName", "#cd_defendant", "[name='subjectName']", "[name='defendant']", "[data-case='defendant']"],
    incidentDate: ["#incidentDate", "#cd_incidentDate", "[name='incidentDate']", "[data-case='incidentDate']"],
    priority: ["#priority", "[name='priority']"],
    status: ["#status", "#fStatus", "[name='status']"],
    investigator: ["#investigator", "[name='investigator']", "[data-case='investigator']"],
    notes: ["#notes", "[name='notes']"]
  };
  let channel = null;
  try { if ("BroadcastChannel" in window) channel = new BroadcastChannel("arc-unified-system"); } catch (error) {}

  function read(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value === null ? fallback : value;
    } catch (error) {
      console.warn("ARC shared storage entry could not be read:", key, error);
      return fallback;
    }
  }

  function write(key, value) {
    const serialized = JSON.stringify(value);
    try {
      if (window.arcStorage && typeof window.arcStorage.setItem === "function") {
        window.arcStorage.setItem(key, serialized);
      } else {
        localStorage.setItem(key, serialized);
      }
    } catch (error) {
      console.error("ARC shared storage entry could not be saved:", key, error);
      throw error;
    }
    if (channel) channel.postMessage({ type: "storage", key: key, value: value });
    document.dispatchEvent(new CustomEvent("arc:shared-storage", { detail: { key: key, value: value } }));
    return value;
  }

  function authFetch(method, path, body) {
    if (typeof fetch !== "function") return Promise.resolve(null);
    // Cloudflare Access is the only authentication layer. Same-origin requests
    // carry the Access session cookie automatically. There is no token to
    // attach and no session client to delegate to.
    return fetch(path, {
      method: method,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined
    });
  }

  function syncAuditToServer(event) {
    const caseId = canonicalCaseId(event && (event.caseKey || (event.caseContext && (event.caseContext.id || event.caseContext.caseId))));
    if (!caseId || !event || !event.action) return;
    authFetch("POST", "/api/audit-log", {
      id: event.id,
      action: event.action,
      caseId: caseId,
      reportId: event.reportId || null,
      details: {
        summary: event.summary || null,
        destination: event.destination || null,
        recordId: event.recordId || null
      }
    }).then(function (response) {
      if (!response) return;
      if (response.ok) event.synced = true;
    }).catch(function () {});
  }

  function flushPendingAudit() {
    const logs = read(AUDIT_KEY, []);
    const pending = logs.filter(function (entry) {
      return entry && !entry.synced && canonicalCaseId(entry.caseKey || (entry.caseContext && (entry.caseContext.id || entry.caseContext.caseId)));
    }).slice(0, 100).map(function (entry) {
      return {
        id: entry.id,
        action: entry.action,
        caseId: canonicalCaseId(entry.caseKey || (entry.caseContext && (entry.caseContext.id || entry.caseContext.caseId))),
        reportId: entry.reportId || null,
        details: { summary: entry.summary || null }
      };
    });
    if (!pending.length) return;
    authFetch("POST", "/api/audit-log/batch", { entries: pending }).then(function (response) {
      if (!response || !response.ok) return;
      logs.forEach(function (entry) {
        if (pending.some(function (item) { return item.id === entry.id; })) entry.synced = true;
      });
      write(AUDIT_KEY, logs);
    }).catch(function () {});
  }

  function text(value, maxLength) {
    const output = String(value == null ? "" : value).trim();
    return maxLength ? output.slice(0, maxLength) : output;
  }

  function fileMeta(value) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const extraction = source.extraction && typeof source.extraction === "object" ? source.extraction : {};
    return {
      id: text(source.id, 160),
      name: text(source.name, 300),
      size: Number(source.size || 0) || 0,
      type: text(source.type, 160),
      category: text(source.category, 160),
      uploadedAt: text(source.uploadedAt, 80),
      serverAssetId: text(source.serverAssetId || source.assetId, 180),
      sha256: text(source.sha256, 128),
      origin: text(source.origin, 160),
      extraction: {
        status: text(extraction.status, 80),
        textChars: Number(extraction.textChars || 0) || 0,
        fields: extraction.fields && typeof extraction.fields === "object" ? extraction.fields : {},
        facts: Array.isArray(extraction.facts) ? extraction.facts.map(function (fact) {
          return {
            category: text(fact && fact.category, 80),
            text: text(fact && fact.text, 1000)
          };
        }).filter(function (fact) { return fact.category && fact.text; }) : [],
        preview: text(extraction.preview, 2500),
        error: text(extraction.error, 500)
      }
    };
  }

  function normalizeIntake(value) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const normalizeFiles = function (files) {
      return Array.isArray(files) ? files.map(fileMeta).filter(function (file) { return file.id || file.name; }) : [];
    };
    const core = {};
    Object.keys(source.core || {}).forEach(function (key) {
      const slot = source.core[key] || {};
      core[text(key, 80)] = {
        skipped: Boolean(slot.skipped),
        files: normalizeFiles(slot.files)
      };
    });
    const parties = {};
    Object.keys(source.parties || {}).forEach(function (key) {
      const slot = source.parties[key] || {};
      parties[text(key, 80)] = {
        approved: Boolean(slot.approved),
        search: text(slot.search, 500),
        files: normalizeFiles(slot.files)
      };
    });
    return {
      createdAt: text(source.createdAt, 80),
      defendant: text(source.defendant, 240),
      docket: text(source.docket, 160),
      court: text(source.court, 240),
      attorney: text(source.attorney, 240),
      incidentDate: text(source.incidentDate, 40),
      extractions: Array.isArray(source.extractions) ? source.extractions.map(function (row) {
        return {
          id: text(row && row.id, 160),
          name: text(row && row.name, 300),
          category: text(row && row.category, 160),
          status: text(row && row.status, 80),
          textChars: Number(row && row.textChars || 0) || 0,
          fields: row && row.fields && typeof row.fields === "object" ? row.fields : {},
          facts: Array.isArray(row && row.facts) ? row.facts.map(function (fact) {
            return {
              category: text(fact && fact.category, 80),
              text: text(fact && fact.text, 1000)
            };
          }).filter(function (fact) { return fact.category && fact.text; }) : [],
          preview: text(row && row.preview, 2500),
          error: text(row && row.error, 500),
          extractedAt: text(row && row.extractedAt, 80)
        };
      }) : [],
      policeSeed: normalizeFiles(source.policeSeed),
      core: core,
      parties: parties
    };
  }

  function normalizeCase(value) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    return {
      schemaVersion: 2,
      caseId: text(source.caseId || source.id, 160),
      matter: text(source.matter || source.caseName || source.subject, 240),
      docket: text(source.docket || source.docketNumber || source.caseNumber, 160),
      court: text(source.court, 240),
      clientName: text(source.clientName || source.client, 240),
      subjectName: text(source.subjectName || source.defendant, 240),
      attorney: text(source.attorney || source.counsel, 240),
      attorneyFirm: text(source.attorneyFirm || source.firm, 240),
      charges: text(source.charges, 2000),
      nextCourtDate: text(source.nextCourtDate, 80),
      nextCourtEvent: text(source.nextCourtEvent, 240),
      scope: text(source.scope, 4000),
      incidentDate: text(source.incidentDate, 40),
      priority: text(source.priority, 80),
      status: text(source.status, 80),
      investigator: text(source.investigator || source.preparedBy, 240),
      notes: text(source.notes, 12000),
      source: text(source.source, 160),
      intake: normalizeIntake(source.intake),
      uploadedFiles: Array.isArray(source.uploadedFiles) ? source.uploadedFiles.map(fileMeta).filter(function (file) { return file.id || file.name; }) : [],
      __rev: Number(source.__rev || source.rev || 0) || 0,
      __updatedAt: source.__updatedAt || source.updatedAt || null,
      __updatedBy: text(source.__updatedBy || source.updatedBy, 240),
      updatedAt: source.updatedAt || source.__updatedAt || null
    };
  }

  function cleanElementTree(root) {
    root.querySelectorAll("script,iframe,object,embed,link[rel='import']").forEach(function (node) { node.remove(); });
    root.querySelectorAll("*").forEach(function (node) {
      Array.from(node.attributes || []).forEach(function (attribute) {
        const name = attribute.name.toLowerCase();
        const value = String(attribute.value || "").trim();
        if (name.startsWith("on") || ((name === "href" || name === "src" || name === "action") && /^javascript:/i.test(value))) {
          node.removeAttribute(attribute.name);
        }
      });
      node.removeAttribute("contenteditable");
    });
    return root;
  }

  function sanitizeHtml(html) {
    const parsed = new DOMParser().parseFromString(String(html || ""), "text/html");
    cleanElementTree(parsed.body);
    return parsed.body.innerHTML;
  }

  function applyKnownField(selectors, value) {
    if (!value) return;
    for (const selector of selectors) {
      const field = document.querySelector(selector);
      if (!field || !("value" in field) || String(field.value || "").trim()) continue;
      field.value = value;
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new Event("change", { bubbles: true }));
      break;
    }
  }

  function autofillCase(context) {
    Object.keys(FIELD_SELECTORS).forEach(function (key) {
      applyKnownField(FIELD_SELECTORS[key], context[key]);
    });
  }

  function applyCaseContext(value) {
    const context = normalizeCase(value);
    window.ARC_CASE_CONTEXT = context;
    autofillCase(context);
    document.dispatchEvent(new CustomEvent("arc:case-context", { detail: context }));
    return context;
  }

  function filename(value) {
    return text(value || "arc-export").replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "arc-export";
  }

  function download(name, blob) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = name;
    document.body.appendChild(link);
    link.click();
    setTimeout(function () { URL.revokeObjectURL(link.href); link.remove(); }, 1000);
  }

  function ensurePrintHeader() {
    if (document.querySelector(".arc-unified-print-header,.arc-report-banner,.banner,#print-banner")) return;
    const dataUri = window.ARC_REPORT_HEADER && window.ARC_REPORT_HEADER.dataUri;
    if (!dataUri) return;
    const header = document.createElement("div");
    header.className = "arc-unified-print-header";
    const image = document.createElement("img");
    image.src = dataUri;
    image.alt = "ARC Investigations and Consulting confidential report header";
    header.appendChild(image);
    document.body.insertBefore(header, document.body.firstChild);

    if (!document.getElementById("arc-unified-print-style")) {
      const style = document.createElement("style");
      style.id = "arc-unified-print-style";
      style.textContent = ".arc-unified-print-header{display:none}@media print{.arc-unified-print-header{display:block!important;margin:0 0 18pt}.arc-unified-print-header img{display:block;width:100%;max-width:7.25in;height:auto;margin:0 auto}h1,h2,h3{break-after:avoid-page;page-break-after:avoid}figure,tr,img{break-inside:avoid;page-break-inside:avoid}}";
      document.head.appendChild(style);
    }
  }

  function pageHtml() {
    ensurePrintHeader();
    const clone = cleanElementTree(document.documentElement.cloneNode(true));
    return "<!doctype html>\n" + clone.outerHTML;
  }

  function exportPage(kind) {
    if (!["html", "doc", "print"].includes(kind)) return false;
    const base = filename(document.title);
    if (kind === "print") {
      ensurePrintHeader();
      auditEvent("report-print", { caseContext: window.ARC_CASE_CONTEXT, summary: document.title });
      window.print();
      return true;
    }
    if (kind === "html") {
      download(base + ".html", new Blob([pageHtml()], { type: "text/html;charset=utf-8" }));
      auditEvent("report-export-html", { caseContext: window.ARC_CASE_CONTEXT, summary: document.title });
      return true;
    }

    ensurePrintHeader();
    const body = cleanElementTree(document.body.cloneNode(true));
    body.querySelectorAll("button,input,select,textarea,.tabs,.topbar,.sidebar,.actions").forEach(function (node) { node.remove(); });
    const headerCss = window.ARC_REPORT_HEADER && window.ARC_REPORT_HEADER.css ? window.ARC_REPORT_HEADER.css : "";
    const html = "<!doctype html><html><head><meta charset='utf-8'><title>" + text(document.title, 240).replace(/[<>&]/g, "") + "</title><style>" + headerCss + "body{font-family:Georgia,serif;line-height:1.55;margin:.75in}h1,h2,h3{break-after:avoid-page}figure,tr,img{break-inside:avoid}</style></head><body>" + body.innerHTML + "</body></html>";
    download(base + ".doc", new Blob([html], { type: "application/msword" }));
    auditEvent("report-export-word", { caseContext: window.ARC_CASE_CONTEXT, summary: document.title });
    return true;
  }

  function normalizedToken(value) {
    return text(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function canonicalLogicalKey(value) {
    return text(value, 240)
      .split("::")
      .map(normalizedToken)
      .filter(Boolean)
      .join("::");
  }


  function normalizeReviewStatus(value) {
    const status = normalizedToken(value || "pending");
    if (["approved", "rejected", "revised", "pending"].includes(status)) return status;
    if (["verified", "reviewed", "final", "finalized", "accepted"].includes(status)) return "approved";
    if (["denied", "excluded", "declined"].includes(status)) return "rejected";
    if (["changed", "modified", "updated"].includes(status)) return "revised";
    return "pending";
  }

  function caseIdentity(value) {
    const context = normalizeCase(value);
    // Prefer exact identifiers so CASE/A and CASE-A stay distinct.
    if (context.caseId) return "id:" + text(context.caseId).toLowerCase();
    if (context.docket) return "docket:" + text(context.docket).toLowerCase();
    if (context.matter) return "matter:" + text(context.matter).toLowerCase();
    return "";
  }

  // Canonical, server-safe case ID. Local grouping keys (caseIdentity) may be
  // prefixed ("id:x" / "docket:x"), but anything sent to the server MUST use
  // this exact, unprefixed identifier. Returns "" when no true id exists —
  // docket/matter fallbacks are display data, never server identity.
  function canonicalCaseId(value) {
    let raw = "";
    if (value && typeof value === "object") {
      raw = text(normalizeCase(value).caseId, 160);
    } else {
      raw = text(value, 160);
    }
    if (/^id:/i.test(raw)) raw = raw.slice(3);
    if (/^(docket|matter):/i.test(raw)) return "";
    return isValidCaseId(raw) ? raw : "";
  }

  function isValidCaseId(id) {
    return /^[A-Za-z0-9_-]{4,64}$/.test(String(id || ""));
  }

  // Opaque, sortable, collision-resistant id (ULID-like: ms timestamp + randomness).
  function newCaseId() {
    const timePart = Date.now().toString(36);
    let randomPart = "";
    try {
      const bytes = new Uint8Array(10);
      crypto.getRandomValues(bytes);
      randomPart = Array.from(bytes).map(function (b) { return (b % 36).toString(36); }).join("");
    } catch (error) {
      randomPart = Math.random().toString(36).slice(2, 12);
    }
    return "case_" + timePart + randomPart;
  }

  function sameCase(left, right) {
    const leftId = caseIdentity(left);
    const rightId = caseIdentity(right);
    return Boolean(leftId && rightId && leftId === rightId);
  }

  function auditEvent(action, details) {
    const context = normalizeCase(details && details.caseContext || window.ARC_CASE_CONTEXT || read(CASE_KEY, {}));
    const event = {
      id: "audit_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8),
      action: text(action, 120),
      caseKey: caseIdentity(context),
      caseContext: context,
      reportId: text(details && details.reportId, 160),
      recordId: text(details && details.recordId, 160),
      destination: text(details && details.destination, 80),
      summary: text(details && details.summary, 1000),
      user: text(details && details.user || context.investigator, 240),
      applicationVersion: "11.4.2",
      createdAt: new Date().toISOString(),
      synced: false
    };
    const current = read(AUDIT_KEY, []);
    current.unshift(event);
    write(AUDIT_KEY, current.slice(0, 1000));
    syncAuditToServer(event);
    return event;
  }

  function auditList(caseContext) {
    const context = normalizeCase(caseContext || window.ARC_CASE_CONTEXT || read(CASE_KEY, {}));
    return read(AUDIT_KEY, []).filter(function (event) {
      return !caseIdentity(context) || !event.caseKey || event.caseKey === caseIdentity(context);
    });
  }

  function updateReportReview(id, status, reviewer, notes) {
    const nextStatus = normalizeReviewStatus(status);
    if (nextStatus === "approved" && hasUnresolvedCaseConflicts()) {
      alert("Unresolved case sync conflict. Choose Server Version or Your Version for each conflicting field before approving a report for filing.");
      return null;
    }
    const list = reportList();
    const activeKey = caseIdentity(window.ARC_CASE_CONTEXT || read(CASE_KEY, {}));
    const item = list.find(function (report) {
      if (text(report.id) !== text(id)) return false;
      if (activeKey && caseIdentity(report.caseContext) !== activeKey) return false;
      return true;
    }) || (!activeKey ? list.find(function (report) { return text(report.id) === text(id); }) : null);
    if (!item) return null;
    item.reviewStatus = nextStatus;
    item.reviewedBy = text(reviewer || item.caseContext && item.caseContext.investigator, 240);
    item.reviewNotes = text(notes, 4000);
    item.reviewedAt = new Date().toISOString();
    item.updatedAt = item.reviewedAt;
    item.approvalSynced = false;
    write(REPORT_KEY, list);
    auditEvent("report-review-" + nextStatus, {
      caseContext: item.caseContext,
      reportId: item.id,
      user: item.reviewedBy,
      summary: item.reviewNotes || ("Report marked " + nextStatus + ".")
    });
    const caseId = canonicalCaseId(item.caseContext);
    if (caseId) {
      authFetch("POST", "/api/report-approvals", {
        reportId: item.id,
        caseId: caseId,
        status: nextStatus,
        notes: item.reviewNotes
      }).then(function (response) {
        if (!response || !response.ok) return;
        item.approvalSynced = true;
        write(REPORT_KEY, reportList().map(function (report) {
          return text(report.id) === text(item.id) ? Object.assign({}, report, { approvalSynced: true }) : report;
        }));
      }).catch(function () {});
    }
    return item;
  }

  function caseReports(caseContext) {
    const context = normalizeCase(caseContext || window.ARC_CASE_CONTEXT || read(CASE_KEY, {}));
    const key = caseIdentity(context);
    return reportList().filter(function (report) {
      const reportKey = caseIdentity(report.caseContext);
      return key ? reportKey === key : !reportKey;
    });
  }

  function safeStorageKeys() {
    const output = [];
    try {
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (!key ||
            [REPORT_KEY, CASE_KEY, REVIEW_KEY, AUDIT_KEY].includes(key) ||
            /(?:api|token|secret|key|credential|gemini|openai|courtlistener|firecrawl|newsapi)/i.test(key)) continue;
        output.push(key);
      }
    } catch (error) {}
    return output;
  }

  function scanWorkspace(caseContext) {
    const context = normalizeCase(caseContext || window.ARC_CASE_CONTEXT || read(CASE_KEY, {}));
    const caseKey = caseIdentity(context);
    const summary = {
      pending: 0,
      approved: 0,
      rejected: 0,
      revised: 0,
      findings: 0,
      evidence: 0,
      exhibits: 0,
      missingCitations: 0,
      hashProblems: 0,
      placeholders: 0,
      scannedRecords: 0,
      issues: []
    };
    const seen = new Set();
    const issueLimit = 80;
    const placeholderPattern = /\b(?:TBD|TODO|PLACEHOLDER|LOREM IPSUM|INSERT (?:TEXT|DATE|NAME|CITATION)|UNKNOWN DATE)\b/i;

    function issue(type, label, location) {
      if (summary.issues.length >= issueLimit) return;
      summary.issues.push({ type: type, label: text(label, 300), location: text(location, 240) });
    }

    function walk(value, path, depth) {
      if (summary.scannedRecords > 12000 || depth > 9 || value == null) return;
      if (typeof value === "string") {
        if (placeholderPattern.test(value)) {
          summary.placeholders += 1;
          issue("placeholder", "Unresolved placeholder text", path);
        }
        return;
      }
      if (typeof value !== "object" || seen.has(value)) return;
      seen.add(value);
      summary.scannedRecords += 1;

      if (Array.isArray(value)) {
        value.slice(0, 2500).forEach(function (item, index) { walk(item, path + "[" + index + "]", depth + 1); });
        return;
      }

      const objectText = normalizedToken(
        value.caseId || value.docket || value.docketNumber || value.caseNumber || value.matter || value.caseName || ""
      );
      if (caseKey && objectText && objectText !== caseKey && !objectText.includes(caseKey) && !caseKey.includes(objectText)) {
        return;
      }

      const keys = Object.keys(value);
      const statusKey = keys.find(function (key) { return /^(?:reviewStatus|approvalStatus|review_state|findingStatus)$/i.test(key); });
      const status = statusKey ? normalizeReviewStatus(value[statusKey]) : (
        value.approved === true ? "approved" : value.approved === false && value.reviewed === true ? "rejected" : ""
      );
      if (status && Object.hasOwn(summary, status)) summary[status] += 1;

      const findingLike = keys.some(function (key) {
        return /^(?:finding|findings|connection|connections|conclusion|conclusions|analysis|claim|issue)$/i.test(key);
      }) || /finding|connection|conclusion/i.test(String(value.type || value.kind || ""));
      if (findingLike) {
        summary.findings += 1;
        const citation = value.citation || value.citations || value.sourceCitation || value.sourceRef || value.sourceReference || value.exhibit || value.reference;
        if (!citation || Array.isArray(citation) && !citation.length) {
          summary.missingCitations += 1;
          issue("citation", "Finding or analytical connection may be missing a citation", path);
        }
      }

      const evidenceLike = keys.some(function (key) {
        return /^(?:fileName|filename|originalName|sourceFile|evidenceId|evidenceType)$/i.test(key);
      }) || /evidence|source document|uploaded file/i.test(String(value.type || value.kind || ""));
      if (evidenceLike) {
        summary.evidence += 1;
        const explicitHashKey = keys.find(function (key) { return /^(?:hash|sha256|sha256Hash|digest|fileHash)$/i.test(key); });
        if (explicitHashKey && !text(value[explicitHashKey])) {
          summary.hashProblems += 1;
          issue("hash", "Evidence record has an empty hash", path);
        }
        if (/failed|error|missing/i.test(String(value.hashStatus || value.hash_state || ""))) {
          summary.hashProblems += 1;
          issue("hash", "Evidence hashing did not complete successfully", path);
        }
      }

      if (value.imageDataUrl || value.cropDataUrl || /exhibit/i.test(String(value.type || value.kind || ""))) {
        summary.exhibits += 1;
      }

      keys.slice(0, 400).forEach(function (key) {
        if (/(?:api|token|secret|credential|password)/i.test(key)) return;
        walk(value[key], path ? path + "." + key : key, depth + 1);
      });
    }

    safeStorageKeys().forEach(function (key) {
      let raw = "";
      try { raw = localStorage.getItem(key) || ""; } catch (error) { return; }
      if (!raw || raw.length > 16 * 1024 * 1024) return;
      try { walk(JSON.parse(raw), key, 0); } catch (error) {
        if (placeholderPattern.test(raw.slice(0, 100000))) {
          summary.placeholders += 1;
          issue("placeholder", "Unresolved placeholder text", key);
        }
      }
    });

    caseReports(context).forEach(function (report) {
      const status = normalizeReviewStatus(report.reviewStatus);
      summary[status] += 1;
      const combined = text(report.text) + " " + text(report.html);
      if (placeholderPattern.test(combined)) {
        summary.placeholders += 1;
        issue("placeholder", "Report contains unresolved placeholder text", report.title);
      }
    });

    return summary;
  }

  function getReviewSummary(caseContext) {
    const context = normalizeCase(caseContext || window.ARC_CASE_CONTEXT || read(CASE_KEY, {}));
    const reports = caseReports(context);
    const scan = scanWorkspace(context);
    const counts = reports.reduce(function (output, report) {
      const status = normalizeReviewStatus(report.reviewStatus);
      output[status] += 1;
      return output;
    }, { pending: 0, approved: 0, rejected: 0, revised: 0 });
    return {
      caseContext: context,
      reports: reports,
      counts: counts,
      scan: scan,
      audit: auditList(context)
    };
  }

  function getReleaseChecklist(options) {
    options = options && typeof options === "object" ? options : {};
    const context = normalizeCase(options.caseContext || window.ARC_CASE_CONTEXT || read(CASE_KEY, {}));
    const reports = caseReports(context);
    const scan = scanWorkspace(context);
    const suppliedHtml = text(options.html);
    const combinedText = reports.map(function (report) {
      return text(report.text) + " " + text(report.html);
    }).join(" ") + " " + suppliedHtml;
    const placeholderPattern = /\b(?:TBD|TODO|PLACEHOLDER|LOREM IPSUM|INSERT (?:TEXT|DATE|NAME|CITATION)|UNKNOWN DATE)\b/i;
    const quoteCount = (combinedText.match(/[“”"]+/g) || []).length;
    const attributionPattern = /\b(?:according to|stated|reported|testified|wrote|recorded|source|exhibit|citation|interview|statement)\b/i;
    const citationPattern = /\b(?:exhibit|source|citation|appendix|docket|ecf|transcript|page|p\.)\b|§|\[[A-Z]{1,6}[- ]?\d+/i;
    const approvedReports = reports.filter(function (report) { return normalizeReviewStatus(report.reviewStatus) === "approved"; });
    const rejectedReports = reports.filter(function (report) { return normalizeReviewStatus(report.reviewStatus) === "rejected"; });
    const pendingReports = reports.filter(function (report) {
      return ["pending", "revised"].includes(normalizeReviewStatus(report.reviewStatus));
    });
    const draftPresent = Boolean(options.draftPresent || suppliedHtml || reports.length);
    const versionCreated = reports.some(function (report) { return Number(report.revision || 0) >= 1; }) || Boolean(options.reportVersion);
    const reviewer = text(options.reviewer || context.investigator || approvedReports[0] && approvedReports[0].reviewedBy);
    const items = [
      {
        id: "case-fields",
        label: "Required case identity completed",
        ok: Boolean(context.matter && context.docket),
        severity: "blocker",
        detail: context.matter && context.docket ? "Matter and docket are present." : "Enter the matter name and docket or case number."
      },
      {
        id: "sync-conflicts-resolved",
        label: "Case sync conflicts resolved",
        ok: !hasUnresolvedCaseConflicts(canonicalCaseId(context)),
        severity: "blocker",
        detail: hasUnresolvedCaseConflicts(canonicalCaseId(context))
          ? "Unresolved case sync conflict. Choose Server Version or Your Version before filing or final-report approval."
          : "No unresolved case sync conflicts."
      },
      {
        id: "findings-approved",
        label: "All included reports and findings approved",
        ok: draftPresent && pendingReports.length === 0 && scan.pending === 0 && scan.revised === 0,
        severity: "blocker",
        detail: pendingReports.length || scan.pending || scan.revised
          ? (pendingReports.length + scan.pending + scan.revised) + " item(s) remain pending or revised."
          : "No pending or revised review items were detected."
      },
      {
        id: "quotations-attributed",
        label: "Material quotations attributed",
        ok: quoteCount === 0 || attributionPattern.test(combinedText),
        severity: "warning",
        detail: quoteCount === 0 ? "No quotation marks were detected." : "Attribution language was detected; verify every quotation manually."
      },
      {
        id: "citations-connected",
        label: "Findings connected to supporting sources",
        ok: draftPresent && scan.missingCitations === 0 && citationPattern.test(combinedText),
        severity: "blocker",
        detail: scan.missingCitations
          ? scan.missingCitations + " possible citation gap(s) detected."
          : citationPattern.test(combinedText) ? "Source-reference language was detected." : "No recognizable source references were detected."
      },
      {
        id: "selected-exhibits",
        label: "Only investigator-selected exhibits included",
        ok: !reports.some(function (report) { return report.selectedMediaOnly === false; }),
        severity: "blocker",
        detail: "No report is marked as containing unselected media."
      },
      {
        id: "hashes-complete",
        label: "Evidence hashes completed or externally verified",
        ok: scan.hashProblems === 0,
        severity: "blocker",
        detail: scan.hashProblems ? scan.hashProblems + " evidence hash problem(s) detected." : "No empty or failed evidence hashes were detected."
      },
      {
        id: "placeholders-cleared",
        label: "No unresolved placeholder language",
        ok: !placeholderPattern.test(combinedText) && scan.placeholders === 0,
        severity: "blocker",
        detail: placeholderPattern.test(combinedText) || scan.placeholders ? "Placeholder text requires correction." : "No common placeholder language was detected."
      },
      {
        id: "rejected-excluded",
        label: "Rejected material excluded from the final report",
        ok: rejectedReports.length === 0,
        severity: "blocker",
        detail: rejectedReports.length ? rejectedReports.length + " rejected report(s) remain in the active report series." : "No rejected report is included."
      },
      {
        id: "version-created",
        label: "Report version and revision created",
        ok: draftPresent && versionCreated,
        severity: "blocker",
        detail: versionCreated ? "A report revision is available." : "Create or save the first report revision."
      },
      {
        id: "reviewer-identified",
        label: "Final reviewer identified",
        ok: Boolean(reviewer),
        severity: "blocker",
        detail: reviewer ? "Reviewer: " + reviewer : "Add the assigned investigator or final reviewer."
      }
    ];
    const blockers = items.filter(function (item) { return !item.ok && item.severity === "blocker"; });
    const warnings = items.filter(function (item) { return !item.ok && item.severity === "warning"; });
    return {
      caseContext: context,
      items: items,
      blockers: blockers,
      warnings: warnings,
      ready: blockers.length === 0,
      generatedAt: new Date().toISOString()
    };
  }

  function getWorkflowStatus(caseContext) {
    const context = normalizeCase(caseContext || window.ARC_CASE_CONTEXT || read(CASE_KEY, {}));
    const review = getReviewSummary(context);
    const checklist = getReleaseChecklist({ caseContext: context });
    const exports = review.audit.filter(function (event) {
      return /export|print|finalized/i.test(event.action);
    });
    const evidenceCount = review.scan.evidence + review.scan.exhibits;
    const analysisCount = review.scan.findings + review.reports.length;
    const reviewComplete = review.counts.pending === 0 &&
      review.counts.revised === 0 &&
      review.scan.pending === 0 &&
      review.scan.revised === 0 &&
      (review.counts.approved > 0 || review.scan.approved > 0);
    return [
      {
        id: "case",
        label: "Case Setup",
        state: context.matter && context.docket ? "complete" : context.matter || context.docket ? "attention" : "empty",
        detail: context.matter && context.docket ? "Case identified" : "Matter and docket required"
      },
      {
        id: "evidence",
        label: "Evidence",
        state: evidenceCount > 0 && review.scan.hashProblems === 0 ? "complete" : evidenceCount > 0 ? "attention" : "empty",
        detail: evidenceCount ? evidenceCount + " evidence or exhibit record(s)" : "No evidence indexed"
      },
      {
        id: "analysis",
        label: "Analysis",
        state: analysisCount > 0 ? "complete" : "empty",
        detail: analysisCount ? analysisCount + " analysis or report item(s)" : "No analysis recorded"
      },
      {
        id: "review",
        label: "Investigator Review",
        state: reviewComplete ? "complete" : review.counts.rejected || review.scan.rejected ? "blocked" : analysisCount ? "attention" : "empty",
        detail: reviewComplete ? "Approval gate satisfied" : "Review required"
      },
      {
        id: "builder",
        label: "Report Builder",
        state: review.reports.length ? "complete" : "empty",
        detail: review.reports.length ? review.reports.length + " report series" : "No report revision"
      },
      {
        id: "export",
        label: "Final Export",
        state: exports.length && checklist.ready ? "complete" : checklist.ready ? "attention" : "blocked",
        detail: exports.length ? "Final output recorded" : checklist.ready ? "Ready for final export" : checklist.blockers.length + " blocking check(s)"
      }
    ];
  }

  function injectProductExperience() {
    if (!document.head || !document.body || document.getElementById("arc-product-experience-style")) return;
    const style = document.createElement("style");
    style.id = "arc-product-experience-style";
    style.textContent = [
      ".arc-status-chip{display:inline-flex;align-items:center;gap:5px;border:1px solid #cbd2dc;border-radius:999px;padding:3px 8px;font:700 11px/1.2 system-ui,-apple-system,Segoe UI,sans-serif;text-transform:uppercase;letter-spacing:.04em}",
      ".arc-status-chip[data-status='approved']{border-color:#6aa987;background:#edf8f2;color:#155d3c}",
      ".arc-status-chip[data-status='pending'],.arc-status-chip[data-status='revised']{border-color:#d4a54e;background:#fff8e8;color:#7b5311}",
      ".arc-status-chip[data-status='rejected']{border-color:#c87973;background:#fff0ef;color:#8a2721}",
      "#arc-case-save-status[data-state='saving']{color:#ead49e}",
      "#arc-case-save-status[data-state='saved']{color:#9dceb3}",
      "#arc-case-save-status[data-state='error'],#arc-case-save-status[data-state='conflict']{color:#ffb4ae}",
      ".arc-report-canvas,.report-paper,.rb-print-doc,.rpt-preview,article.report{--arc-report-navy:#0b1726;--arc-report-gold:#b59461}",
      "@media print{.arc-product-standalone,#arc-sync-conflict-banner{display:none!important}.report-paper,.rb-print-doc,.rpt-preview,article.report{box-shadow:none!important}h1,h2,h3{break-after:avoid-page;page-break-after:avoid}figure,tr,img{break-inside:avoid;page-break-inside:avoid}}"
    ].join("");
    document.head.appendChild(style);

    if (window.parent === window && !document.getElementById("frame") && !document.getElementById("arc-product-standalone")) {
      const context = normalizeCase(read(CASE_KEY, {}));
      const bar = document.createElement("div");
      bar.id = "arc-product-standalone";
      bar.className = "arc-product-standalone";
      bar.style.cssText = "position:fixed;left:14px;bottom:14px;z-index:2147482999;max-width:min(520px,calc(100vw - 160px));border:1px solid #b59461;border-radius:8px;padding:8px 11px;background:#0b1726;color:#fff;box-shadow:0 10px 28px rgba(7,17,31,.28);font:600 12px/1.35 system-ui,-apple-system,Segoe UI,sans-serif";
      bar.innerHTML = "<strong style='color:#ead49e'>Active case:</strong> " +
        text(context.matter || "No matter selected", 120).replace(/[<>&]/g, "") +
        (context.docket ? " · " + text(context.docket, 80).replace(/[<>&]/g, "") : "") +
        " <span id='arc-case-save-status' data-state='idle'></span>";
      document.body.appendChild(bar);
    }
    renderSyncConflictBanner();
  }

  function injectPageTools() {
    if (!document.body || document.getElementById("arc-page-tools") || document.querySelector(".rw-actions")) return;
    if (document.getElementById("frame")) return;

    const style = document.createElement("style");
    style.id = "arc-page-tools-style";
    style.textContent = [
      "#arc-page-tools{position:fixed;right:18px;bottom:18px;z-index:2147483000;display:flex;gap:6px;padding:6px;border:1px solid #b59461;border-radius:8px;background:#0b1726;box-shadow:0 10px 28px rgba(7,17,31,.28);font-family:system-ui,-apple-system,Segoe UI,sans-serif}",
      "#arc-page-tools button{min-height:34px;border:1px solid #506078;border-radius:6px;padding:7px 10px;background:#17263a;color:#fff;font:700 12px/1.1 inherit;cursor:pointer}",
      "#arc-page-tools button:hover,#arc-page-tools button:focus-visible{border-color:#ead49e;background:#233650;outline:none}",
      "#arc-page-tools button[aria-pressed='true']{border-color:#ead49e;background:#ead49e;color:#0b1726}",
      ".arc-page-editing [data-arc-editable],.arc-page-editing [data-editable],.arc-page-editing .report-paper,.arc-page-editing .rb-print-doc,.arc-page-editing article.report{outline:2px dashed #b59461;outline-offset:4px}",
      "@media(max-width:640px){#arc-page-tools{right:8px;bottom:8px;max-width:calc(100vw - 16px);flex-wrap:wrap;justify-content:flex-end}#arc-page-tools button{padding:7px 8px}}",
      "@media print{#arc-page-tools,#arc-unified-export-report{display:none!important}}"
    ].join("");
    document.head.appendChild(style);

    const tools = document.createElement("div");
    tools.id = "arc-page-tools";
    tools.setAttribute("aria-label", "Page tools");
    tools.innerHTML = "<button type='button' data-arc-page-action='edit' aria-pressed='false'>Edit</button>" +
      "<button type='button' data-arc-page-action='print'>Print</button>" +
      "<button type='button' data-arc-page-action='html'>Download HTML</button>";
    tools.addEventListener("click", function (event) {
      const button = event.target.closest("[data-arc-page-action]");
      if (!button) return;
      const action = button.dataset.arcPageAction;
      if (action === "print" || action === "html") {
        exportPage(action === "print" ? "print" : "html");
        return;
      }
      const enabled = button.getAttribute("aria-pressed") !== "true";
      button.setAttribute("aria-pressed", String(enabled));
      button.textContent = enabled ? "Finish Edit" : "Edit";
      document.body.classList.toggle("arc-page-editing", enabled);
      const candidates = document.querySelectorAll("[data-arc-editable],[data-editable],.report-paper,.rb-print-doc,article.report,[data-report-output]");
      candidates.forEach(function (node) { node.contentEditable = enabled ? "true" : "false"; });
      document.dispatchEvent(new CustomEvent("arc:edit-request", { detail: { enabled: enabled } }));
      if (enabled && !candidates.length) {
        const field = document.querySelector("textarea:not([disabled]),input:not([type='hidden']):not([disabled])");
        if (field && typeof field.focus === "function") field.focus();
      }
    });
    document.body.appendChild(tools);
    if (!document.body.dataset.arcFloatingPadding) { document.body.dataset.arcFloatingPadding = "1"; document.body.style.paddingBottom = Math.max(parseFloat(getComputedStyle(document.body).paddingBottom) || 0, 84) + "px"; }
    layoutFloatingActions();
  }

  function layoutFloatingActions() {
    const tools = document.getElementById("arc-page-tools");
    const exportButton = document.getElementById("arc-unified-export-report");
    if (!tools && !exportButton) return;
    const configuredBottom = parseFloat(getComputedStyle(document.body).getPropertyValue("--arc-floating-tools-bottom"));
    const bottom = Number.isFinite(configuredBottom) ? Math.max(8, configuredBottom) : 18;
    const compact = window.innerWidth <= 640;
    if (exportButton) {
      exportButton.style.right = (compact ? 8 : 18) + "px";
      exportButton.style.bottom = bottom + "px";
    }
    if (tools) {
      tools.style.right = exportButton && !compact ? (18 + exportButton.offsetWidth + 8) + "px" : (compact ? 8 : 18) + "px";
      tools.style.bottom = (exportButton && compact ? bottom + exportButton.offsetHeight + 8 : bottom) + "px";
    }
  }

  function reportLogicalKey(source, caseContext) {
    const explicit = canonicalLogicalKey(source.logicalKey);
    if (explicit) return explicit;
    const caseKey = normalizedToken(
      caseContext.caseId || caseContext.docket || caseContext.matter || "unfiled"
    );
    const sourceKey = normalizedToken(source.source || source.sourceModule || "");
    const typeKey = normalizedToken(source.reportType || source.title || "report");

    if (
      sourceKey === "chain review" ||
      /^chain[_-]/i.test(text(source.id)) ||
      /chain review|chain integrity|chain of custody/.test(typeKey)
    ) {
      return canonicalLogicalKey("chain-review::" + caseKey);
    }
    return canonicalLogicalKey((sourceKey || typeKey || "report") + "::" + caseKey + "::" + typeKey);
  }

  function normalizeReport(source) {
    source = source && typeof source === "object" && !Array.isArray(source) ? source : {};
    const caseContext = normalizeCase(source.caseContext || window.ARC_CASE_CONTEXT);
    const now = new Date().toISOString();
    return Object.assign({}, source, {
      id: text(source.id, 160) || "r_" + Date.now().toString(36),
      title: text(source.title || "ARC Report", 240),
      reportType: text(source.reportType, 160),
      text: text(source.text),
      html: sanitizeHtml(source.html),
      createdAt: source.createdAt || now,
      updatedAt: source.updatedAt || now,
      source: text(source.source || source.sourceModule || document.title, 240),
      caseContext: caseContext,
      logicalKey: reportLogicalKey(source, caseContext),
      revision: Math.max(1, Number(source.revision || 1)),
      reviewStatus: normalizeReviewStatus(
        source.reviewStatus || source.approvalStatus || (source.approved === true ? "approved" : "pending")
      ),
      reviewedBy: text(source.reviewedBy || source.reviewer, 240),
      reviewedAt: source.reviewedAt || null,
      reviewNotes: text(source.reviewNotes, 4000),
      selectedMediaOnly: source.selectedMediaOnly !== false
    });
  }

  function isSameReportSeries(left, right) {
    if (!left || !right) return false;
    const leftCase = caseIdentity(left.caseContext);
    const rightCase = caseIdentity(right.caseContext);
    if (leftCase !== rightCase) return false;
    if (text(left.id) && text(left.id) === text(right.id)) return true;
    const leftKey = reportLogicalKey(left, normalizeCase(left.caseContext));
    const rightKey = reportLogicalKey(right, normalizeCase(right.caseContext));
    return Boolean(leftKey && rightKey && leftKey === rightKey);
  }

  function dedupeReports(list) {
    const output = [];
    (Array.isArray(list) ? list : [])
      .filter(function (item) { return item && typeof item === "object"; })
      .map(normalizeReport)
      .sort(function (a, b) {
        return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
      })
      .forEach(function (item) {
        const existingIndex = output.findIndex(function (existing) {
          return isSameReportSeries(existing, item);
        });
        if (existingIndex < 0) {
          output.push(item);
          return;
        }
        const existing = output[existingIndex];
        existing.revision = Math.max(
          Number(existing.revision || 1),
          Number(item.revision || 1) + 1
        );
        existing.createdAt = [existing.createdAt, item.createdAt]
          .filter(Boolean)
          .sort()[0] || existing.createdAt;
      });
    return output.slice(0, 100);
  }

  function reportList() {
    return dedupeReports(read(REPORT_KEY, []));
  }

  function saveReport(report) {
    const item = normalizeReport(report);
    const current = reportList();
    const previous = current.find(function (existing) {
      return isSameReportSeries(existing, item);
    });
    if (previous) {
      const changed = text(previous.text) !== text(item.text) ||
        text(previous.html) !== text(item.html) ||
        text(previous.title) !== text(item.title);
      item.id = previous.id;
      item.createdAt = previous.createdAt || item.createdAt;
      item.revision = Number(previous.revision || 1) + 1;
      item.previousTransferId = text(report && report.id, 160);
      if (!changed && !(report && (report.reviewStatus || report.approvalStatus))) {
        item.reviewStatus = normalizeReviewStatus(previous.reviewStatus);
        item.reviewedBy = previous.reviewedBy || item.reviewedBy;
        item.reviewedAt = previous.reviewedAt || item.reviewedAt;
        item.reviewNotes = previous.reviewNotes || item.reviewNotes;
      } else if (changed && normalizeReviewStatus(previous.reviewStatus) === "approved") {
        item.reviewStatus = "revised";
        item.reviewedAt = null;
        item.reviewNotes = "Approval reset because the report changed after review.";
      }
    }
    item.updatedAt = new Date().toISOString();

    const list = current.filter(function (existing) {
      return !isSameReportSeries(existing, item);
    });
    list.unshift(item);
    write(REPORT_KEY, dedupeReports(list));
    auditEvent("report-saved", {
      caseContext: item.caseContext,
      reportId: item.id,
      summary: item.title + " revision " + item.revision + " saved."
    });
    if (window.parent !== window) {
      try { window.parent.postMessage({ type: "ARC_REPORT_SAVED", report: item }, (location.protocol === "http:" || location.protocol === "https:") ? location.origin : "*"); } catch (error) {}
    }
    return item;
  }

  function reportCandidate() {
    const selectors = [
      "#report-editor",
      "#reportOutput",
      "[data-report-output]",
      ".report-paper",
      ".rb-print-doc",
      ".rpt-preview",
      "article.report",
      "main"
    ];
    let root = null;
    for (const selector of selectors) {
      const candidate = document.querySelector(selector);
      if (!candidate) continue;
      if (candidate.tagName === "IFRAME") {
        try {
          root = candidate.contentDocument && candidate.contentDocument.body;
        } catch (error) {}
      } else {
        root = candidate;
      }
      if (root && text(root.innerText || root.textContent).length > 40) break;
      root = null;
    }
    root = root || document.body;
    const heading = root.querySelector && root.querySelector("h1,h2");
    return {
      title: text(heading && heading.textContent || document.title || "ARC Report", 240),
      reportType: "Module Report",
      text: text(root.innerText || root.textContent),
      html: root.innerHTML || "",
      source: normalizedToken(document.title) || "arc-module",
      caseContext: window.ARC_CASE_CONTEXT || normalizeCase(read(CASE_KEY, {}))
    };
  }

  function closeExportDialog() {
    const dialog = document.getElementById("arc-report-export-dialog");
    if (!dialog) return;
    if (typeof dialog.close === "function" && dialog.open) dialog.close();
    dialog.remove();
  }

  function routeReport(destination, report) {
    if (!["generator", "editor"].includes(destination)) return null;
    if (destination === "editor" && hasUnresolvedCaseConflicts()) {
      alert("Unresolved case sync conflict. Resolve every conflicting field before final-report approval or Edit PDF.");
      closeExportDialog();
      return null;
    }
    const saved = saveReport(report || reportCandidate());
    if (destination === "editor" && normalizeReviewStatus(saved.reviewStatus) !== "approved") {
      alert("Investigator approval is required before this report can enter Edit PDF. Open the Review Center, approve the report, and export again.");
      closeExportDialog();
      return null;
    }
    auditEvent("report-route-" + destination, {
      caseContext: saved.caseContext,
      reportId: saved.id,
      destination: destination,
      summary: saved.title
    });
    const request = {
      type: "ARC_ROUTE_REPORT",
      destination: destination,
      reportId: saved.id,
      requestedAt: new Date().toISOString()
    };
    try { sessionStorage.setItem(ROUTE_KEY, JSON.stringify(request)); } catch (error) {}
    if (window.parent !== window) {
      try { window.parent.postMessage(request, (location.protocol === "http:" || location.protocol === "https:") ? location.origin : "*"); } catch (error) {}
    } else {
      document.dispatchEvent(new CustomEvent("arc:route-report", { detail: request }));
      if (/22_Report_Package_Builder\.html$/i.test(location.pathname)) {
        try { window.postMessage(request, (location.protocol === "http:" || location.protocol === "https:") ? location.origin : "*"); } catch (error) {}
      } else if (!document.getElementById("frame")) {
        location.assign(destination === "generator" ? "22_Report_Package_Builder.html" : "19_Final_Client_Report.html");
      }
    }
    closeExportDialog();
    return saved;
  }

  function openReportExport(report) {
    closeExportDialog();
    const payload = report && typeof report === "object" ? report : reportCandidate();
    const dialog = document.createElement("dialog");
    dialog.id = "arc-report-export-dialog";
    dialog.setAttribute("aria-labelledby", "arc-export-title");
    dialog.innerHTML = [
      "<style>",
      "#arc-report-export-dialog{width:min(620px,calc(100vw - 28px));border:1px solid #c8ced8;border-radius:10px;padding:0;color:#172033;box-shadow:0 24px 70px rgba(0,0,0,.35);font-family:system-ui,-apple-system,Segoe UI,sans-serif}",
      "#arc-report-export-dialog::backdrop{background:rgba(3,10,19,.72)}",
      ".arc-export-head{display:flex;align-items:center;gap:12px;padding:18px 20px;border-bottom:1px solid #dce1e8;background:#0b1726;color:#fff}",
      ".arc-export-head h2{margin:0;font-family:Georgia,serif;font-size:21px}.arc-export-head button{margin-left:auto;border:0;background:transparent;color:#fff;font-size:26px;cursor:pointer}",
      ".arc-export-body{padding:20px}.arc-export-body>p{margin:0 0 16px;color:#5f6b7c}",
      ".arc-export-options{display:grid;grid-template-columns:1fr 1fr;gap:12px}",
      ".arc-export-option{display:grid;gap:6px;text-align:left;border:1px solid #c9d0da;border-radius:8px;background:#fff;padding:16px;cursor:pointer;color:#172033}",
      ".arc-export-option:hover{border-color:#b59461;box-shadow:0 8px 22px rgba(7,17,31,.1)}",
      ".arc-export-option b{font-family:Georgia,serif;font-size:18px;color:#0b1726}.arc-export-option span{color:#657184;font-size:13px;line-height:1.45}",
      "@media(max-width:620px){.arc-export-options{grid-template-columns:1fr}}",
      "</style>",
      "<div class='arc-export-head'><h2 id='arc-export-title'>Export Report</h2><button type='button' data-arc-close aria-label='Close'>&times;</button></div>",
      "<div class='arc-export-body'><p>Choose where the current report should continue. The report and active case context will move together. Edit PDF requires investigator approval.</p>",
      "<div class='arc-export-options'>",
      "<button class='arc-export-option' type='button' data-arc-destination='generator'><b>#4 ARC Generator</b><span>Use the report as a source for analysis, synthesis, and court-ready drafting.</span></button>",
      "<button class='arc-export-option' type='button' data-arc-destination='editor'><b>#5 Edit PDF</b><span>Open the editable final-report workspace with a live document preview and export controls.</span></button>",
      "</div></div>"
    ].join("");
    dialog.addEventListener("click", function (event) {
      if (event.target === dialog || event.target.closest("[data-arc-close]")) {
        closeExportDialog();
        return;
      }
      const option = event.target.closest("[data-arc-destination]");
      if (option) routeReport(option.dataset.arcDestination, payload);
    });
    document.body.appendChild(dialog);
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function injectReportExportButton() {
    if (document.getElementById("frame")) return;
    if (document.querySelector(".rw-actions") || document.body.dataset.workspace || document.body.dataset.dashboard) return;
    if (document.getElementById("arc-unified-export-report")) return;
    const button = document.createElement("button");
    button.id = "arc-unified-export-report";
    button.type = "button";
    button.textContent = "Export Report";
    button.setAttribute("aria-label", "Export the current report to ARC Generator or Edit PDF");
    button.style.cssText = [
      "position:fixed",
      "right:18px",
      "bottom:18px",
      "z-index:2147483000",
      "border:1px solid #d6b56f",
      "border-radius:8px",
      "padding:10px 14px",
      "background:#0b1726",
      "color:#fff",
      "font:700 13px/1.2 system-ui,-apple-system,Segoe UI,sans-serif",
      "box-shadow:0 10px 28px rgba(7,17,31,.28)",
      "cursor:pointer"
    ].join(";");
    button.addEventListener("click", function () { openReportExport(); });
    document.body.appendChild(button);
    layoutFloatingActions();
    requestAnimationFrame(layoutFloatingActions);
  }

  const caseSyncPromises = new Map();
  const caseSyncBases = new Map();
  const caseFieldConflicts = new Map();
  const CONFLICT_STORE_KEY = "arc_case_sync_conflicts_v1";
  let caseSaveStatus = { state: "idle", message: "", caseId: "", at: null };

  const CASE_SYNC_FIELDS = [
    "matter", "docket", "court", "clientName", "subjectName", "attorney", "attorneyFirm",
    "charges", "nextCourtDate", "nextCourtEvent", "scope", "incidentDate", "priority",
    "status", "investigator", "notes", "source"
  ];

  function fieldFingerprint(value) {
    if (value == null) return "";
    if (typeof value === "object") {
      try { return JSON.stringify(value); } catch (_) { return String(value); }
    }
    return String(value);
  }

  function rebaseCaseOnConflict(base, local, server) {
    const b = base && typeof base === "object" ? base : {};
    const l = local && typeof local === "object" ? local : {};
    const s = server && typeof server === "object" ? server : {};
    const merged = Object.assign({}, s, l);
    const conflicts = [];

    CASE_SYNC_FIELDS.forEach(function (field) {
      const baseVal = fieldFingerprint(b[field]);
      const localVal = fieldFingerprint(l[field]);
      const serverVal = fieldFingerprint(s[field]);
      const localChanged = localVal !== baseVal;
      const serverChanged = serverVal !== baseVal;
      if (localChanged && serverChanged && localVal !== serverVal) {
        conflicts.push({
          field: field,
          base: b[field] == null ? "" : b[field],
          local: l[field] == null ? "" : l[field],
          server: s[field] == null ? "" : s[field],
          message: "This field was changed in another session. Choose Server Version or Your Version."
        });
        merged[field] = l[field];
        return;
      }
      if (serverChanged && !localChanged) merged[field] = s[field];
      else if (localChanged) merged[field] = l[field];
      else merged[field] = s[field] != null && s[field] !== "" ? s[field] : l[field];
    });

    ["intake", "uploadedFiles"].forEach(function (field) {
      const baseVal = fieldFingerprint(b[field]);
      const localVal = fieldFingerprint(l[field]);
      const serverVal = fieldFingerprint(s[field]);
      const localChanged = localVal !== baseVal;
      const serverChanged = serverVal !== baseVal;
      if (localChanged && serverChanged && localVal !== serverVal) {
        conflicts.push({
          field: field,
          base: b[field] == null ? null : b[field],
          local: l[field] == null ? null : l[field],
          server: s[field] == null ? null : s[field],
          message: "This field was changed in another session. Choose Server Version or Your Version."
        });
        merged[field] = l[field];
      } else if (serverChanged && !localChanged) merged[field] = s[field];
      else if (localChanged) merged[field] = l[field];
      else merged[field] = s[field] != null ? s[field] : l[field];
    });

    merged.caseId = s.caseId || l.caseId || b.caseId || "";
    merged.id = merged.caseId;
    merged.__rev = Number(s.__rev || s.rev || 0) || 0;
    merged.__updatedAt = s.__updatedAt || s.updatedAt || l.__updatedAt || null;
    merged.__updatedBy = s.__updatedBy || s.updatedBy || "";
    merged.updatedAt = l.updatedAt || s.updatedAt || merged.__updatedAt;
    return { merged: merged, conflicts: conflicts, canAutoSave: conflicts.length === 0 };
  }

  function rememberSyncBase(caseRecord) {
    const normalized = normalizeCase(caseRecord || {});
    const id = canonicalCaseId(normalized);
    if (!id) return;
    caseSyncBases.set(id, normalizeCase(normalized));
  }

  function loadPersistedConflicts() {
    try {
      const raw = JSON.parse(localStorage.getItem(CONFLICT_STORE_KEY) || "{}");
      Object.keys(raw || {}).forEach(function (id) {
        if (Array.isArray(raw[id]) && raw[id].length) caseFieldConflicts.set(id, raw[id]);
      });
    } catch (_) {}
  }

  function persistConflicts() {
    const out = {};
    caseFieldConflicts.forEach(function (rows, id) {
      if (rows && rows.length) out[id] = rows;
    });
    try { localStorage.setItem(CONFLICT_STORE_KEY, JSON.stringify(out)); } catch (_) {}
  }

  function getCaseConflicts(caseId) {
    const id = String(caseId || canonicalCaseId(read(CASE_KEY, {})) || "");
    return (id && caseFieldConflicts.get(id)) || [];
  }

  function hasUnresolvedCaseConflicts(caseId) {
    return getCaseConflicts(caseId).length > 0;
  }

  function setCaseConflicts(caseId, conflicts) {
    const id = String(caseId || "");
    if (!id) return;
    if (conflicts && conflicts.length) caseFieldConflicts.set(id, conflicts);
    else caseFieldConflicts.delete(id);
    persistConflicts();
    renderSyncConflictBanner();
    document.dispatchEvent(new CustomEvent("arc:case-sync-conflict", {
      detail: { caseId: id, conflicts: getCaseConflicts(id) }
    }));
  }

  function setCaseSaveStatus(state, message, caseId) {
    caseSaveStatus = {
      state: state || "idle",
      message: message || "",
      caseId: caseId || "",
      at: new Date().toISOString()
    };
    document.dispatchEvent(new CustomEvent("arc:case-save-status", { detail: caseSaveStatus }));
    const chip = document.getElementById("arc-case-save-status");
    if (chip) {
      chip.setAttribute("data-state", caseSaveStatus.state);
      chip.textContent = caseSaveStatus.message || ({
        idle: "",
        saving: "Saving…",
        saved: "Saved",
        error: "Save failed — Retry",
        conflict: "Sync conflict — resolve to continue"
      })[caseSaveStatus.state] || caseSaveStatus.message;
    }
    renderSyncConflictBanner();
  }

  function getCaseSaveStatus() {
    return Object.assign({}, caseSaveStatus);
  }

  function isCaseDirtyAgainstBase(local, base) {
    if (!base) return false;
    return CASE_SYNC_FIELDS.concat(["intake", "uploadedFiles"]).some(function (field) {
      return fieldFingerprint(local[field]) !== fieldFingerprint(base[field]);
    });
  }

  function renderSyncConflictBanner() {
    if (!document.body) return;
    let banner = document.getElementById("arc-sync-conflict-banner");
    const activeId = canonicalCaseId(read(CASE_KEY, {}));
    const conflicts = getCaseConflicts(activeId);
    if (!conflicts.length) {
      if (banner) banner.remove();
      document.documentElement.classList.remove("arc-has-sync-conflict");
      return;
    }
    document.documentElement.classList.add("arc-has-sync-conflict");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "arc-sync-conflict-banner";
      banner.setAttribute("role", "alert");
      document.body.appendChild(banner);
    }
    banner.style.cssText = "position:sticky;top:0;z-index:2147483001;background:#5c1d18;color:#fff;padding:10px 14px;font:600 13px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;border-bottom:2px solid #c9a84c";
    const rows = conflicts.map(function (c, index) {
      const label = String(c.field || "field");
      return "<div style='margin:8px 0;padding:8px;border:1px solid rgba(255,255,255,.25);border-radius:6px'>" +
        "<div>" + label + ": " + String(c.message || "This field was changed in another session. Choose Server Version or Your Version.") + "</div>" +
        "<div style='margin-top:6px;display:flex;gap:8px;flex-wrap:wrap'>" +
        "<button type='button' data-arc-resolve-conflict='" + index + "' data-choice='server' style='cursor:pointer;padding:6px 10px;font-weight:700'>Server Version</button>" +
        "<button type='button' data-arc-resolve-conflict='" + index + "' data-choice='local' style='cursor:pointer;padding:6px 10px;font-weight:700'>Your Version</button>" +
        "</div></div>";
    }).join("");
    banner.innerHTML = "<strong>Unresolved case sync conflict</strong> — filing and final-report approval are blocked until every field is resolved." + rows;
    banner.onclick = function (event) {
      const button = event.target && event.target.closest ? event.target.closest("[data-arc-resolve-conflict]") : null;
      if (!button) return;
      const index = Number(button.getAttribute("data-arc-resolve-conflict"));
      const choice = button.getAttribute("data-choice");
      resolveCaseFieldConflict(activeId, index, choice);
    };
  }

  function resolveCaseFieldConflict(caseId, index, choice) {
    const id = String(caseId || "");
    const conflicts = getCaseConflicts(id).slice();
    const row = conflicts[index];
    if (!row) return;
    const current = normalizeCase(read(CASE_KEY, {}));
    if (canonicalCaseId(current) !== id) return;
    const next = Object.assign({}, current);
    next[row.field] = choice === "server" ? row.server : row.local;
    next.updatedAt = new Date().toISOString();
    conflicts.splice(index, 1);
    write(CASE_KEY, normalizeCase(next));
    applyCaseContext(next);
    setCaseConflicts(id, conflicts);
    if (!conflicts.length) {
      setCaseSaveStatus("saving", "Saving…", id);
      saveCaseAsync(read(CASE_KEY, {})).then(function () {
        setCaseSaveStatus("saved", "Saved", id);
      }).catch(function (error) {
        setCaseSaveStatus(hasUnresolvedCaseConflicts(id) ? "conflict" : "error",
          hasUnresolvedCaseConflicts(id) ? "Sync conflict — resolve to continue" : (error && error.message) || "Save failed — Retry", id);
      });
    }
  }

  function casePayloadFromServer(value) {
    const source = value && typeof value === "object" ? value : {};
    return source.case && typeof source.case === "object" ? source.case : source;
  }

  async function putCaseRevision(caseId, record, expectedRev) {
    const payload = Object.assign({}, record, { id: caseId, expectedRev: expectedRev });
    const response = await authFetch("PUT", "/api/cases/" + encodeURIComponent(caseId), payload);
    return response;
  }

  async function handleCaseConflict(caseId, pendingLocal, responseBody, depth) {
    depth = Number(depth || 0) || 0;
    if (depth > 2) {
      setCaseSaveStatus("conflict", "Sync conflict — resolve to continue", caseId);
      return {
        ok: false,
        conflict: true,
        error: new Error("This case kept changing on the server. Resolve the conflict and retry.")
      };
    }
    const reload = await authFetch("GET", "/api/cases/" + encodeURIComponent(caseId)).catch(function () { return null; });
    if (!reload || !reload.ok) {
      return { ok: false, conflict: true, error: new Error((responseBody && responseBody.message) || "This case changed elsewhere. Reload and retry.") };
    }
    const latestBody = await reload.json().catch(function () { return {}; });
    const serverCase = normalizeCase(casePayloadFromServer(latestBody));
    const base = caseSyncBases.get(caseId) || normalizeCase({});
    const pending = normalizeCase(pendingLocal);
    const rebased = rebaseCaseOnConflict(base, pending, serverCase);

    // Always keep the pending browser edit material; never replace wholesale with server.
    const preserved = normalizeCase(Object.assign({}, rebased.merged, {
      updatedAt: pending.updatedAt || rebased.merged.updatedAt
    }));

    if (!rebased.canAutoSave) {
      write(CASE_KEY, preserved);
      applyCaseContext(preserved);
      setCaseConflicts(caseId, rebased.conflicts);
      setCaseSaveStatus("conflict", "Sync conflict — resolve to continue", caseId);
      document.dispatchEvent(new CustomEvent("arc:case-updated", { detail: preserved }));
      return {
        ok: false,
        conflict: true,
        fieldConflicts: rebased.conflicts,
        error: new Error("This field was changed in another session. Choose Server Version or Your Version.")
      };
    }

    // Auto-merge succeeded: local non-overlapping edits survive, then retry at server rev.
    const retryLocal = normalizeCase(Object.assign({}, preserved, {
      __rev: Number(serverCase.__rev || 0) || 0,
      __updatedAt: serverCase.__updatedAt || serverCase.updatedAt || preserved.__updatedAt,
      __updatedBy: serverCase.__updatedBy || ""
    }));
    write(CASE_KEY, retryLocal);
    applyCaseContext(retryLocal);
    setCaseConflicts(caseId, []);
    const expectedRev = Number(serverCase.__rev || 0) || 0;
    if (!(expectedRev > 0)) {
      return { ok: false, conflict: true, error: new Error("Could not determine the server revision to retry.") };
    }
    const retry = await putCaseRevision(caseId, retryLocal, expectedRev);
    if (!retry) return { ok: false, error: new Error("ARC case server did not respond.") };
    const retryBody = await retry.json().catch(function () { return {}; });
    if (retry.status === 409) {
      return handleCaseConflict(caseId, normalizeCase(read(CASE_KEY, {})), retryBody, depth + 1);
    }
    if (!retry.ok) {
      return { ok: false, error: new Error(retryBody.error || ("Case save failed (HTTP " + retry.status + ")")) };
    }
    const latestLocal = normalizeCase(read(CASE_KEY, {}));
    const baseLocal = canonicalCaseId(latestLocal) === caseId ? latestLocal : retryLocal;
    const merged = normalizeCase(Object.assign({}, baseLocal, {
      caseId: retryBody.id || caseId,
      __rev: retryBody.rev || expectedRev + 1,
      __updatedAt: retryBody.updatedAt || baseLocal.__updatedAt || new Date().toISOString(),
      __updatedBy: retryBody.updatedBy || "",
      updatedAt: baseLocal.updatedAt || retryBody.updatedAt || new Date().toISOString()
    }));
    write(CASE_KEY, merged);
    applyCaseContext(merged);
    rememberSyncBase(merged);
    setCaseConflicts(caseId, []);
    document.dispatchEvent(new CustomEvent("arc:case-updated", { detail: merged }));
    return { ok: true, case: merged, rebased: true };
  }

  function syncCaseToServer(next, previous) {
    const caseId = canonicalCaseId(next);
    if (!caseId) return Promise.resolve({ ok: true, case: next, localOnly: true });
    if (location.protocol === "file:") return Promise.resolve({ ok: true, case: next, localOnly: true });

    if (!caseSyncBases.has(caseId) && previous && canonicalCaseId(previous) === caseId) {
      rememberSyncBase(previous);
    }

    // Serialize per-case syncs: one caseId = one save queue = one server write at a time.
    const prior = caseSyncPromises.get(caseId) || Promise.resolve({ ok: true });
    const promise = prior.catch(function () {
      return { ok: false };
    }).then(async function () {
      if (hasUnresolvedCaseConflicts(caseId)) {
        setCaseSaveStatus("conflict", "Sync conflict — resolve to continue", caseId);
        return {
          ok: false,
          conflict: true,
          fieldConflicts: getCaseConflicts(caseId),
          error: new Error("Unresolved case sync conflict. Choose Server Version or Your Version for each field.")
        };
      }

      let current = normalizeCase(read(CASE_KEY, {}));
      if (canonicalCaseId(current) !== caseId) current = normalizeCase(next);
      const existingRev = Number(current.__rev || current.rev || 0) || 0;
      const method = existingRev > 0 ? "PUT" : "POST";
      const path = method === "PUT" ? "/api/cases/" + encodeURIComponent(caseId) : "/api/cases";
      const payload = Object.assign({}, current, { id: caseId });
      if (method === "PUT") payload.expectedRev = existingRev;

      let response;
      try {
        response = await authFetch(method, path, payload);
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
      }
      if (!response) return { ok: false, error: new Error("ARC case server did not respond.") };
      const body = await response.json().catch(function () { return {}; });
      if (response.status === 409) {
        return handleCaseConflict(caseId, normalizeCase(read(CASE_KEY, {})), body);
      }
      if (!response.ok) return { ok: false, error: new Error(body.error || ("Case save failed (HTTP " + response.status + ")")) };

      const latestLocal = normalizeCase(read(CASE_KEY, {}));
      const base = canonicalCaseId(latestLocal) === caseId ? latestLocal : current;
      const merged = normalizeCase(Object.assign({}, base, {
        caseId: body.id || caseId,
        __rev: body.rev || base.__rev || 1,
        __updatedAt: body.updatedAt || base.__updatedAt || base.updatedAt || new Date().toISOString(),
        __updatedBy: body.updatedBy || "",
        updatedAt: base.updatedAt || body.updatedAt || new Date().toISOString()
      }));
      write(CASE_KEY, merged);
      applyCaseContext(merged);
      rememberSyncBase(merged);
      setCaseConflicts(caseId, []);
      document.dispatchEvent(new CustomEvent("arc:case-updated", { detail: merged }));
      return { ok: true, case: merged };
    });
    caseSyncPromises.set(caseId, promise);
    promise.finally(function () {
      if (caseSyncPromises.get(caseId) === promise) caseSyncPromises.delete(caseId);
    });
    return promise;
  }

  function saveCase(value) {
    const previous = normalizeCase(read(CASE_KEY, {}));
    const incoming = normalizeCase(value || {});
    const previousId = canonicalCaseId(previous);
    const incomingId = canonicalCaseId(incoming);
    let next;
    if (incomingId && previousId && incomingId !== previousId) {
      next = incoming;
    } else if (!incomingId && !previousId && caseIdentity(incoming) && caseIdentity(previous) && caseIdentity(incoming) !== caseIdentity(previous)) {
      next = incoming;
    } else {
      next = normalizeCase(Object.assign({}, previous, value || {}));
    }
    if (!canonicalCaseId(next)) next.caseId = newCaseId();
    next.updatedAt = new Date().toISOString();
    write(CASE_KEY, next);
    const applied = applyCaseContext(next);
    const caseId = canonicalCaseId(next);
    setCaseSaveStatus("saving", "Saving…", caseId);
    syncCaseToServer(next, previous).then(function (result) {
      if (result && result.ok) setCaseSaveStatus("saved", "Saved", caseId);
      else if (result && result.fieldConflicts) setCaseSaveStatus("conflict", "Sync conflict — resolve to continue", caseId);
      else setCaseSaveStatus("error", (result && result.error && result.error.message) || "Save failed — Retry", caseId);
    });
    return applied;
  }

  async function saveCaseAsync(value) {
    const previous = normalizeCase(read(CASE_KEY, {}));
    const incoming = normalizeCase(value || {});
    const previousId = canonicalCaseId(previous);
    const incomingId = canonicalCaseId(incoming);
    let next;
    if (incomingId && previousId && incomingId !== previousId) next = incoming;
    else if (!incomingId && !previousId && caseIdentity(incoming) && caseIdentity(previous) && caseIdentity(incoming) !== caseIdentity(previous)) next = incoming;
    else next = normalizeCase(Object.assign({}, previous, value || {}));
    if (!canonicalCaseId(next)) next.caseId = newCaseId();
    next.updatedAt = new Date().toISOString();
    write(CASE_KEY, next);
    applyCaseContext(next);
    const caseId = canonicalCaseId(next);
    setCaseSaveStatus("saving", "Saving…", caseId);
    const result = await syncCaseToServer(next, previous);
    if (!result || !result.ok) {
      if (result && result.fieldConflicts) setCaseSaveStatus("conflict", "Sync conflict — resolve to continue", caseId);
      else setCaseSaveStatus("error", (result && result.error && result.error.message) || "Save failed — Retry", caseId);
      throw (result && result.error) || new Error("Case could not be saved to ARC.");
    }
    setCaseSaveStatus("saved", "Saved", caseId);
    return normalizeCase(result.case || next);
  }

  async function pollServerCase() {
    const current = normalizeCase(read(CASE_KEY, {}));
    const caseId = canonicalCaseId(current);
    if (!caseId) return;
    if (caseSyncPromises.has(caseId)) return;
    if (hasUnresolvedCaseConflicts(caseId)) return;
    const base = caseSyncBases.get(caseId);
    if (base && isCaseDirtyAgainstBase(current, base)) return;
    try {
      const response = await authFetch("GET", "/api/cases/" + encodeURIComponent(caseId));
      if (!response || !response.ok) return;
      const serverBody = await response.json();
      const serverCase = normalizeCase(casePayloadFromServer(serverBody));
      if (!serverCase || !canonicalCaseId(serverCase)) return;
      const changed = Number(serverCase.__rev || 0) !== Number(current.__rev || 0) ||
        String(serverCase.__updatedAt || serverCase.updatedAt || "") !== String(current.__updatedAt || current.updatedAt || "");
      if (changed) {
        write(CASE_KEY, serverCase);
        applyCaseContext(serverCase);
        rememberSyncBase(serverCase);
        if (channel) channel.postMessage({ type: "case-update", case: serverCase });
        document.dispatchEvent(new CustomEvent("arc:case-updated", { detail: serverCase }));
      }
    } catch (error) {}
  }

  /**
   * Hydrate the active case from a caseId handed in via the URL.
   *
   * The four-page entry layer routes into this workspace as
   *   workspace.html?caseId=<id>&mode=open&returnTo=/cases/
   * and §12 requires the case to be loaded from the server record rather than
   * from whatever happened to be in localStorage. pollServerCase only refreshes
   * a case that is already local, so without this step the workspace would open
   * the previously active case and silently ignore the id it was given.
   *
   * Ordering matters: this runs before the poll loop starts, and it clears the
   * local case first so a failed load can never leave the previous case on
   * screen under the new case's id.
   */
  const CANONICAL_CASE_ID = /^[A-Za-z0-9_-]{4,64}$/;

  function requestedCaseId() {
    try {
      const params = new URLSearchParams(window.location.search);
      const value = params.get("caseId") || params.get("case") || "";
      return CANONICAL_CASE_ID.test(value) ? value : "";
    } catch (error) {
      return "";
    }
  }

  async function hydrateFromUrl() {
    const wanted = requestedCaseId();
    if (!wanted) return false;

    const current = normalizeCase(read(CASE_KEY, {}));
    if (canonicalCaseId(current) === wanted && current.matter && Number(current.__rev || 0) > 0) return true;

    // Different case than the one held locally: drop it before fetching so no
    // field from the previous matter can survive into this one.
    write(CASE_KEY, {});
    applyCaseContext({});

    let response;
    try {
      response = await authFetch("GET", "/api/cases/" + encodeURIComponent(wanted));
    } catch (error) {
      response = null;
    }
    if (!response || !response.ok) {
      // §19: fail visibly and keep a safe return route. Never silently redirect
      // and never fall back to whichever case was open before.
      document.dispatchEvent(new CustomEvent("arc:case-hydration-failed", {
        detail: {
          caseId: wanted,
          status: response ? response.status : 0,
          message: response && response.status === 404
            ? "That case was not found, or you do not have access to it."
            : "The case could not be loaded from the ARC server."
        }
      }));
      return false;
    }

    const responseBody = await response.json().catch(function () { return null; });
    const serverCase = casePayloadFromServer(responseBody);
    if (!serverCase || canonicalCaseId(normalizeCase(serverCase)) !== wanted) {
      document.dispatchEvent(new CustomEvent("arc:case-hydration-failed", {
        detail: { caseId: wanted, status: 0, message: "The ARC server returned a different case than the one requested." }
      }));
      return false;
    }

    write(CASE_KEY, normalizeCase(serverCase));
    applyCaseContext(serverCase);
    rememberSyncBase(serverCase);
    document.dispatchEvent(new CustomEvent("arc:case-updated", { detail: serverCase }));
    return true;
  }

  /** Where "back" goes from the workspace. §20. Same-origin paths only. */
  function returnTo() {
    try {
      const value = new URLSearchParams(window.location.search).get("returnTo") || "";
      return /^(?:\.?\.?\/)?[A-Za-z0-9_\-/?=&.%]+$/.test(value) ? value : "./cases/index.html";
    } catch (error) {
      return "./cases/index.html";
    }
  }

  const hydration = hydrateFromUrl();

  if (typeof setInterval === "function") {
    // Do not start polling until the URL hand-off has settled, or the poll
    // would race the hydration and could re-write the outgoing case.
    hydration.then(function () {
      setInterval(pollServerCase, 5000);
    });
    setInterval(flushPendingAudit, 30000);
  }

  window.addEventListener("message", function (event) {
    if (event.source !== window && (window.parent === window || event.source !== window.parent)) return;
    const data = event.data && typeof event.data === "object" ? event.data : {};
    if (data.type === "ARC_EXPORT") exportPage(data.kind);
    if (data.type === "ARC_OPEN_REPORT_EXPORT") openReportExport(data.report);
    if (data.type === "ARC_CASE_CONTEXT") applyCaseContext(data.value);
  });

  if (channel) channel.addEventListener("message", function (event) {
    const data = event.data || {};
    if (data.type === "storage" && data.key === CASE_KEY) applyCaseContext(data.value || read(CASE_KEY, {}));
  });

  window.addEventListener("storage", function (event) {
    if (event.key === CASE_KEY) applyCaseContext(read(CASE_KEY, {}));
  });
  document.addEventListener("focusin", function (event) {
    const field = event.target;
    if (!field || !("value" in field) || String(field.value || "").trim() || typeof field.matches !== "function") return;
    const context = window.ARC_CASE_CONTEXT || normalizeCase(read(CASE_KEY, {}));
    let value = "";
    Object.keys(FIELD_SELECTORS).some(function (key) {
      if (!FIELD_SELECTORS[key].some(function (selector) { return field.matches(selector); })) return false;
      value = context[key] || "";
      return true;
    });
    if (!value) return;
    field.value = value;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  });
  window.addEventListener("beforeprint", ensurePrintHeader);
  window.addEventListener("resize", layoutFloatingActions);

  // Atomic "clear active case and start new case" operation.
  // Clears the active-case pointer and creates a fresh context from the schema
  // default with a new canonical id. NEVER merges with the prior case.
  // Dispatches "arc:case-new" so every module can clear its case-bound caches.
  function beginNewCase(seed) {
    const priorId = canonicalCaseId(read(CASE_KEY, {}));
    if (priorId) {
      caseSyncBases.delete(priorId);
      setCaseConflicts(priorId, []);
    }
    write(CASE_KEY, {});
    const fresh = normalizeCase(Object.assign({
      caseId: newCaseId(),
      status: "intake"
    }, seed && typeof seed === "object" ? seed : {}));
    if (!canonicalCaseId(fresh)) fresh.caseId = newCaseId();
    fresh.updatedAt = new Date().toISOString();
    write(CASE_KEY, fresh);
    applyCaseContext(fresh);
    document.dispatchEvent(new CustomEvent("arc:case-new", { detail: fresh }));
    if (channel) channel.postMessage({ type: "case-new", case: fresh });
    auditEvent("case-created", { caseContext: fresh, summary: "New case started (atomic reset)." });
    return fresh;
  }


  function activeCaseId() {
    return canonicalCaseId(window.ARC_CASE_CONTEXT || read(CASE_KEY, {}));
  }

  function scopedList(key) {
    const caseId = activeCaseId();
    if (!caseId) return [];
    return read(key, []).filter(function (item) { return text(item.caseId) === text(caseId); });
  }

  function upsertScoped(key, record, type) {
    const caseId = activeCaseId();
    if (!caseId) throw new Error("Select or create a case first.");
    const now = new Date().toISOString();
    const list = read(key, []);
    const next = Object.assign({}, record || {}, {
      id: text(record && record.id) || ((type || "record") + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)),
      caseId: caseId,
      updatedAt: now
    });
    if (!next.createdAt) next.createdAt = now;
    const index = list.findIndex(function (item) { return text(item.id) === text(next.id) && text(item.caseId) === text(caseId); });
    if (index >= 0) list[index] = next; else list.push(next);
    write(key, list);
    auditEvent((type || "record") + "-saved", { caseKey: caseId, summary: next.title || next.question || next.statement || next.id });
    document.dispatchEvent(new CustomEvent("arc:" + (type || "record") + "-updated", { detail: next }));
    return next;
  }

  function removeScoped(key, id, type) {
    const caseId = activeCaseId();
    const list = read(key, []);
    write(key, list.filter(function (item) {
      return !(text(item.caseId) === text(caseId) && text(item.id) === text(id));
    }));
    auditEvent((type || "record") + "-deleted", { caseKey: caseId, summary: text(id) });
  }

  function defaultStageState(stage) {
    return {
      stage: stage.id,
      key: stage.key,
      label: stage.label,
      status: "not_started",
      requirements: {},
      blockers: [],
      completedBy: null,
      completedAt: null,
      updatedAt: new Date().toISOString()
    };
  }

  function getStageStates() {
    const caseId = activeCaseId();
    if (!caseId) return STAGES.map(defaultStageState);
    const all = read(WORKFLOW_KEY, {});
    const saved = all[caseId] || {};
    return STAGES.map(function (stage) {
      return Object.assign(defaultStageState(stage), saved[stage.key] || {});
    });
  }

  function setStageState(stageKey, patch) {
    const caseId = activeCaseId();
    if (!caseId) throw new Error("Select or create a case first.");
    const stage = STAGES.find(function (item) { return item.key === stageKey || String(item.id) === String(stageKey); });
    if (!stage) throw new Error("Unknown ARC stage: " + stageKey);
    const all = read(WORKFLOW_KEY, {});
    const caseStates = all[caseId] || {};
    const current = Object.assign(defaultStageState(stage), caseStates[stage.key] || {});
    const next = Object.assign({}, current, patch || {}, { updatedAt: new Date().toISOString() });
    if (next.status === "complete" && !next.completedAt) next.completedAt = next.updatedAt;
    if (next.status !== "complete") next.completedAt = null;
    caseStates[stage.key] = next;
    all[caseId] = caseStates;
    write(WORKFLOW_KEY, all);
    document.dispatchEvent(new CustomEvent("arc:stage-updated", { detail: next }));
    return next;
  }

  function getOpenQuestions() { return scopedList(OPEN_QUESTIONS_KEY); }
  function saveOpenQuestion(record) {
    const next = Object.assign({ status: "open", priority: "medium", originRefs: [], resolution: "", resolutionReason: "" }, record || {});
    return upsertScoped(OPEN_QUESTIONS_KEY, next, "open-question");
  }
  function deleteOpenQuestion(id) { return removeScoped(OPEN_QUESTIONS_KEY, id, "open-question"); }

  function getFieldRecords() { return scopedList(FIELD_RECORDS_KEY); }
  function saveFieldRecord(record) {
    return upsertScoped(FIELD_RECORDS_KEY, Object.assign({ status: "needs_review", relationships: [], sourceLinks: [] }, record || {}), "field-record");
  }
  function deleteFieldRecord(id) { return removeScoped(FIELD_RECORDS_KEY, id, "field-record"); }

  function getSupplementalRecords() { return scopedList(SUPPLEMENTAL_KEY).sort(function (a,b) { return String(a.receivedAt||a.createdAt).localeCompare(String(b.receivedAt||b.createdAt)); }); }
  function appendSupplementalRecord(record) {
    const next = Object.assign({ status: "needs_review", revision: 1, appendOnly: true, sourceLinks: [] }, record || {});
    delete next.id;
    return upsertScoped(SUPPLEMENTAL_KEY, next, "supplemental-record");
  }

  function getFindings() { return scopedList(FINDINGS_KEY); }
  function validateSourceLink(link) {
    if (!link || typeof link !== "object") return false;
    const hasSource = !!text(link.sourceId);
    const hasIntegrity = !!text(link.sha256) || !!text(link.interviewId);
    const hasLocator = Number.isFinite(Number(link.page)) || !!text(link.timeStart) || !!text(link.locator);
    return hasSource && hasIntegrity && hasLocator;
  }
  function validateFinding(record) {
    const links = Array.isArray(record && record.sourceLinks) ? record.sourceLinks : [];
    const errors = [];
    if (!text(record && record.statement)) errors.push("Finding statement is required.");
    if (!text(record && record.classification)) errors.push("Epistemic classification is required.");
    if (!links.length) errors.push("At least one source link is required.");
    links.forEach(function (link, index) {
      if (!validateSourceLink(link)) errors.push("Source link " + (index + 1) + " requires sourceId, SHA-256 or interviewId, and a page/time locator.");
    });
    return { valid: errors.length === 0, errors: errors };
  }
  function saveFinding(record) {
    const validation = validateFinding(record || {});
    const next = Object.assign({ status: "needs_review", sourceLinks: [] }, record || {}, { validation: validation });
    if (!validation.valid && next.status === "approved") next.status = "needs_review";
    return upsertScoped(FINDINGS_KEY, next, "finding");
  }
  function deleteFinding(id) { return removeScoped(FINDINGS_KEY, id, "finding"); }
  function approvedFindings() {
    return getFindings().filter(function (finding) {
      return finding.status === "approved" && validateFinding(finding).valid;
    });
  }
  function findingsReleaseCheck() {
    const findings = getFindings();
    const invalid = findings.filter(function (finding) { return !validateFinding(finding).valid; });
    const pending = findings.filter(function (finding) { return finding.status !== "approved"; });
    return {
      ready: findings.length > 0 && invalid.length === 0 && pending.length === 0,
      total: findings.length,
      invalid: invalid.map(function (item) { return item.id; }),
      pending: pending.map(function (item) { return item.id; }),
      blockers: []
        .concat(findings.length ? [] : ["No findings have been created."])
        .concat(invalid.length ? [invalid.length + " finding(s) have invalid or missing source linkage."] : [])
        .concat(pending.length ? [pending.length + " finding(s) are not approved."] : [])
    };
  }


  function installUniversalFileDrop() {
    if (window.__ARC_UNIVERSAL_DROP_INSTALLED) return;
    window.__ARC_UNIVERSAL_DROP_INSTALLED = true;
    const style = document.createElement("style");
    style.id = "arc-universal-drop-style";
    style.textContent = ".arc-universal-drop-target{position:relative}.arc-universal-drop-target.arc-drop-active{outline:2px dashed #C9A84C!important;outline-offset:4px!important;background-image:linear-gradient(rgba(201,168,76,.06),rgba(201,168,76,.06))}.arc-universal-drop-target.arc-drop-active::after{content:'Drop files here';position:absolute;right:10px;top:10px;z-index:2147482500;background:#0b1726;color:#f2d47b;border:1px solid #C9A84C;border-radius:7px;padding:6px 9px;font:700 11px/1.2 system-ui;pointer-events:none}";
    document.head.appendChild(style);

    function bindInput(input) {
      if (!input || input.dataset.arcDropBound === "1") return;
      input.dataset.arcDropBound = "1";
      const nativeDrop = input.closest('[id*="drop" i],[class*="dropzone" i],[class~="drop-zone"]');
      if (nativeDrop) return;
      let target = input.closest('label,.upload-row,.upload-card,.file-row,.field,.control,.card,.panel,.row,section');
      if (!target || target === document.body) target = input.parentElement;
      if (!target) return;
      target.classList.add("arc-universal-drop-target");
      let depth = 0;
      target.addEventListener("dragenter", function (event) {
        if (event.dataTransfer && Array.from(event.dataTransfer.types || []).includes("Files")) {
          event.preventDefault(); depth++; target.classList.add("arc-drop-active");
        }
      });
      target.addEventListener("dragover", function (event) {
        if (event.dataTransfer && Array.from(event.dataTransfer.types || []).includes("Files")) {
          event.preventDefault(); event.dataTransfer.dropEffect = "copy";
        }
      });
      target.addEventListener("dragleave", function () { depth = Math.max(0, depth - 1); if (!depth) target.classList.remove("arc-drop-active"); });
      target.addEventListener("drop", function (event) {
        depth = 0; target.classList.remove("arc-drop-active");
        if (!event.dataTransfer || !event.dataTransfer.files || !event.dataTransfer.files.length) return;
        event.preventDefault(); event.stopPropagation();
        try {
          const transfer = new DataTransfer();
          const incoming = Array.from(event.dataTransfer.files);
          const chosen = input.multiple ? incoming : incoming.slice(0, 1);
          chosen.forEach(function (file) { transfer.items.add(file); });
          input.files = transfer.files;
          input.dispatchEvent(new Event("change", { bubbles: true }));
        } catch (error) {
          console.error("ARC drag/drop could not assign the file input", error);
        }
      });
    }

    function scan(root) {
      if (!root || !root.querySelectorAll) return;
      if (root.matches && root.matches('input[type="file"]')) bindInput(root);
      root.querySelectorAll('input[type="file"]').forEach(bindInput);
    }

    scan(document);
    if (typeof MutationObserver === "function") {
      const observer = new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) { mutation.addedNodes.forEach(function (node) { if (node.nodeType === 1) scan(node); }); });
      });
      observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
    }
  }


  window.ARCUnified = {
    REPORT_KEY: REPORT_KEY,
    requestedCaseId: requestedCaseId,
    hydrateFromUrl: function () { return hydration; },
    returnTo: returnTo,
    CASE_KEY: CASE_KEY,
    getCase: function () { return normalizeCase(read(CASE_KEY, {})); },
    saveCase: saveCase,
    saveCaseAsync: saveCaseAsync,
    getCaseSaveStatus: getCaseSaveStatus,
    hasUnresolvedCaseConflicts: hasUnresolvedCaseConflicts,
    getCaseConflicts: getCaseConflicts,
    resolveCaseFieldConflict: resolveCaseFieldConflict,
    rebaseCaseOnConflict: rebaseCaseOnConflict,
    beginNewCase: beginNewCase,
    canonicalCaseId: canonicalCaseId,
    newCaseId: newCaseId,
    clearCase: function () { write(CASE_KEY, {}); return applyCaseContext({}); },
    saveReport: saveReport,
    getReports: reportList,
    getCaseReports: caseReports,
    deleteReport: function (id) {
      const activeKey = caseIdentity(window.ARC_CASE_CONTEXT || read(CASE_KEY, {}));
      return write(REPORT_KEY, reportList().filter(function (item) {
        if (text(item.id) !== text(id)) return true;
        if (activeKey && caseIdentity(item.caseContext) !== activeKey) return true;
        return false;
      }));
    },
    clearReports: function (caseContext) {
      const key = caseIdentity(caseContext || window.ARC_CASE_CONTEXT || read(CASE_KEY, {}));
      if (!key) return write(REPORT_KEY, []);
      return write(REPORT_KEY, reportList().filter(function (item) {
        return caseIdentity(item.caseContext) !== key;
      }));
    },
    exportPage: exportPage,
    openReportExport: openReportExport,
    routeReport: routeReport,
    captureReport: reportCandidate,
    applyCaseContext: applyCaseContext,
    updateReportReview: updateReportReview,
    getReviewSummary: getReviewSummary,
    getReleaseChecklist: getReleaseChecklist,
    getWorkflowStatus: getWorkflowStatus,
    auditEvent: auditEvent,
    getAudit: auditList,
    normalizeReviewStatus: normalizeReviewStatus,
    REVIEW_KEY: REVIEW_KEY,
    AUDIT_KEY: AUDIT_KEY,
    ROUTE_KEY: ROUTE_KEY,
    STAGES: STAGES,
    WORKFLOW_KEY: WORKFLOW_KEY,
    OPEN_QUESTIONS_KEY: OPEN_QUESTIONS_KEY,
    FINDINGS_KEY: FINDINGS_KEY,
    FIELD_RECORDS_KEY: FIELD_RECORDS_KEY,
    SUPPLEMENTAL_KEY: SUPPLEMENTAL_KEY,
    getStageStates: getStageStates,
    setStageState: setStageState,
    getOpenQuestions: getOpenQuestions,
    saveOpenQuestion: saveOpenQuestion,
    deleteOpenQuestion: deleteOpenQuestion,
    getFieldRecords: getFieldRecords,
    saveFieldRecord: saveFieldRecord,
    deleteFieldRecord: deleteFieldRecord,
    getSupplementalRecords: getSupplementalRecords,
    appendSupplementalRecord: appendSupplementalRecord,
    getFindings: getFindings,
    saveFinding: saveFinding,
    deleteFinding: deleteFinding,
    validateFinding: validateFinding,
    approvedFindings: approvedFindings,
    findingsReleaseCheck: findingsReleaseCheck
  };

  loadPersistedConflicts();
  applyCaseContext(read(CASE_KEY, {}));
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      injectProductExperience();
      installUniversalFileDrop();
      injectPageTools();
      injectReportExportButton();
      renderSyncConflictBanner();
    }, { once: true });
  } else {
    injectProductExperience();
    installUniversalFileDrop();
    injectPageTools();
    injectReportExportButton();
    renderSyncConflictBanner();
  }
  if (window.parent !== window) {
    try { window.parent.postMessage({ type: "ARC_MODULE_READY", title: document.title }, (location.protocol === "http:" || location.protocol === "https:") ? location.origin : "*"); } catch (error) {}
  }
})();

;(function () {
  "use strict";
  if (!window.ARCUnified || window.ARCUnified.investigationSchemaVersion === 3) return;

  var API = window.ARCUnified;
  var KEYS = {
    evidence: "arc_evidence_records_v3",
    questions: "arc_open_questions_v3",
    field: "arc_field_records_v3",
    supplemental: "arc_supplemental_records_v3",
    findings: "arc_findings_v3",
    workflow: "arc_investigation_workflow_v3"
  };
  var QUESTION_STATUSES = ["open", "assigned", "resolved", "unresolved", "unobtainable", "reopened"];
  var RECORD_STATUSES = ["needs_review", "approved", "rejected", "revised"];
  var STAGE_STATUSES = ["not_started", "in_progress", "needs_review", "blocked", "complete", "reopened"];

  function now() { return new Date().toISOString(); }
  function clean(value, max) {
    var result = String(value == null ? "" : value).trim();
    return typeof max === "number" ? result.slice(0, max) : result;
  }
  function uuid(prefix) {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return prefix + "_" + window.crypto.randomUUID();
    return prefix + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
  }
  function read(key, fallback) {
    try {
      var parsed = JSON.parse(localStorage.getItem(key) || "null");
      return parsed == null ? fallback : parsed;
    } catch (_) { return fallback; }
  }
  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
    return value;
  }
  function activeCaseId() {
    return clean(API.canonicalCaseId(API.getCase && API.getCase()));
  }
  function requireCaseId() {
    var id = activeCaseId();
    if (!id) throw new Error("Select or create a case before saving investigation records.");
    return id;
  }
  function scoped(key) {
    var caseId = activeCaseId();
    if (!caseId) return [];
    return read(key, []).filter(function (record) { return clean(record.caseId) === caseId; });
  }
  function all(key) { return read(key, []); }
  function replaceRecord(key, record) {
    var records = all(key);
    var index = records.findIndex(function (item) {
      return clean(item.id) === clean(record.id) && clean(item.caseId) === clean(record.caseId);
    });
    if (index >= 0) records[index] = record; else records.push(record);
    write(key, records);
    return record;
  }
  function findScoped(key, id) {
    return scoped(key).find(function (item) { return clean(item.id) === clean(id); }) || null;
  }
  function removeScoped(key, id) {
    var caseId = requireCaseId();
    var before = all(key);
    var after = before.filter(function (item) {
      return !(clean(item.id) === clean(id) && clean(item.caseId) === caseId);
    });
    write(key, after);
    return before.length !== after.length;
  }
  function isSha256(value) { return /^[a-f0-9]{64}$/i.test(clean(value)); }
  function audit(action, payload) {
    if (typeof API.auditEvent === "function") {
      try { API.auditEvent(action, Object.assign({ caseId: activeCaseId() }, payload || {})); } catch (_) {}
    }
  }

  function saveEvidence(record) {
    var caseId = requireCaseId();
    var previous = record && record.id ? findScoped(KEYS.evidence, record.id) : null;
    var next = Object.assign({}, previous || {}, record || {});
    next.id = previous ? previous.id : uuid("evidence");
    next.caseId = caseId;
    next.title = clean(next.title, 240);
    next.category = clean(next.category || "other", 80);
    next.receivedFrom = clean(next.receivedFrom, 240);
    next.receivedAt = clean(next.receivedAt);
    next.sourceId = clean(next.sourceId || next.id, 160);
    next.sha256 = clean(next.sha256).toLowerCase();
    next.pageCount = Number(next.pageCount) || null;
    next.mediaType = clean(next.mediaType, 120);
    next.ocrStatus = clean(next.ocrStatus || "not_requested", 40);
    next.custodyStatus = clean(next.custodyStatus || "not_reviewed", 40);
    next.notes = clean(next.notes, 5000);
    next.status = RECORD_STATUSES.indexOf(next.status) >= 0 ? next.status : "needs_review";
    next.provenance = Object.assign({
      sourceId: next.sourceId,
      sha256: next.sha256,
      page: null,
      timeStart: "",
      timeEnd: "",
      cropRatio: null
    }, next.provenance || {});
    next.validation = {
      valid: !!next.title && !!next.receivedFrom && !!next.receivedAt && isSha256(next.sha256),
      errors: []
    };
    if (!next.title) next.validation.errors.push("Title is required.");
    if (!next.receivedFrom) next.validation.errors.push("Source of receipt is required.");
    if (!next.receivedAt) next.validation.errors.push("Date received is required.");
    if (!isSha256(next.sha256)) next.validation.errors.push("A 64-character SHA-256 hash is required.");
    if (!next.validation.valid && next.status === "approved") next.status = "needs_review";
    next.createdAt = previous ? previous.createdAt : now();
    next.updatedAt = now();
    next.revision = previous ? Number(previous.revision || 1) + 1 : 1;
    replaceRecord(KEYS.evidence, next);
    audit("evidence.saved", { recordId: next.id, status: next.status });
    return next;
  }

  function saveQuestion(record) {
    var caseId = requireCaseId();
    var previous = record && record.id ? findScoped(KEYS.questions, record.id) : null;
    var next = Object.assign({}, previous || {}, record || {});
    next.id = previous ? previous.id : uuid("question");
    next.caseId = caseId;
    next.question = clean(next.question, 2000);
    next.originType = clean(next.originType || "analysis", 80);
    next.originRefs = Array.isArray(next.originRefs) ? next.originRefs.map(function (x) { return clean(x, 160); }).filter(Boolean) : [];
    next.priority = ["low", "medium", "high", "critical"].indexOf(next.priority) >= 0 ? next.priority : "medium";
    next.status = QUESTION_STATUSES.indexOf(next.status) >= 0 ? next.status : "open";
    next.assignedTo = clean(next.assignedTo, 160);
    next.resolution = clean(next.resolution, 5000);
    next.resolutionReason = clean(next.resolutionReason, 2000);
    next.resolvedByRecordIds = Array.isArray(next.resolvedByRecordIds) ? next.resolvedByRecordIds : [];
    next.createdAt = previous ? previous.createdAt : now();
    next.updatedAt = now();
    next.revision = previous ? Number(previous.revision || 1) + 1 : 1;
    if (!next.question) throw new Error("Open question text is required.");
    if (["resolved", "unresolved", "unobtainable"].indexOf(next.status) >= 0 && !next.resolutionReason) {
      throw new Error("A resolution reason is required for the selected status.");
    }
    replaceRecord(KEYS.questions, next);
    audit("question.saved", { recordId: next.id, status: next.status });
    return next;
  }

  function saveFieldAct(record) {
    var caseId = requireCaseId();
    var previous = record && record.id ? findScoped(KEYS.field, record.id) : null;
    var next = Object.assign({}, previous || {}, record || {});
    next.id = previous ? previous.id : uuid("field");
    next.caseId = caseId;
    next.type = ["witness", "interview", "site_visit", "records_request", "investigator_note"].indexOf(next.type) >= 0 ? next.type : "investigator_note";
    next.title = clean(next.title, 240);
    next.occurredAt = clean(next.occurredAt);
    next.details = clean(next.details, 10000);
    next.questionIds = Array.isArray(next.questionIds) ? next.questionIds.map(function (x) { return clean(x, 160); }).filter(Boolean) : [];
    next.assetRelationships = Array.isArray(next.assetRelationships) ? next.assetRelationships : [];
    next.sourceLinks = Array.isArray(next.sourceLinks) ? next.sourceLinks : [];
    next.status = RECORD_STATUSES.indexOf(next.status) >= 0 ? next.status : "needs_review";
    next.createdAt = previous ? previous.createdAt : now();
    next.updatedAt = now();
    next.revision = previous ? Number(previous.revision || 1) + 1 : 1;
    if (!next.title) throw new Error("Field record title is required.");
    if (!next.occurredAt) throw new Error("Field record date/time is required.");
    replaceRecord(KEYS.field, next);
    next.questionIds.forEach(function (questionId) {
      var question = findScoped(KEYS.questions, questionId);
      if (!question) return;
      question.resolvedByRecordIds = Array.from(new Set((question.resolvedByRecordIds || []).concat(next.id)));
      if (question.status === "open") question.status = "assigned";
      question.updatedAt = now();
      replaceRecord(KEYS.questions, question);
    });
    audit("field.saved", { recordId: next.id, type: next.type, status: next.status });
    return next;
  }

  function appendSupplemental(record) {
    var caseId = requireCaseId();
    var next = Object.assign({}, record || {});
    next.id = uuid("supplemental");
    next.seriesId = clean(next.seriesId) || uuid("series");
    next.caseId = caseId;
    next.type = clean(next.type || "late_discovery", 80);
    next.title = clean(next.title, 240);
    next.receivedAt = clean(next.receivedAt);
    next.triggeringEvent = clean(next.triggeringEvent, 500);
    next.notes = clean(next.notes, 10000);
    next.sha256 = clean(next.sha256).toLowerCase();
    next.sourceId = clean(next.sourceId || next.id, 160);
    next.supersedes = clean(next.supersedes, 160);
    var series = scoped(KEYS.supplemental).filter(function (item) { return item.seriesId === next.seriesId; });
    next.revision = series.reduce(function (max, item) { return Math.max(max, Number(item.revision || 0)); }, 0) + 1;
    next.status = "needs_review";
    next.appendOnly = true;
    next.createdAt = now();
    next.updatedAt = next.createdAt;
    if (!next.title || !next.receivedAt) throw new Error("Supplemental title and date received are required.");
    replaceRecord(KEYS.supplemental, next);
    audit("supplemental.appended", { recordId: next.id, seriesId: next.seriesId, revision: next.revision });
    return next;
  }

  function validSourceLink(link) {
    if (!link || typeof link !== "object") return false;
    var sourceId = clean(link.sourceId);
    var interviewId = clean(link.interviewId);
    var hash = clean(link.sha256);
    var locator = clean(link.locator) || clean(link.timeStart) || clean(link.timeEnd) ||
      (Number.isFinite(Number(link.page)) && Number(link.page) > 0 ? String(link.page) : "");
    return !!sourceId && (!!interviewId || isSha256(hash)) && !!locator;
  }
  function validateFinding(record) {
    var errors = [];
    var links = Array.isArray(record && record.sourceLinks) ? record.sourceLinks : [];
    if (!clean(record && record.statement)) errors.push("Finding statement is required.");
    if (["verified_fact", "allegation", "witness_statement", "observation", "investigator_analysis"].indexOf(clean(record && record.classification)) < 0) {
      errors.push("A valid epistemic classification is required.");
    }
    if (!links.length) errors.push("At least one source link is required.");
    links.forEach(function (link, index) {
      if (!validSourceLink(link)) errors.push("Source link " + (index + 1) + " requires sourceId, SHA-256 or interviewId, and a page/time/other locator.");
    });
    return { valid: errors.length === 0, errors: errors };
  }
  function saveFinding(record) {
    var caseId = requireCaseId();
    var previous = record && record.id ? findScoped(KEYS.findings, record.id) : null;
    var next = Object.assign({}, previous || {}, record || {});
    next.id = previous ? previous.id : uuid("finding");
    next.caseId = caseId;
    next.classification = clean(next.classification);
    next.statement = clean(next.statement, 10000);
    next.significance = clean(next.significance, 5000);
    next.sourceLinks = Array.isArray(next.sourceLinks) ? next.sourceLinks : [];
    next.status = RECORD_STATUSES.indexOf(next.status) >= 0 ? next.status : "needs_review";
    next.createdAt = previous ? previous.createdAt : now();
    next.updatedAt = now();
    next.revision = previous ? Number(previous.revision || 1) + 1 : 1;
    next.validation = validateFinding(next);
    if (!next.validation.valid && next.status === "approved") next.status = "needs_review";
    replaceRecord(KEYS.findings, next);
    audit("finding.saved", { recordId: next.id, status: next.status, valid: next.validation.valid });
    return next;
  }
  function reviewFinding(id, status, reviewer, note) {
    if (["approved", "rejected", "needs_review"].indexOf(status) < 0) throw new Error("Invalid finding review status.");
    var finding = findScoped(KEYS.findings, id);
    if (!finding) throw new Error("Finding not found in the active case.");
    var validation = validateFinding(finding);
    if (status === "approved" && !validation.valid) throw new Error(validation.errors.join(" "));
    finding.status = status;
    finding.validation = validation;
    finding.reviewedBy = clean(reviewer, 160);
    finding.reviewNote = clean(note, 2000);
    finding.reviewedAt = now();
    finding.updatedAt = finding.reviewedAt;
    finding.revision = Number(finding.revision || 1) + 1;
    replaceRecord(KEYS.findings, finding);
    audit("finding.reviewed", { recordId: finding.id, status: status, reviewer: finding.reviewedBy });
    return finding;
  }

  function stageSnapshot() {
    var caseRecord = API.getCase ? API.getCase() : {};
    var evidence = scoped(KEYS.evidence);
    var questions = scoped(KEYS.questions);
    var field = scoped(KEYS.field);
    var supplemental = scoped(KEYS.supplemental);
    var findings = scoped(KEYS.findings);
    var evidenceInvalid = evidence.filter(function (item) { return !item.validation || !item.validation.valid; });
    var unresolvedQuestions = questions.filter(function (item) { return ["resolved", "unobtainable"].indexOf(item.status) < 0; });
    var invalidFindings = findings.filter(function (item) { return !validateFinding(item).valid; });
    var pendingFindings = findings.filter(function (item) { return item.status !== "approved"; });
    return {
      case: {
        status: activeCaseId() && clean(caseRecord.matter) && clean(caseRecord.scope) ? "complete" : activeCaseId() ? "in_progress" : "blocked",
        blockers: activeCaseId() ? [] : ["No active case ID."]
      },
      evidence: {
        status: !evidence.length ? "not_started" : evidenceInvalid.length ? "blocked" : evidence.some(function (x) { return x.status !== "approved"; }) ? "needs_review" : "complete",
        blockers: evidenceInvalid.length ? [evidenceInvalid.length + " evidence item(s) lack required provenance or SHA-256."] : []
      },
      analysis: {
        status: !questions.length ? "not_started" : "needs_review",
        blockers: !questions.length ? ["Analysis must produce an Open Questions List."] : []
      },
      field: {
        status: !questions.length ? "blocked" : unresolvedQuestions.length ? (field.length ? "in_progress" : "not_started") : "complete",
        blockers: unresolvedQuestions.length ? [unresolvedQuestions.length + " open question(s) require a final disposition."] : []
      },
      supplemental: {
        status: supplemental.length ? "in_progress" : "not_started",
        blockers: []
      },
      findings: {
        status: !findings.length ? "not_started" : invalidFindings.length ? "blocked" : pendingFindings.length ? "needs_review" : "complete",
        blockers: []
          .concat(!findings.length ? ["No findings have been created."] : [])
          .concat(invalidFindings.length ? [invalidFindings.length + " finding(s) have invalid source linkage."] : [])
          .concat(pendingFindings.length ? [pendingFindings.length + " finding(s) await investigator approval."] : [])
      }
    };
  }
  function releaseCheck() {
    var state = stageSnapshot();
    var findings = scoped(KEYS.findings);
    return {
      ready: state.findings.status === "complete",
      total: findings.length,
      approved: findings.filter(function (x) { return x.status === "approved"; }).length,
      invalid: findings.filter(function (x) { return !validateFinding(x).valid; }).map(function (x) { return x.id; }),
      pending: findings.filter(function (x) { return x.status !== "approved"; }).map(function (x) { return x.id; }),
      blockers: state.findings.blockers.slice()
    };
  }

  function migrateLegacy() {
    var caseId = activeCaseId();
    if (!caseId) return;
    [
      ["arc_open_questions_v1", KEYS.questions, "question"],
      ["arc_field_records_v1", KEYS.field, "field"],
      ["arc_supplemental_records_v1", KEYS.supplemental, "supplemental"],
      ["arc_findings_v1", KEYS.findings, "finding"]
    ].forEach(function (mapping) {
      var legacy = read(mapping[0], []);
      var target = all(mapping[1]);
      var ids = new Set(target.map(function (item) { return clean(item.id); }));
      legacy.forEach(function (item) {
        if (clean(item.caseId) !== caseId || ids.has(clean(item.id))) return;
        target.push(Object.assign({ migratedFrom: mapping[0] }, item));
      });
      write(mapping[1], target);
    });
  }

  API.investigationSchemaVersion = 3;
  API.INVESTIGATION_KEYS = KEYS;
  API.QUESTION_STATUSES = QUESTION_STATUSES.slice();
  API.RECORD_STATUSES = RECORD_STATUSES.slice();
  API.STAGE_STATUSES = STAGE_STATUSES.slice();
  API.getEvidenceRecords = function () { return scoped(KEYS.evidence); };
  API.saveEvidenceRecord = saveEvidence;
  API.deleteEvidenceRecord = function (id) { return removeScoped(KEYS.evidence, id); };
  API.getOpenQuestions = function () { return scoped(KEYS.questions); };
  API.saveOpenQuestion = saveQuestion;
  API.resolveOpenQuestion = function (id, status, resolution, reason) {
    return saveQuestion({ id: id, status: status, resolution: resolution, resolutionReason: reason });
  };
  API.deleteOpenQuestion = function (id) { return removeScoped(KEYS.questions, id); };
  API.getFieldRecords = function () { return scoped(KEYS.field); };
  API.saveFieldRecord = saveFieldAct;
  API.deleteFieldRecord = function (id) { return removeScoped(KEYS.field, id); };
  API.getSupplementalRecords = function () {
    return scoped(KEYS.supplemental).sort(function (a, b) {
      return clean(a.receivedAt || a.createdAt).localeCompare(clean(b.receivedAt || b.createdAt));
    });
  };
  API.appendSupplementalRecord = appendSupplemental;
  API.getFindings = function () { return scoped(KEYS.findings); };
  API.saveFinding = saveFinding;
  API.reviewFinding = reviewFinding;
  API.deleteFinding = function (id) { return removeScoped(KEYS.findings, id); };
  API.validateFinding = validateFinding;
  API.approvedFindings = function () {
    return scoped(KEYS.findings).filter(function (item) {
      return item.status === "approved" && validateFinding(item).valid;
    });
  };
  API.getInvestigationStageSnapshot = stageSnapshot;
  API.findingsReleaseCheck = releaseCheck;
  API.migrateInvestigationData = migrateLegacy;
  API.exportInvestigationBundle = function () {
    return {
      schemaVersion: 3,
      exportedAt: now(),
      caseContext: API.getCase ? API.getCase() : {},
      evidence: scoped(KEYS.evidence),
      openQuestions: scoped(KEYS.questions),
      fieldRecords: scoped(KEYS.field),
      supplementalRecords: scoped(KEYS.supplemental),
      findings: scoped(KEYS.findings),
      stageState: stageSnapshot()
    };
  };

  migrateLegacy();
})();
