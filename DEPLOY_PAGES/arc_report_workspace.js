(function () {
  "use strict";

  const CONFIG = {
    picture: {
      title: "Pictures",
      singular: "Picture",
      description: "Upload, caption, order, approve, and select photographs for the final report.",
      accept: "image/*",
      fileLabel: "Picture file",
      fields: [
        ["caption", "Caption", "textarea"],
        ["exhibitNumber", "Exhibit number", "text"],
        ["takenAt", "Date / time shown", "text"]
      ]
    },
    video: {
      title: "Videos",
      singular: "Video",
      description: "Upload source videos and document their relevance, timestamps, and investigator explanation.",
      accept: "video/*",
      fileLabel: "Video file",
      fields: [
        ["duration", "Duration", "text"],
        ["timestamps", "Relevant timestamps", "textarea"],
        ["explanation", "Investigator explanation", "textarea"]
      ]
    },
    transcript: {
      title: "Transcripts",
      singular: "Transcript",
      description: "Store speakers, timestamps, corrections, source media, and approved excerpts.",
      accept: ".txt,.pdf,.doc,.docx,.html,audio/*,video/*",
      fileLabel: "Transcript or source file",
      fields: [
        ["speakers", "Speakers", "text"],
        ["timestamps", "Relevant timestamps", "text"],
        ["bodyText", "Transcript / selected excerpts", "textarea"]
      ]
    },
    translation: {
      title: "Translations",
      singular: "Translation",
      description: "Preserve original and translated text with language, method, source, and verification context.",
      accept: ".txt,.pdf,.doc,.docx,.html,audio/*,video/*",
      fileLabel: "Source or translation file",
      fields: [
        ["originalLanguage", "Original language", "text"],
        ["translationMethod", "Translation method", "text"],
        ["originalText", "Original text", "textarea"],
        ["translatedText", "Translated text", "textarea"]
      ]
    },
    motion: {
      title: "Full Motions",
      singular: "Motion",
      description: "Collect completed motion documents separately from strategic recommendations.",
      accept: ".pdf,.doc,.docx,.html,.txt",
      fileLabel: "Completed motion file",
      fields: [
        ["motionType", "Motion type", "text"],
        ["jurisdiction", "Court / jurisdiction", "text"],
        ["legalBasis", "Legal basis", "textarea"],
        ["bodyText", "Motion text or summary", "textarea"]
      ]
    }
  };

  const esc = value => String(value == null ? "" : value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
  const type = document.body.dataset.workspace;
  const dashboard = document.body.dataset.dashboard;
  const config = CONFIG[type];
  let records = [];
  let editing = null;
  let query = "";
  let filter = "all";

  function context() { return window.ARCReportAssets.caseContext(); }
  function caseId() { return window.ARCReportAssets.caseId(); }
  function byId(id) { return records.find(item => item.id === id); }
  function formatBytes(value) {
    const size = Number(value || 0);
    if (!size) return "No file";
    if (size >= 1024 * 1024 * 1024) return (size / 1024 / 1024 / 1024).toFixed(2) + " GB";
    if (size >= 1024 * 1024) return (size / 1024 / 1024).toFixed(1) + " MB";
    if (size >= 1024) return (size / 1024).toFixed(1) + " KB";
    return size + " bytes";
  }

  function setCaseHeader() {
    const value = context();
    document.getElementById("rwCaseName").textContent = value.matter || "No active case";
    document.getElementById("rwCaseMeta").textContent = [value.docket, value.clientName].filter(Boolean).join(" | ") || "Create or select a case to begin";
  }

  function pageTools() {
    document.getElementById("rwPrint").addEventListener("click", () => window.print());
    document.getElementById("rwEdit").addEventListener("click", function () {
      document.body.classList.toggle("rw-editing");
      this.textContent = document.body.classList.contains("rw-editing") ? "Finish Editing" : "Edit Records";
    });
    document.getElementById("rwDownload").addEventListener("click", downloadHtml);
  }

  async function downloadHtml() {
    let css = "";
    try { css = await fetch("arc_report_workspace.css").then(response => response.text()); } catch (error) {}
    const clone = document.getElementById("rwContent").cloneNode(true);
    clone.querySelectorAll("button,input,select,dialog,.rw-toolbar,.rw-card-foot").forEach(node => node.remove());
    const value = context();
    const html = "<!doctype html><html lang='en'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>" +
      "<title>" + esc(document.title) + "</title><style>" + css + "</style></head><body><header class='rw-head'><div class='rw-title'><small>ARC case record</small><h1>" +
      esc(document.title) + "</h1><p>" + esc(value.matter || "No active case") + " | " + esc(value.docket || "No docket") + "</p></div></header>" +
      clone.outerHTML + "</body></html>";
    const name = String(value.matter || "arc-case").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
    window.ARCReportAssets.download((name || "arc-case") + "-" + (type || dashboard || "dashboard") + ".html", "text/html", html);
  }

  function metrics() {
    return [
      ["Total", records.length],
      ["Selected", records.filter(item => item.selectedForFinal).length],
      ["Approved", records.filter(item => item.status === "approved" || item.status === "included").length],
      ["Draft", records.filter(item => item.status === "draft").length],
      ["Files", records.filter(item => item.file && item.file.relativePath).length]
    ].map(item => "<div class='rw-metric'><span>" + item[0] + "</span><strong>" + item[1] + "</strong></div>").join("");
  }

  function preview(record) {
    const url = window.ARCReportAssets.fileUrl(record);
    if (type === "picture" && url) return "<img src='" + esc(url) + "' alt='" + esc(record.caption || record.title) + "'>";
    if (type === "video" && url) return "<video controls preload='metadata' src='" + esc(url) + "'></video>";
    return "<span class='rw-file-mark'>" + esc(record.file && record.file.name || config.singular + " record") + "</span>";
  }

  function extraSummary(record) {
    if (type === "picture") return record.caption || record.exhibitNumber || "No caption entered";
    if (type === "video") return record.explanation || record.timestamps || "No explanation entered";
    if (type === "transcript") return record.bodyText || record.speakers || "No transcript text entered";
    if (type === "translation") return record.translatedText || record.originalLanguage || "No translation entered";
    return record.legalBasis || record.bodyText || "No motion summary entered";
  }

  function card(record) {
    return "<article class='rw-card " + (record.selectedForFinal ? "selected" : "") + "' data-id='" + esc(record.id) + "'>" +
      "<div class='rw-preview'>" + preview(record) + "</div><div class='rw-card-body'><h3>" + esc(record.title) + "</h3><p data-arc-editable>" + esc(record.description || extraSummary(record)) + "</p>" +
      "<div class='rw-meta'><div><b>Source</b>" + esc(record.source || "Not entered") + "</div><div><b>Citation</b>" + esc(record.citation || "Not entered") + "</div>" +
      "<div><b>File</b>" + esc(formatBytes(record.file && record.file.size)) + "</div><div><b>Report order</b>" + esc(record.reportOrder || "Not set") + "</div></div></div>" +
      "<div class='rw-card-foot'><span class='rw-status " + esc(record.status) + "'>" + esc(record.status) + "</span>" +
      "<button class='rw-btn' data-action='edit'>Edit</button><button class='rw-btn' data-action='select'>" + (record.selectedForFinal ? "Remove from report" : "Select for report") + "</button>" +
      (record.status !== "approved" ? "<button class='rw-btn' data-action='approve'>Approve</button>" : "") +
      "<button class='rw-btn danger' data-action='archive'>Archive</button></div></article>";
  }

  function visibleRecords() {
    const needle = query.trim().toLowerCase();
    return records.filter(item => {
      const matchesStatus = filter === "all" || item.status === filter || (filter === "selected" && item.selectedForFinal);
      const haystack = [item.title, item.description, item.source, item.citation, extraSummary(item)].join(" ").toLowerCase();
      return matchesStatus && (!needle || haystack.includes(needle));
    }).sort((left, right) => Number(left.reportOrder || 0) - Number(right.reportOrder || 0) || String(right.updatedAt).localeCompare(String(left.updatedAt)));
  }

  function render() {
    setCaseHeader();
    document.getElementById("rwMetrics").innerHTML = metrics();
    const list = visibleRecords();
    document.getElementById("rwRecords").innerHTML = list.length
      ? "<div class='rw-grid'>" + list.map(card).join("") + "</div>"
      : "<div class='rw-empty'><h2>No " + esc(config.title.toLowerCase()) + " found</h2><p>Add the first case-linked record or change the current search and status filter.</p><button class='rw-btn primary' id='rwEmptyAdd'>Add " + esc(config.singular) + "</button></div>";
    document.getElementById("rwEmptyAdd")?.addEventListener("click", () => openForm());
  }

  function fieldMarkup(field, value) {
    const name = field[0], label = field[1], kind = field[2];
    const wide = kind === "textarea" ? " wide" : "";
    return "<label class='rw-field" + wide + "'><span>" + esc(label) + "</span>" +
      (kind === "textarea" ? "<textarea class='rw-textarea' name='" + esc(name) + "'>" + esc(value || "") + "</textarea>" : "<input class='rw-input' name='" + esc(name) + "' value='" + esc(value || "") + "'>") + "</label>";
  }

  function openForm(record) {
    editing = record || null;
    const value = record || {};
    document.getElementById("rwDialogTitle").textContent = (record ? "Edit " : "Add ") + config.singular;
    document.getElementById("rwFormFields").innerHTML =
      fieldMarkup(["title", "Title", "text"], value.title) +
      fieldMarkup(["source", "Source", "text"], value.source) +
      fieldMarkup(["description", "Description", "textarea"], value.description) +
      fieldMarkup(["citation", "Source citation", "textarea"], value.citation) +
      config.fields.map(field => fieldMarkup(field, value[field[0]])).join("") +
      "<label class='rw-field'><span>Status</span><select class='rw-select' name='status'>" + window.ARCReportAssets.STATUSES.map(status => "<option value='" + status + "' " + (value.status === status ? "selected" : "") + ">" + status + "</option>").join("") + "</select></label>" +
      "<label class='rw-field'><span>Report order</span><input class='rw-input' type='number' min='0' name='reportOrder' value='" + esc(value.reportOrder || 0) + "'></label>" +
      "<label class='rw-field wide'><span>" + esc(config.fileLabel) + "</span><input class='rw-input' type='file' name='file' accept='" + esc(config.accept) + "'></label>";
    document.getElementById("rwProgress").hidden = true;
    document.getElementById("rwDialog").showModal();
  }

  async function submitForm(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const record = Object.assign({}, editing || {}, { type: type, caseId: caseId() });
    ["title", "source", "description", "citation", "status"].concat(config.fields.map(field => field[0])).forEach(name => record[name] = String(data.get(name) || ""));
    record.reportOrder = Number(data.get("reportOrder") || 0);
    record.selectedForFinal = Boolean(editing && editing.selectedForFinal) || record.status === "selected" || record.status === "approved" || record.status === "included";
    const file = data.get("file");
    const progress = document.getElementById("rwProgress");
    const bar = progress.querySelector("span");
    try {
      if (file && file.size) progress.hidden = false;
      await window.ARCReportAssets.saveWithFile(record, file && file.size ? file : null, value => { bar.style.width = value + "%"; });
      document.getElementById("rwDialog").close();
      await load();
    } catch (error) {
      document.getElementById("rwFormError").textContent = error.message;
      document.getElementById("rwFormError").hidden = false;
    }
  }

  async function act(action, record) {
    if (action === "edit") return openForm(record);
    if (action === "archive") {
      if (!confirm("Archive this record? Its source file will be retained.")) return;
      await window.ARCReportAssets.archive(record);
    }
    if (action === "select") await window.ARCReportAssets.save(Object.assign({}, record, {
      selectedForFinal: !record.selectedForFinal,
      status: !record.selectedForFinal && record.status === "draft" ? "selected" : record.status
    }));
    if (action === "approve") await window.ARCReportAssets.save(Object.assign({}, record, { status: "approved", selectedForFinal: true }));
    await load();
  }

  async function load() {
    if (!caseId()) {
      records = [];
      document.getElementById("rwCaseNotice").hidden = false;
      render();
      return;
    }
    document.getElementById("rwCaseNotice").hidden = true;
    try {
      records = await window.ARCReportAssets.list(type);
      render();
    } catch (error) {
      document.getElementById("rwCaseNotice").hidden = false;
      document.getElementById("rwCaseNotice").classList.add("error");
      document.getElementById("rwCaseNotice").textContent = error.message;
    }
  }

  // 18_External_Tools_Dashboard.html is the only remaining dashboard page
  // (data-dashboard="external"). The former "reports" and "evidence" dashboards
  // were folded into investigation.html, so this renders external tool links only.
  function renderDashboard() {
    setCaseHeader();
    const definitions = [
      ["Forensic Video Discovery", "03_Forensic_Video_Audit.html", "Open the ARC forensic video audit for the active case."],
      ["ARC OSINT", "24_Public_Web_Research.html", "Open ARC public web research for the active case."],
      ["OUI / Drug Defense", "oui-drug/index.html", "Open the OUI and drug-defense analyzer for the active ARC case."]
    ];
    document.getElementById("rwDashboard").innerHTML = definitions.map(item =>
      "<a class='rw-dash-link' href='" + esc(item[1]) + "' target='_blank' rel='noopener'><h2>" + esc(item[0]) + "</h2><p>" + esc(item[2]) + "</p></a>"
    ).join("");
  }

  function initWorkspace() {
    document.getElementById("rwPageTitle").textContent = config.title;
    document.getElementById("rwPageDescription").textContent = config.description;
    document.title = "ARC " + config.title;
    document.getElementById("rwAdd").textContent = "Add " + config.singular;
    document.getElementById("rwAdd").addEventListener("click", () => openForm());
    document.getElementById("rwSearch").addEventListener("input", event => { query = event.target.value; render(); });
    document.getElementById("rwFilter").addEventListener("change", event => { filter = event.target.value; render(); });
    document.getElementById("rwRecords").addEventListener("click", event => {
      const button = event.target.closest("[data-action]");
      const root = button && button.closest("[data-id]");
      if (button && root) act(button.dataset.action, byId(root.dataset.id)).catch(error => alert(error.message));
    });
    document.getElementById("rwDialogClose").addEventListener("click", () => document.getElementById("rwDialog").close());
    document.getElementById("rwFormCancel").addEventListener("click", () => document.getElementById("rwDialog").close());
    document.getElementById("rwForm").addEventListener("submit", submitForm);
    load();
  }

  function init() {
    pageTools();
    setCaseHeader();
    if (config) initWorkspace();
    else renderDashboard();
    document.addEventListener("arc:case-context", function () { config ? load() : renderDashboard(); });
    document.addEventListener("arc:report-assets", function () { config ? load() : renderDashboard(); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
