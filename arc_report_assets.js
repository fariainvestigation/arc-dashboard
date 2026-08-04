(function () {
  "use strict";

  const STORAGE_KEY = "arc_report_assets_v1";
  const CHANNEL_NAME = "arc-report-assets";
  const TYPES = ["picture", "video", "transcript", "translation", "motion"];
  const STATUSES = ["draft", "selected", "approved", "rejected", "included"];
  let channel = null;
  try { if ("BroadcastChannel" in window) channel = new BroadcastChannel(CHANNEL_NAME); } catch (error) {}

  function readLocal() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(value) ? value : [];
    } catch (error) {
      return [];
    }
  }

  function listLocal(type) {
    const activeCaseId = caseId();
    if (!activeCaseId) return [];
    return readLocal().filter(function (item) {
      return item.caseId === activeCaseId && (!type || item.type === type) && item.status !== "archived";
    });
  }

  function writeLocal(records) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    document.dispatchEvent(new CustomEvent("arc:report-assets", { detail: records }));
    if (channel) channel.postMessage({ type: "changed" });
    return records;
  }

  function caseContext() {
    return window.ARCUnified && typeof window.ARCUnified.getCase === "function"
      ? window.ARCUnified.getCase()
      : (window.ARC_CASE_CONTEXT || {});
  }

  function caseId() {
    const value = caseContext();
    return String(value.caseId || value.docket || value.matter || "").trim();
  }

  function uid(prefix) {
    return prefix + "_" + (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now() + "_" + Math.random().toString(16).slice(2));
  }

  function cleanRecord(value) {
    const source = value && typeof value === "object" ? value : {};
    const type = TYPES.includes(source.type) ? source.type : "picture";
    const status = STATUSES.includes(source.status) ? source.status : "draft";
    return Object.assign({}, source, {
      schemaVersion: 1,
      id: String(source.id || uid(type)).slice(0, 180),
      caseId: String(source.caseId || caseId()).slice(0, 240),
      type: type,
      title: String(source.title || "Untitled").slice(0, 400),
      description: String(source.description || "").slice(0, 50000),
      source: String(source.source || "").slice(0, 1000),
      citation: String(source.citation || "").slice(0, 2000),
      status: status,
      selectedForFinal: Boolean(source.selectedForFinal),
      reportOrder: Math.max(0, Number(source.reportOrder || 0)),
      updatedAt: source.updatedAt || new Date().toISOString(),
      createdAt: source.createdAt || new Date().toISOString()
    });
  }

  async function serverReady() {
    if (location.protocol === "file:") return false;
    try {
      const response = await fetch("/api/health", { cache: "no-store" });
      const payload = response.ok ? await response.json() : {};
      return Boolean(payload.reportAssets);
    } catch (error) {
      return false;
    }
  }

  function mirrorCase(records, activeCaseId) {
    const otherCases = readLocal().filter(function (item) { return item.caseId !== activeCaseId; });
    return writeLocal(otherCases.concat(records.map(cleanRecord)));
  }

  async function list(type) {
    const activeCaseId = caseId();
    if (!activeCaseId) return [];
    if (await serverReady()) {
      const response = await fetch("/api/report-assets?caseId=" + encodeURIComponent(activeCaseId), { cache: "no-store" });
      if (!response.ok) throw new Error((await response.json().catch(function () { return {}; })).error || "Report records could not be loaded");
      const records = await response.json();
      mirrorCase(records, activeCaseId);
      return records.filter(function (item) { return !type || item.type === type; });
    }
    return readLocal().filter(function (item) { return item.caseId === activeCaseId && (!type || item.type === type) && item.status !== "archived"; });
  }

  async function save(value) {
    const record = cleanRecord(value);
    if (!record.caseId) throw new Error("Select or create an active case first");
    if (await serverReady()) {
      const response = await fetch("/api/report-assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record)
      });
      const saved = await response.json().catch(function () { return {}; });
      if (!response.ok) throw new Error(saved.error || "Report record could not be saved");
      const local = readLocal().filter(function (item) { return !(item.caseId === saved.caseId && item.id === saved.id); });
      writeLocal(local.concat(cleanRecord(saved)));
      return saved;
    }
    const local = readLocal().filter(function (item) { return !(item.caseId === record.caseId && item.id === record.id); });
    writeLocal(local.concat(record));
    return record;
  }

  function uploadFile(record, file, onProgress) {
    return new Promise(async function (resolve, reject) {
      if (!file) return resolve(null);
      if (!(await serverReady())) return reject(new Error("File uploads require ARC to run through npm run serve"));
      const url = "/api/report-assets/files/" + encodeURIComponent(record.id) +
        "?caseId=" + encodeURIComponent(record.caseId) + "&filename=" + encodeURIComponent(file.name);
      const request = new XMLHttpRequest();
      request.open("PUT", url);
      request.setRequestHeader("Content-Type", file.type || "application/octet-stream");
      request.upload.onprogress = function (event) {
        if (event.lengthComputable && typeof onProgress === "function") onProgress(Math.round(event.loaded / event.total * 100));
      };
      request.onerror = function () { reject(new Error("The file upload failed")); };
      request.onload = function () {
        let payload = {};
        try { payload = JSON.parse(request.responseText || "{}"); } catch (error) {}
        if (request.status < 200 || request.status >= 300) return reject(new Error(payload.error || "The file upload failed"));
        resolve(payload);
      };
      request.send(file);
    });
  }

  async function saveWithFile(value, file, onProgress) {
    let record = cleanRecord(value);
    if (file) record.file = await uploadFile(record, file, onProgress);
    return save(record);
  }

  async function archive(record) {
    return save(Object.assign({}, record, { status: "archived", selectedForFinal: false }));
  }

  async function manifest() {
    const records = await list();
    return {
      schema: "arc-final-report-manifest",
      schemaVersion: 1,
      caseId: caseId(),
      caseContext: caseContext(),
      generatedAt: new Date().toISOString(),
      records: records.filter(function (item) {
        return item.selectedForFinal && ["approved", "included"].includes(item.status);
      }).sort(function (left, right) { return Number(left.reportOrder || 0) - Number(right.reportOrder || 0); })
    };
  }

  function fileUrl(record) {
    if (!record || !record.file || !record.file.relativePath || !record.caseId) return "";
    return "/api/report-assets/files/" + encodeURIComponent(record.id) + "?caseId=" + encodeURIComponent(record.caseId);
  }

  function download(name, type, content) {
    const blob = new Blob([content], { type: type });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = name;
    link.click();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 1500);
  }

  function downloadManifest() {
    return manifest().then(function (value) {
      const matter = String(value.caseContext.matter || value.caseId || "case").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
      download((matter || "case") + "-arc-report-manifest.json", "application/json", JSON.stringify(value, null, 2));
      return value;
    });
  }

  if (channel) channel.addEventListener("message", function () {
    document.dispatchEvent(new CustomEvent("arc:report-assets", { detail: readLocal() }));
  });

  window.ARCReportAssets = {
    STORAGE_KEY: STORAGE_KEY,
    TYPES: TYPES.slice(),
    STATUSES: STATUSES.slice(),
    caseContext: caseContext,
    caseId: caseId,
    listLocal: listLocal,
    list: list,
    save: save,
    saveWithFile: saveWithFile,
    archive: archive,
    manifest: manifest,
    fileUrl: fileUrl,
    download: download,
    downloadManifest: downloadManifest,
    serverReady: serverReady
  };
})();
