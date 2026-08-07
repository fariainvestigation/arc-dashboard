(function () {
  "use strict";

  const RECOVERY_KEY = "arc_investigation_development_recovery_v1";
  const API_PATH = "/sync/investigation-workspace";
  const state = {
    caseContext: {},
    workspace: blankWorkspace(""),
    sources: [],
    serverBacked: false,
    dirty: false,
    activeView: "overview"
  };

  const $ = function (id) { return document.getElementById(id); };

  function clean(value, max) {
    const output = String(value == null ? "" : value).trim();
    return max ? output.slice(0, max) : output;
  }

  function uid(prefix) {
    return prefix + "_" + (crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + "_" + Math.random().toString(36).slice(2));
  }

  function escapeHtml(value) {
    return clean(value).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
    });
  }

  function caseId() {
    const context = state.caseContext || {};
    return clean(context.caseId || context.id || context.docket || context.matter, 180);
  }

  function blankWorkspace(id) {
    return {
      schema: "arc-investigation-development",
      schemaVersion: 1,
      caseId: id,
      sources: [],
      entities: [],
      events: [],
      leads: [],
      issues: [],
      tasks: [],
      rejectedSuggestions: [],
      generatedAt: null,
      updatedAt: null,
      savedAt: null
    };
  }

  function setStatus(message, tone) {
    const node = $("idStatus");
    node.className = "id-status" + (tone ? " " + tone : "");
    node.textContent = message;
  }

  function getCaseContext() {
    if (window.ARCUnified && typeof window.ARCUnified.getCase === "function") {
      return window.ARCUnified.getCase() || {};
    }
    return window.ARC_CASE_CONTEXT || {};
  }

  function sourceKey(source) {
    return [source.kind, source.id, source.title, source.citation].map(clean).join("::").toLowerCase();
  }

  function addSource(map, source) {
    const title = clean(source.title || source.name, 300);
    const text = clean(source.text || source.preview || source.description || "", 30000);
    if (!title && !text) return;
    const record = {
      id: clean(source.id, 180) || uid("source"),
      kind: clean(source.kind || source.type || "record", 80),
      title: title || "Untitled source",
      citation: clean(source.citation || source.source || "Not Listed", 600) || "Not Listed",
      sourceType: clean(source.sourceType || source.type || "Not Listed", 120) || "Not Listed",
      status: clean(source.status || "available", 80),
      text: text,
      originalMetadata: source.originalMetadata || {}
    };
    map.set(sourceKey(record), record);
  }

  async function collectSources() {
    const map = new Map();
    const context = state.caseContext || {};
    (context.uploadedFiles || []).forEach(function (file) {
      addSource(map, {
        id: file.id,
        kind: "uploaded-file",
        title: file.name,
        type: file.type,
        citation: file.category || "Uploaded file",
        status: (file.extraction && file.extraction.status) || "metadata",
        text: (file.extraction && (file.extraction.preview || (file.extraction.facts || []).map(function (fact) { return fact.text; }).join("\n"))) || "",
        originalMetadata: file
      });
    });
    ((context.intake && context.intake.extractions) || []).forEach(function (row) {
      addSource(map, {
        id: row.id,
        kind: "intake-extraction",
        title: row.name,
        type: row.category,
        citation: row.category || "Intake extraction",
        status: row.status,
        text: row.preview || (row.facts || []).map(function (fact) { return fact.category + ": " + fact.text; }).join("\n"),
        originalMetadata: row
      });
    });
    if (window.ARCUnified && typeof window.ARCUnified.getCaseReports === "function") {
      (window.ARCUnified.getCaseReports(context) || []).forEach(function (report) {
        addSource(map, {
          id: report.id,
          kind: "arc-report",
          title: report.title,
          type: report.reportType,
          citation: report.source || "ARC report",
          status: report.reviewStatus || "draft",
          text: report.text || report.html || "",
          originalMetadata: { reportId: report.id, revision: report.revision }
        });
      });
    }
    if (window.ARCReportAssets && typeof window.ARCReportAssets.list === "function") {
      try {
        const assets = await window.ARCReportAssets.list();
        assets.forEach(function (asset) {
          addSource(map, {
            id: asset.id,
            kind: "report-asset",
            title: asset.title,
            type: asset.type,
            citation: asset.citation || asset.source || "Report asset",
            status: asset.status,
            text: [asset.description, asset.source, asset.citation].filter(Boolean).join("\n"),
            originalMetadata: asset
          });
        });
      } catch (error) {}
    }
    (state.workspace.sources || []).filter(function (item) { return item.kind === "manual"; }).forEach(function (item) { addSource(map, item); });
    state.sources = Array.from(map.values());
    return state.sources;
  }

  function sourceText(source) {
    return clean([source.title, source.citation, source.text].filter(Boolean).join("\n"), 32000);
  }

  function makeCitation(source, fallback) {
    return clean(source.citation || fallback || "Not Listed", 600) || "Not Listed";
  }

  function extractEntities(sources) {
    const map = new Map();
    function put(name, type, source, basis) {
      name = clean(name, 180);
      if (!name || name.length < 2) return;
      if (/^(The|This|That|Report|Source|Case|Not Listed|Unknown)$/i.test(name)) return;
      const key = (type + "::" + name).toLowerCase();
      const current = map.get(key) || {
        id: uid("entity"),
        name: name,
        type: type,
        sourceIds: [],
        citations: [],
        basis: [],
        factType: "extracted fact",
        approvalStatus: "suggested"
      };
      if (!current.sourceIds.includes(source.id)) current.sourceIds.push(source.id);
      const citation = makeCitation(source);
      if (!current.citations.includes(citation)) current.citations.push(citation);
      if (basis && current.basis.length < 4) current.basis.push(clean(basis, 500));
      map.set(key, current);
    }
    sources.forEach(function (source) {
      const text = sourceText(source);
      const emailMatches = text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi) || [];
      emailMatches.forEach(function (item) { put(item.toLowerCase(), "account", source, "Email/account string located in source."); });
      const vehicleMatches = text.match(/\b(?:plate|vehicle|vin|registration)\s*[:#-]?\s*([A-Z0-9 -]{3,18})/gi) || [];
      vehicleMatches.forEach(function (item) { put(item.replace(/^(plate|vehicle|vin|registration)\s*[:#-]?\s*/i, ""), "vehicle", source, item); });
      const exhibitMatches = text.match(/\b(?:exhibit|evidence|item)\s*[:#-]?\s*([A-Z0-9.-]{1,20})/gi) || [];
      exhibitMatches.forEach(function (item) { put(item, "evidence", source, item); });
      const locationMatches = text.match(/\b\d{1,6}\s+[A-Z][A-Za-z0-9.' -]{2,45}\s+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Court|Ct|Boulevard|Blvd|Way)\b/g) || [];
      locationMatches.forEach(function (item) { put(item, "location", source, item); });
      const personMatches = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z]\.)?(?:\s+[A-Z][a-z]+){1,2}\b/g) || [];
      personMatches.slice(0, 30).forEach(function (item) { put(item, "person/entity", source, "Capitalized name or entity string located in source."); });
    });
    return Array.from(map.values()).sort(function (a, b) { return a.name.localeCompare(b.name); });
  }

  function extractEvents(sources) {
    const events = [];
    const datePattern = /\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})\b/gi;
    const timePattern = /\b(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?\s*(?:AM|PM)?\b|\b(?:1[0-2]|0?[1-9])\s*(?:AM|PM)\b/gi;
    sources.forEach(function (source) {
      const text = sourceText(source);
      const sentences = text.split(/(?<=[.!?])\s+|\n+/).filter(Boolean);
      sentences.forEach(function (sentence) {
        const dates = sentence.match(datePattern) || [];
        const times = sentence.match(timePattern) || [];
        if (!dates.length && !times.length) return;
        events.push({
          id: uid("event"),
          title: clean(sentence.replace(/\s+/g, " "), 180),
          date: dates[0] || "Not Listed",
          time: times[0] || "Not Listed",
          details: clean(sentence, 1000),
          sourceId: source.id,
          sourceTitle: source.title,
          citation: makeCitation(source),
          factType: dates.length ? "source fact" : "time reference",
          approvalStatus: "suggested"
        });
      });
    });
    return events.slice(0, 120);
  }

  function detectIssues(sources) {
    const issues = [];
    const patterns = [
      { type: "contradiction", severity: "High", regex: /\b(conflict|contradict|inconsistent|discrepanc|different version|does not match)\b/i },
      { type: "missing information", severity: "Medium", regex: /\b(missing|not listed|unknown|unavailable|not provided|no record|gap)\b/i },
      { type: "unsupported allegation", severity: "High", regex: /\b(alleged|allegation|reported)\b.*\b(no|without|missing|not listed|unsupported)\b/i },
      { type: "chain of custody", severity: "Medium", regex: /\b(chain of custody|custody|sealed|transferred|logged|inventory)\b.*\b(gap|missing|unknown|not listed)\b/i }
    ];
    sources.forEach(function (source) {
      const sentences = sourceText(source).split(/(?<=[.!?])\s+|\n+/).filter(Boolean);
      sentences.forEach(function (sentence) {
        patterns.forEach(function (pattern) {
          if (!pattern.regex.test(sentence)) return;
          issues.push({
            id: uid("issue"),
            type: pattern.type,
            severity: pattern.severity,
            title: pattern.type.replace(/\b\w/g, function (c) { return c.toUpperCase(); }),
            details: clean(sentence, 1000),
            sourceId: source.id,
            sourceTitle: source.title,
            citation: makeCitation(source),
            factType: "source flag",
            approvalStatus: "suggested"
          });
        });
      });
    });
    return issues.slice(0, 80);
  }

  function buildLeadFromIssue(issue) {
    const isConflict = issue.type === "contradiction";
    const isCustody = issue.type === "chain of custody";
    const leadType = isCustody ? "evidence review" : (isConflict ? "interview or records comparison" : "records request");
    return {
      id: uid("lead"),
      title: (isConflict ? "Resolve source conflict" : isCustody ? "Verify custody gap" : "Fill missing information") + ": " + clean(issue.sourceTitle || "Not Listed", 90),
      type: leadType,
      priority: issue.severity === "High" ? "High" : "Medium",
      status: "suggested",
      details: "Suggested follow-up based on a source flag. Investigator must confirm the issue before treating it as a finding.\n\nFlagged text: " + issue.details,
      sourceId: issue.sourceId,
      sourceTitle: issue.sourceTitle,
      citation: issue.citation,
      factType: "investigative inference",
      approvalRequired: true
    };
  }

  function generateLeads(issues, entities, events) {
    const leads = issues.slice(0, 60).map(buildLeadFromIssue);
    if (entities.length && !leads.some(function (lead) { return /interview/i.test(lead.type); })) {
      leads.push({
        id: uid("lead"),
        title: "Prioritize interviews for central people and source authors",
        type: "interview",
        priority: "Medium",
        status: "suggested",
        details: "Review extracted people/entities and decide who needs an interview, re-interview, or impeachment comparison. Use only source-identified people.",
        sourceTitle: "Entity extraction",
        citation: "Not Listed",
        factType: "investigative inference",
        approvalRequired: true
      });
    }
    if (events.length && events.some(function (event) { return event.date === "Not Listed" || event.time === "Not Listed"; })) {
      leads.push({
        id: uid("lead"),
        title: "Request records needed to normalize incomplete timeline entries",
        type: "records request",
        priority: "Medium",
        status: "suggested",
        details: "Some event references are missing a date, time, timezone, page, or timestamp. Request native records or metadata before building a final chronology.",
        sourceTitle: "Timeline extraction",
        citation: "Not Listed",
        factType: "investigative inference",
        approvalRequired: true
      });
    }
    return mergeLeads(state.workspace.leads || [], leads);
  }

  function leadIdentity(lead) {
    return [lead.title, lead.sourceTitle, lead.citation].map(clean).join("::").toLowerCase();
  }

  function mergeLeads(existing, suggested) {
    const map = new Map();
    existing.forEach(function (lead) { map.set(leadIdentity(lead), lead); });
    suggested.forEach(function (lead) {
      const key = leadIdentity(lead);
      if (!map.has(key)) map.set(key, lead);
    });
    return Array.from(map.values());
  }

  async function analyze() {
    if (!caseId()) {
      setStatus("Select or create an active ARC case before running investigation development.", "error");
      return;
    }
    setStatus("Analyzing case sources and preserving AI-assisted results as editable suggestions.");
    await collectSources();
    const entities = extractEntities(state.sources);
    const events = extractEvents(state.sources);
    const issues = detectIssues(state.sources);
    state.workspace = Object.assign({}, state.workspace, {
      caseId: caseId(),
      sources: state.sources,
      entities: entities,
      events: events,
      issues: issues,
      leads: generateLeads(issues, entities, events),
      generatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    state.dirty = true;
    audit("investigation-analysis-generated", "Generated editable investigation-development suggestions.");
    render();
    setStatus("Analysis complete. Suggestions are not official findings until approved by an investigator.", "ok");
  }

  function recoveryKey() {
    return RECOVERY_KEY + ":" + (caseId() || "no-case");
  }

  function saveRecovery() {
    try { localStorage.setItem(recoveryKey(), JSON.stringify(state.workspace)); } catch (error) {}
  }

  function loadRecovery(id) {
    try {
      const value = JSON.parse(localStorage.getItem(RECOVERY_KEY + ":" + id) || "null");
      return value && typeof value === "object" ? value : null;
    } catch (error) {
      return null;
    }
  }

  async function apiFetch(url, options) {
    if (window.ARCApi && typeof window.ARCApi.apiFetch === "function") {
      return window.ARCApi.apiFetch(url, options);
    }
    return fetch(url, Object.assign({ credentials: "same-origin" }, options || {}));
  }

  async function loadWorkspace() {
    state.caseContext = getCaseContext();
    const id = caseId();
    if (!id) {
      state.workspace = blankWorkspace("");
      state.sources = [];
      render();
      setStatus("No active ARC case is selected. Open Case Dashboard or Share Case first.", "error");
      return;
    }
    await collectSources();
    state.workspace = blankWorkspace(id);
    state.serverBacked = false;
    try {
      const response = await apiFetch(API_PATH + "?caseId=" + encodeURIComponent(id), { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        state.workspace = Object.assign(blankWorkspace(id), data);
        state.serverBacked = true;
        setStatus("Loaded investigation workspace for the active ARC case.", "ok");
      } else {
        const recovery = loadRecovery(id);
        if (recovery) state.workspace = Object.assign(blankWorkspace(id), recovery);
        setStatus("Server workspace is unavailable. Local recovery is shown only as an unsynced draft.", "error");
      }
    } catch (error) {
      const recovery = loadRecovery(id);
      if (recovery) state.workspace = Object.assign(blankWorkspace(id), recovery);
      setStatus("Could not reach the shared workspace endpoint. Local recovery is shown only as an unsynced draft.", "error");
    }
    if (!state.workspace.sources.length && state.sources.length) state.workspace.sources = state.sources;
    render();
  }

  async function saveWorkspace() {
    if (!caseId()) {
      setStatus("Select an active ARC case before saving.", "error");
      return;
    }
    const payload = Object.assign({}, state.workspace, {
      caseId: caseId(),
      sources: state.sources.length ? state.sources : state.workspace.sources,
      updatedAt: new Date().toISOString()
    });
    saveRecovery();
    try {
      const response = await apiFetch(API_PATH + "?caseId=" + encodeURIComponent(caseId()), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(function () { return {}; });
      if (!response.ok) throw new Error(data.error || "Save failed");
      state.workspace = Object.assign(blankWorkspace(caseId()), data);
      state.serverBacked = true;
      state.dirty = false;
      audit("investigation-workspace-saved", "Saved investigation-development workspace.");
      render();
      setStatus("Investigation workspace saved to the shared case structure.", "ok");
    } catch (error) {
      setStatus("Shared save failed. A local recovery draft was kept, but it is not the authoritative case database. " + error.message, "error");
    }
  }

  function audit(action, summary, recordId) {
    if (window.ARCUnified && typeof window.ARCUnified.auditEvent === "function") {
      window.ARCUnified.auditEvent(action, {
        caseContext: state.caseContext,
        recordId: recordId,
        summary: summary
      });
    }
  }

  function metric(label, value) {
    return "<div class='id-metric'><span>" + escapeHtml(label) + "</span><strong>" + escapeHtml(value) + "</strong></div>";
  }

  function renderMetrics() {
    const ws = state.workspace;
    $("idMetrics").innerHTML = [
      metric("Sources", (ws.sources || []).length),
      metric("Entities", (ws.entities || []).length),
      metric("Events", (ws.events || []).length),
      metric("Issues", (ws.issues || []).length),
      metric("Leads", (ws.leads || []).length),
      metric("Approved tasks", (ws.tasks || []).length)
    ].join("");
  }

  function card(item, options) {
    options = options || {};
    const tone = options.tone || (item.status === "approved" ? "approved" : item.status === "rejected" ? "rejected" : "");
    const meta = [
      item.type,
      item.priority,
      item.status || item.approvalStatus,
      item.factType,
      item.citation
    ].filter(Boolean);
    return "<article class='id-card " + escapeHtml(tone) + "'>" +
      "<div class='id-card-head'><div><h3>" + escapeHtml(item.title || item.name || "Untitled") + "</h3>" +
      "<p>" + escapeHtml(item.details || item.text || item.basis && item.basis.join(" ") || "Not Listed") + "</p></div></div>" +
      "<div class='id-meta'>" + meta.map(function (value, index) {
        return "<span class='id-pill " + (index === 2 && value === "approved" ? "green" : index === 4 ? "gold" : "") + "'>" + escapeHtml(value) + "</span>";
      }).join("") + "</div>" +
      (options.actions || "") +
      "</article>";
  }

  function renderOverview() {
    const context = state.caseContext || {};
    const ws = state.workspace;
    const caseLabel = clean(context.matter || context.caseName || context.subjectName || "No active case selected");
    $("idCaseName").textContent = caseLabel;
    $("idCaseMeta").textContent = [context.docket, context.court, context.investigator].filter(Boolean).join(" | ") || "Case metadata not listed";
    $("idOverview").innerHTML =
      "<table class='id-table'><tbody>" +
      row("Matter", caseLabel) +
      row("Docket", context.docket || "Not Listed") +
      row("Client / Subject", context.clientName || context.subjectName || "Not Listed") +
      row("Investigator", context.investigator || "Not Listed") +
      row("Source status", (ws.sources || []).length ? (ws.sources.length + " source(s) indexed") : "No case sources indexed yet") +
      row("Last analysis", ws.generatedAt || "Not Listed") +
      row("Shared save", ws.savedAt || (state.serverBacked ? "Loaded from shared storage" : "Not synced")) +
      "</tbody></table>";
    const leads = (ws.leads || []).filter(function (lead) { return lead.status !== "rejected"; }).slice(0, 5);
    $("idNextSteps").innerHTML = leads.length
      ? leads.map(function (lead) { return card(lead, { actions: leadActions(lead) }); }).join("")
      : empty("No suggested leads yet", "Run Analyze Sources after selecting a case with discovery, notes, reports, or report assets.");
  }

  function row(label, value) {
    return "<tr><th>" + escapeHtml(label) + "</th><td>" + escapeHtml(value) + "</td></tr>";
  }

  function empty(title, message) {
    return "<div class='id-empty'><strong>" + escapeHtml(title) + "</strong><span>" + escapeHtml(message) + "</span></div>";
  }

  function renderSources() {
    const q = clean($("idSourceSearch").value).toLowerCase();
    const sources = (state.workspace.sources || state.sources || []).filter(function (source) {
      const haystack = [source.title, source.kind, source.sourceType, source.citation, source.text].join(" ").toLowerCase();
      return !q || haystack.includes(q);
    });
    $("idSources").innerHTML = sources.length ? sources.map(function (source) {
      return card({
        title: source.title,
        type: source.kind,
        status: source.status,
        factType: "source record",
        citation: source.citation,
        details: source.text || "Metadata only. Extracted text is Not Listed."
      });
    }).join("") : empty("No source records found", "Add a manual source or use existing ARC intake, report assets, and generated reports.");
  }

  function renderEntities() {
    const entities = state.workspace.entities || [];
    $("idEntities").innerHTML = entities.length ? "<table class='id-table'><thead><tr><th>Name</th><th>Type</th><th>Sources</th><th>Citations</th><th>Status</th></tr></thead><tbody>" +
      entities.map(function (entity) {
        return "<tr><td>" + escapeHtml(entity.name) + "</td><td>" + escapeHtml(entity.type) + "</td><td>" + escapeHtml((entity.sourceIds || []).length) + "</td><td>" + escapeHtml((entity.citations || []).join("; ") || "Not Listed") + "</td><td>" + escapeHtml(entity.approvalStatus || "suggested") + "</td></tr>";
      }).join("") + "</tbody></table>" : empty("No people or entities extracted", "Run source analysis after case records are available.");
    const central = entities.slice(0, 8);
    $("idRelationships").innerHTML = central.length ? central.map(function (entity) {
      return card({ title: entity.name, type: entity.type, status: entity.approvalStatus, factType: entity.factType, citation: (entity.citations || [])[0] || "Not Listed", details: "Appears in " + (entity.sourceIds || []).length + " source(s). Relationship is not proof and requires investigator review." });
    }).join("") : empty("No relationship candidates", "Relationships will appear only after source-identifiable entities are extracted.");
  }

  function renderTimeline() {
    const events = state.workspace.events || [];
    $("idTimeline").innerHTML = events.length ? "<table class='id-table'><thead><tr><th>Date</th><th>Time</th><th>Event</th><th>Source</th><th>Citation</th></tr></thead><tbody>" +
      events.map(function (event) {
        return "<tr><td>" + escapeHtml(event.date) + "</td><td>" + escapeHtml(event.time) + "</td><td>" + escapeHtml(event.details) + "</td><td>" + escapeHtml(event.sourceTitle || "Not Listed") + "</td><td>" + escapeHtml(event.citation || "Not Listed") + "</td></tr>";
      }).join("") + "</tbody></table>" : empty("No dated events extracted", "Events are only shown when a source contains a date or time reference.");
  }

  function leadActions(lead) {
    return "<div class='id-card-actions'>" +
      "<button class='id-btn' data-edit-lead='" + escapeHtml(lead.id) + "' type='button'>Edit</button>" +
      "<button class='id-btn' data-approve-lead='" + escapeHtml(lead.id) + "' type='button'>Approve</button>" +
      "<button class='id-btn danger' data-reject-lead='" + escapeHtml(lead.id) + "' type='button'>Reject</button>" +
      "<button class='id-btn' data-task-lead='" + escapeHtml(lead.id) + "' type='button'>Create Task</button>" +
      "</div>";
  }

  function renderLeads() {
    const filter = $("idLeadFilter").value;
    let leads = state.workspace.leads || [];
    if (filter !== "all") leads = leads.filter(function (lead) { return lead.status === filter; });
    $("idLeads").innerHTML = leads.length
      ? leads.map(function (lead) { return card(lead, { actions: leadActions(lead) }); }).join("")
      : empty("No leads in this view", "Generate suggestions or add a lead manually.");
  }

  function renderIssues() {
    const issues = state.workspace.issues || [];
    $("idIssues").innerHTML = issues.length ? issues.map(function (issue) {
      return card(issue, { tone: issue.severity === "High" ? "danger" : "warning" });
    }).join("") : empty("No contradictions or gaps flagged", "This means no issue terms were found in available extracted text, not that the case has no issues.");
    const logs = window.ARCUnified && typeof window.ARCUnified.getAudit === "function" ? window.ARCUnified.getAudit(state.caseContext).slice(0, 12) : [];
    $("idAudit").innerHTML = logs.length ? logs.map(function (entry) {
      return card({ title: entry.action, type: "audit", status: entry.createdAt, citation: entry.recordId || "Not Listed", details: entry.summary || "No summary listed." });
    }).join("") : empty("No audit records yet", "Approvals, rejections, saves, and report actions will appear here.");
  }

  function render() {
    renderMetrics();
    renderOverview();
    renderSources();
    renderEntities();
    renderTimeline();
    renderLeads();
    renderIssues();
  }

  function updateLead(id, patch) {
    const leads = state.workspace.leads || [];
    const index = leads.findIndex(function (lead) { return lead.id === id; });
    if (index < 0) return;
    leads[index] = Object.assign({}, leads[index], patch, { updatedAt: new Date().toISOString() });
    if (patch.status === "task") {
      const task = Object.assign({}, leads[index], {
        id: uid("task"),
        leadId: leads[index].id,
        status: "open",
        createdAt: new Date().toISOString()
      });
      state.workspace.tasks = (state.workspace.tasks || []).concat(task);
    }
    if (patch.status === "rejected") {
      state.workspace.rejectedSuggestions = (state.workspace.rejectedSuggestions || []).concat(leads[index]);
    }
    state.dirty = true;
    saveRecovery();
    audit("investigation-lead-" + (patch.status || "updated"), leads[index].title, id);
    render();
  }

  function openEditor(kind, item) {
    const form = $("idEditorForm");
    form.elements.kind.value = kind;
    form.elements.id.value = item && item.id || "";
    form.elements.title.value = item && (item.title || item.name) || "";
    form.elements.type.value = item && item.type || "";
    form.elements.details.value = item && (item.details || item.text) || "";
    form.elements.sourceTitle.value = item && item.sourceTitle || "";
    form.elements.citation.value = item && item.citation || "";
    form.elements.priority.value = item && item.priority || "Medium";
    form.elements.status.value = item && item.status || (kind === "source" ? "available" : "suggested");
    $("idEditorTitle").textContent = kind === "source" ? "Add Manual Source" : "Edit Lead";
    $("idEditor").showModal();
  }

  function saveEditor(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const kind = form.elements.kind.value;
    const id = form.elements.id.value || uid(kind);
    if (kind === "source") {
      const source = {
        id: id,
        kind: "manual",
        title: form.elements.title.value,
        sourceType: form.elements.type.value || "manual note",
        text: form.elements.details.value,
        citation: form.elements.citation.value || "Not Listed",
        status: "available"
      };
      state.workspace.sources = (state.workspace.sources || []).filter(function (item) { return item.id !== id; }).concat(source);
      state.sources = state.workspace.sources;
      audit("investigation-source-added", source.title, source.id);
    } else {
      const lead = {
        id: id,
        title: form.elements.title.value,
        type: form.elements.type.value || "follow-up",
        details: form.elements.details.value,
        sourceTitle: form.elements.sourceTitle.value || "Not Listed",
        citation: form.elements.citation.value || "Not Listed",
        priority: form.elements.priority.value,
        status: form.elements.status.value,
        factType: "investigator entry",
        approvalRequired: form.elements.status.value !== "approved"
      };
      state.workspace.leads = (state.workspace.leads || []).filter(function (item) { return item.id !== id; }).concat(lead);
      audit("investigation-lead-edited", lead.title, lead.id);
    }
    state.dirty = true;
    saveRecovery();
    $("idEditor").close();
    render();
  }

  function wireEvents() {
    document.querySelector(".id-tabs").addEventListener("click", function (event) {
      const button = event.target.closest("[data-view]");
      if (!button) return;
      state.activeView = button.dataset.view;
      document.querySelectorAll(".id-tabs button").forEach(function (item) { item.classList.toggle("active", item === button); });
      document.querySelectorAll("[data-view-panel]").forEach(function (panel) { panel.classList.toggle("active", panel.dataset.viewPanel === state.activeView); });
    });
    $("idReload").addEventListener("click", loadWorkspace);
    $("idAnalyze").addEventListener("click", analyze);
    $("idSave").addEventListener("click", saveWorkspace);
    $("idSourceSearch").addEventListener("input", renderSources);
    $("idLeadFilter").addEventListener("change", renderLeads);
    $("idAddSource").addEventListener("click", function () { openEditor("source", {}); });
    $("idAddLead").addEventListener("click", function () { openEditor("lead", {}); });
    $("idEditorClose").addEventListener("click", function () { $("idEditor").close(); });
    $("idEditorCancel").addEventListener("click", function () { $("idEditor").close(); });
    $("idEditorForm").addEventListener("submit", saveEditor);
    document.addEventListener("click", function (event) {
      const edit = event.target.closest("[data-edit-lead]");
      const approve = event.target.closest("[data-approve-lead]");
      const reject = event.target.closest("[data-reject-lead]");
      const task = event.target.closest("[data-task-lead]");
      if (edit) {
        const item = (state.workspace.leads || []).find(function (lead) { return lead.id === edit.dataset.editLead; });
        if (item) openEditor("lead", item);
      }
      if (approve) updateLead(approve.dataset.approveLead, { status: "approved", approvedAt: new Date().toISOString() });
      if (reject) updateLead(reject.dataset.rejectLead, { status: "rejected", rejectedAt: new Date().toISOString() });
      if (task) updateLead(task.dataset.taskLead, { status: "task", approvedAt: new Date().toISOString() });
    });
    document.addEventListener("arc:case-context", function () { loadWorkspace(); });
    window.addEventListener("message", function (event) {
      if (event.source !== window && (window.parent === window || event.source !== window.parent)) return;
      const data = event.data && typeof event.data === "object" ? event.data : {};
      if (data.type === "ARC_CASE_CONTEXT") loadWorkspace();
    });
  }

  wireEvents();
  if (window.parent !== window) {
    try { window.parent.postMessage({ type: "ARC_MODULE_READY", module: "investigation-development" }, ((location.protocol === "http:" || location.protocol === "https:") ? location.origin : "*")); } catch (error) {}
  }
  loadWorkspace();
})();
