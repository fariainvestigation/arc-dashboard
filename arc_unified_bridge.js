(function () {
  "use strict";

  if (window.parent !== window) document.documentElement.classList.add("arc-embedded");

  const REPORT_KEY = "arc_unified_report_inbox_v1";
  const CASE_KEY = "arc_unified_case_context_v1";
  const ROUTE_KEY = "arc_report_route_request_v1";
  const REVIEW_KEY = "arc_unified_review_records_v1";
  const AUDIT_KEY = "arc_unified_audit_v1";
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
    if (window.arcAuth && typeof window.arcAuth.apiCall === "function") {
      return window.arcAuth.apiCall(method, path, body);
    }
    return fetch(path, {
      method: method,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined
    });
  }

  function syncAuditToServer(event) {
    const caseId = text(event && (event.caseKey || (event.caseContext && (event.caseContext.id || event.caseContext.caseId))), 160);
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
      return entry && !entry.synced && (entry.caseKey || (entry.caseContext && (entry.caseContext.id || entry.caseContext.caseId)));
    }).slice(0, 100).map(function (entry) {
      return {
        id: entry.id,
        action: entry.action,
        caseId: entry.caseKey || entry.caseContext.id || entry.caseContext.caseId,
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
      incidentDate: text(source.incidentDate, 40),
      priority: text(source.priority, 80),
      status: text(source.status, 80),
      investigator: text(source.investigator || source.preparedBy, 240),
      notes: text(source.notes, 12000),
      source: text(source.source, 160),
      intake: normalizeIntake(source.intake),
      uploadedFiles: Array.isArray(source.uploadedFiles) ? source.uploadedFiles.map(fileMeta).filter(function (file) { return file.id || file.name; }) : [],
      updatedAt: source.updatedAt || null
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
    const caseId = caseIdentity(item.caseContext);
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
      ".arc-report-canvas,.report-paper,.rb-print-doc,.rpt-preview,article.report{--arc-report-navy:#0b1726;--arc-report-gold:#b59461}",
      "@media print{.arc-product-standalone{display:none!important}.report-paper,.rb-print-doc,.rpt-preview,article.report{box-shadow:none!important}h1,h2,h3{break-after:avoid-page;page-break-after:avoid}figure,tr,img{break-inside:avoid;page-break-inside:avoid}}"
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
        (context.docket ? " · " + text(context.docket, 80).replace(/[<>&]/g, "") : "");
      document.body.appendChild(bar);
    }
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
      try { window.parent.postMessage({ type: "ARC_REPORT_SAVED", report: item }, "*"); } catch (error) {}
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
      try { window.parent.postMessage(request, "*"); } catch (error) {}
    } else {
      document.dispatchEvent(new CustomEvent("arc:route-report", { detail: request }));
      if (/01_Report_Generator\.html$/i.test(location.pathname)) {
        try { window.postMessage(request, "*"); } catch (error) {}
      } else if (!document.getElementById("frame")) {
        location.assign("01_Report_Generator.html");
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

  function saveCase(value) {
    const previous = normalizeCase(read(CASE_KEY, {}));
    const next = normalizeCase(Object.assign({}, previous, value || {}, { updatedAt: new Date().toISOString() }));
    next.updatedAt = new Date().toISOString();
    write(CASE_KEY, next);
    const caseId = caseIdentity(next);
    if (caseId) {
      const method = previous && caseIdentity(previous) === caseId ? "PUT" : "POST";
      const path = method === "PUT" ? "/api/cases/" + encodeURIComponent(caseId) : "/api/cases";
      const payload = Object.assign({}, next, {
        id: caseId,
        updatedAt: previous.updatedAt || next.updatedAt
      });
      authFetch(method, path, payload).then(async function (response) {
        if (!response) return;
        if (response.status === 409) {
          const conflict = await response.json().catch(function () { return null; });
          if (conflict && conflict.conflict && conflict.conflict.current) {
            write(CASE_KEY, normalizeCase(conflict.conflict.current));
            applyCaseContext(conflict.conflict.current);
            alert("Case was modified elsewhere. Loaded the newer server version.");
          }
          return;
        }
        if (!response.ok) return;
        const saved = await response.json().catch(function () { return null; });
        if (saved && saved.id) {
          write(CASE_KEY, normalizeCase(saved));
          applyCaseContext(saved);
        }
      }).catch(function () {});
    }
    return applyCaseContext(next);
  }

  async function pollServerCase() {
    const current = normalizeCase(read(CASE_KEY, {}));
    const caseId = caseIdentity(current);
    if (!caseId) return;
    try {
      const response = await authFetch("GET", "/api/cases/" + encodeURIComponent(caseId));
      if (!response || !response.ok) return;
      const serverCase = await response.json();
      if (!serverCase || !serverCase.updatedAt) return;
      if (String(serverCase.updatedAt) !== String(current.updatedAt || "")) {
        write(CASE_KEY, normalizeCase(serverCase));
        applyCaseContext(serverCase);
        if (channel) channel.postMessage({ type: "case-update", case: serverCase });
        document.dispatchEvent(new CustomEvent("arc:case-updated", { detail: serverCase }));
      }
    } catch (error) {}
  }

  if (typeof setInterval === "function") {
    setInterval(pollServerCase, 5000);
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

  window.ARCUnified = {
    REPORT_KEY: REPORT_KEY,
    CASE_KEY: CASE_KEY,
    getCase: function () { return normalizeCase(read(CASE_KEY, {})); },
    saveCase: saveCase,
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
    ROUTE_KEY: ROUTE_KEY
  };

  applyCaseContext(read(CASE_KEY, {}));
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      injectProductExperience();
      injectPageTools();
      injectReportExportButton();
    }, { once: true });
  } else {
    injectProductExperience();
    injectPageTools();
    injectReportExportButton();
  }
  if (window.parent !== window) {
    try { window.parent.postMessage({ type: "ARC_MODULE_READY", title: document.title }, "*"); } catch (error) {}
  }
})();
