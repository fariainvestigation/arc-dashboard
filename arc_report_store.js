/*!
 * arc_report_store.js - Durable report storage for ARC.
 *
 * Exposes window.ARCReportStore.
 *
 * Why IndexedDB and not localStorage:
 *   ARC reports are full HTML documents. Real ones in this system run from
 *   50 KB to over 4 MB. localStorage is a ~5-10 MB synchronous, string-only
 *   store shared with the case registry and every module's working state -
 *   two or three reports would exhaust it and every subsequent write in the
 *   whole application would start throwing QuotaExceededError. IndexedDB is
 *   asynchronous, typically allows hundreds of MB, and is evicted last.
 *
 * Split stores:
 *   meta - one small record per report. Read in full at startup so the
 *          dashboard can render counts and lists synchronously.
 *   body - the HTML and plain text. Fetched only when a report is actually
 *          opened, downloaded, or printed.
 */
(function (global) {
  "use strict";

  var DB_NAME = "ARC_Reports";
  var DB_VERSION = 1;
  var META = "meta";
  var BODY = "body";
  var dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!global.indexedDB) {
        reject(new Error("This browser has no IndexedDB, so reports cannot be stored. Private browsing mode is the usual cause."));
        return;
      }
      var request = global.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function (event) {
        var db = event.target.result;
        if (!db.objectStoreNames.contains(META)) {
          var meta = db.createObjectStore(META, { keyPath: "reportId" });
          meta.createIndex("caseId", "caseId", { unique: false });
          meta.createIndex("logicalKey", "logicalKey", { unique: false });
        }
        if (!db.objectStoreNames.contains(BODY)) {
          db.createObjectStore(BODY, { keyPath: "reportId" });
        }
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(new Error("Report storage could not be opened: " + (request.error && request.error.message))); };
      request.onblocked = function () { reject(new Error("Report storage is blocked by another open ARC tab. Close the other tab and reload.")); };
    });
    return dbPromise;
  }

  function tx(stores, mode, run) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var transaction = db.transaction(stores, mode);
        var out;
        transaction.oncomplete = function () { resolve(out); };
        transaction.onabort = transaction.onerror = function () {
          var err = transaction.error;
          if (err && err.name === "QuotaExceededError") {
            reject(new Error("Browser storage is full. Delete stored reports you no longer need, then retry."));
          } else {
            reject(new Error("Report storage write failed: " + (err && err.message ? err.message : "unknown error")));
          }
        };
        out = run(transaction);
      });
    });
  }

  /** Upsert one report. `meta.reportId` is the logical slot; a second put with
   *  the same id replaces the prior revision outright. */
  function put(meta, body) {
    return tx([META, BODY], "readwrite", function (transaction) {
      transaction.objectStore(META).put(meta);
      transaction.objectStore(BODY).put({
        reportId: meta.reportId,
        html: (body && body.html) || "",
        text: (body && body.text) || ""
      });
      return meta;
    });
  }

  function allMeta() {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var request = db.transaction(META, "readonly").objectStore(META).getAll();
        request.onsuccess = function () { resolve(request.result || []); };
        request.onerror = function () { reject(new Error("Stored reports could not be listed.")); };
      });
    });
  }

  function getMeta(reportId) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var request = db.transaction(META, "readonly").objectStore(META).get(reportId);
        request.onsuccess = function () { resolve(request.result || null); };
        request.onerror = function () { reject(new Error("That report record could not be read.")); };
      });
    });
  }

  function getBody(reportId) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var request = db.transaction(BODY, "readonly").objectStore(BODY).get(reportId);
        request.onsuccess = function () { resolve(request.result || null); };
        request.onerror = function () { reject(new Error("That report's contents could not be read.")); };
      });
    });
  }

  function remove(reportId) {
    return tx([META, BODY], "readwrite", function (transaction) {
      transaction.objectStore(META).delete(reportId);
      transaction.objectStore(BODY).delete(reportId);
      return true;
    });
  }

  function removeByCase(caseId) {
    return allMeta().then(function (list) {
      var ids = list.filter(function (m) { return m.caseId === caseId; }).map(function (m) { return m.reportId; });
      if (!ids.length) return 0;
      return tx([META, BODY], "readwrite", function (transaction) {
        var meta = transaction.objectStore(META);
        var body = transaction.objectStore(BODY);
        ids.forEach(function (id) { meta.delete(id); body.delete(id); });
        return ids.length;
      });
    });
  }

  /** Best-effort storage usage. Not supported everywhere; resolves null then. */
  function estimate() {
    if (!navigator.storage || !navigator.storage.estimate) return Promise.resolve(null);
    return navigator.storage.estimate().then(function (e) {
      return { usage: e.usage || 0, quota: e.quota || 0 };
    }).catch(function () { return null; });
  }

  global.ARCReportStore = {
    open: open,
    put: put,
    allMeta: allMeta,
    getMeta: getMeta,
    getBody: getBody,
    remove: remove,
    removeByCase: removeByCase,
    estimate: estimate
  };
})(window);
