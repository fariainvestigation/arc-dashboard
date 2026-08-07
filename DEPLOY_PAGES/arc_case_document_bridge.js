/**
 * ARC shared case-document bridge.
 *
 * New Matter Initiation writes extracted, page-linked text here. ARC Notebook
 * and Discovery Review read the same records by canonical caseId. Original
 * file blobs remain in arc_case_intake_db and are referenced by originalFileId.
 */
(function (global) {
  "use strict";

  var DOC_DB = "ARC_CASE_DOCS_V1";
  var DOC_VERSION = 1;
  var DOC_STORE = "documents";
  var ACTIVE_KEY = "ARC_ACTIVE_CASE_V1";
  var INTAKE_DB = "arc_case_intake_db";
  var INTAKE_STORE = "files";

  function text(value) { return String(value == null ? "" : value).trim(); }

  function openDocumentsDb() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DOC_DB, DOC_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(DOC_STORE)) {
          var docs = db.createObjectStore(DOC_STORE, { keyPath: "id" });
          docs.createIndex("caseId", "caseId", { unique: false });
        }
        if (!db.objectStoreNames.contains("outputs")) {
          var outputs = db.createObjectStore("outputs", { keyPath: "id" });
          outputs.createIndex("caseId", "caseId", { unique: false });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function putDocument(record) {
    return openDocumentsDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(DOC_STORE, "readwrite");
        tx.objectStore(DOC_STORE).put(record);
        tx.oncomplete = function () { resolve(record); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function documentsByCase(caseId) {
    caseId = text(caseId);
    if (!caseId) return Promise.resolve([]);
    return openDocumentsDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(DOC_STORE, "readonly");
        var store = tx.objectStore(DOC_STORE);
        var index = store.index("caseId");
        var req = index.getAll(caseId);
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function deleteDocument(id) {
    return openDocumentsDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(DOC_STORE, "readwrite");
        tx.objectStore(DOC_STORE).delete(id);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function splitPages(rawText) {
    var source = String(rawText || "").replace(/\r\n?/g, "\n");
    if (!source.trim()) return [];
    var marker = /^\[Page\s+(\d+)\]\s*$/gim;
    var matches = [];
    var match;
    while ((match = marker.exec(source)) !== null) {
      matches.push({ number: Number(match[1]) || (matches.length + 1), start: match.index, bodyStart: marker.lastIndex });
    }
    if (!matches.length) return [{ n: 1, text: source.trim() }];
    return matches.map(function (row, index) {
      var end = index + 1 < matches.length ? matches[index + 1].start : source.length;
      return { n: row.number, text: source.slice(row.bodyStart, end).trim() };
    });
  }

  function normalizeStatus(value, pages) {
    var status = text(value).toUpperCase();
    if (status === "READY" || status === "PARTIAL" || status === "FAILED") return status;
    var readable = (pages || []).filter(function (page) { return text(page && page.text).length > 20; }).length;
    if (!readable) return "FAILED";
    return readable < (pages || []).length ? "PARTIAL" : "READY";
  }

  function setActiveCase(value) {
    var source = value && typeof value === "object" ? value : {};
    var record = {
      caseId: text(source.caseId || source.id),
      caseName: text(source.caseName || source.matter || source.subjectName),
      caseNo: text(source.caseNo || source.docket || source.docketNumber),
      court: text(source.court),
      clientName: text(source.clientName),
      subjectName: text(source.subjectName),
      investigator: text(source.investigator),
      updatedAt: new Date().toISOString()
    };
    if (!record.caseId) return record;
    try { localStorage.setItem(ACTIVE_KEY, JSON.stringify(record)); } catch (error) {}
    return record;
  }

  function getActiveCase() {
    try { return JSON.parse(localStorage.getItem(ACTIVE_KEY) || "null") || {}; }
    catch (error) { return {}; }
  }

  function openIntakeDb() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(INTAKE_DB, 1);
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(INTAKE_STORE)) db.createObjectStore(INTAKE_STORE, { keyPath: "id" });
      };
    });
  }

  function getIntakeFile(id) {
    id = text(id);
    if (!id) return Promise.resolve(null);
    return openIntakeDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var req = db.transaction(INTAKE_STORE, "readonly").objectStore(INTAKE_STORE).get(id);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    }).catch(function () { return null; });
  }

  function mirrorIntakeDocument(options) {
    var opts = options || {};
    var pages = Array.isArray(opts.pages) ? opts.pages : splitPages(opts.text);
    var record = {
      id: text(opts.id || opts.originalFileId),
      originalFileId: text(opts.originalFileId || opts.id),
      caseId: text(opts.caseId),
      name: text(opts.name) || "Untitled document",
      mime: text(opts.mime || opts.type),
      size: Number(opts.size || 0) || 0,
      uploadedAt: opts.uploadedAt || Date.now(),
      status: normalizeStatus(opts.status, pages),
      docType: text(opts.docType || opts.category),
      origin: text(opts.origin) || "intake",
      sha256: text(opts.sha256),
      pages: pages,
      extractionError: text(opts.extractionError),
      updatedAt: new Date().toISOString()
    };
    if (!record.id || !record.caseId) return Promise.reject(new Error("ARC document mirror requires id and caseId."));
    return putDocument(record);
  }

  global.ARCCaseDocuments = {
    DB_NAME: DOC_DB,
    STORE_NAME: DOC_STORE,
    ACTIVE_KEY: ACTIVE_KEY,
    put: putDocument,
    byCase: documentsByCase,
    remove: deleteDocument,
    splitPages: splitPages,
    normalizeStatus: normalizeStatus,
    setActiveCase: setActiveCase,
    getActiveCase: getActiveCase,
    getIntakeFile: getIntakeFile,
    mirrorIntakeDocument: mirrorIntakeDocument
  };
})(window);
