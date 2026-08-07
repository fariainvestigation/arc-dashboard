/* ARC localStorage quota manager.
 *
 * Quota policy (v11.5): this module NEVER deletes stored data on its own.
 * Approved reports, evidence, hashes, approvals, and audit records may only be
 * removed through an explicit, reviewable archival/export action performed by
 * the investigator. When the quota would be exceeded, the existing value is
 * preserved, the write is rejected with a thrown ArcStorageQuotaError, and a
 * recovery message lists the largest entries so the user can archive/export.
 */
(function (global) {
  "use strict";

  const QUOTA = 9 * 1024 * 1024;

  function entrySize(key, value) {
    return (String(key).length + String(value).length) * 2;
  }

  function getStorageUsage() {
    let total = 0;
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        const value = localStorage.getItem(key) || "";
        total += entrySize(key, value);
      }
    } catch (error) {}
    return total;
  }

  function largestEntries(limit) {
    const entries = [];
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        const value = localStorage.getItem(key) || "";
        entries.push({ key: key, bytes: entrySize(key, value) });
      }
    } catch (error) {}
    entries.sort(function (a, b) { return b.bytes - a.bytes; });
    return entries.slice(0, limit || 5);
  }

  function buildQuotaError(key, usage, requested) {
    const largest = largestEntries(5);
    const detail = largest.map(function (entry) {
      return entry.key + " (" + (entry.bytes / 1024 / 1024).toFixed(2) + " MB)";
    }).join(", ");
    const error = new Error(
      'Storage quota exceeded while writing "' + key + '". Nothing was deleted and the previously stored value is preserved. ' +
      "To recover, use an explicit archival/export action to move data off this browser, then retry. " +
      "Largest entries: " + (detail || "none") + "."
    );
    error.name = "ArcStorageQuotaError";
    error.key = key;
    error.usage = usage;
    error.quota = QUOTA;
    error.requested = requested;
    error.largestEntries = largest;
    return error;
  }

  function showStorageQuotaWarning(error) {
    try {
      if (document.getElementById("arc-storage-warning")) return;
      const dialog = document.createElement("div");
      dialog.id = "arc-storage-warning";
      dialog.setAttribute("role", "alert");
      dialog.style.cssText = "position:fixed;z-index:99999;left:16px;right:16px;bottom:16px;max-width:520px;margin:auto;padding:14px 16px;background:#fff8e6;border:1px solid #d6a100;border-radius:10px;color:#3b2f00;font:13px/1.45 Segoe UI,Arial,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.2)";
      const title = document.createElement("strong");
      title.textContent = "Storage full - write rejected";
      const message = document.createElement("p");
      message.style.margin = "8px 0";
      message.textContent = error.message || "Browser storage quota exceeded.";
      const usage = document.createElement("p");
      usage.style.margin = "0 0 10px";
      usage.textContent = "Usage: " + (error.usage / 1024 / 1024).toFixed(1) + " MB / " + (error.quota / 1024 / 1024).toFixed(1) + " MB";
      const dismiss = document.createElement("button");
      dismiss.type = "button";
      dismiss.id = "arc-storage-dismiss";
      dismiss.textContent = "Dismiss";
      dismiss.onclick = function () { dialog.remove(); };
      dialog.appendChild(title);
      dialog.appendChild(message);
      dialog.appendChild(usage);
      dialog.appendChild(dismiss);
      document.body.appendChild(dialog);
    } catch (renderError) {}
  }

  function setItem(key, value) {
    const text = String(value);
    const currentUsage = getStorageUsage();
    let existing = null;
    try { existing = localStorage.getItem(key); } catch (error) {}
    const existingEntrySize = existing == null ? 0 : entrySize(key, existing);
    const replacementEntrySize = entrySize(key, text);
    // Replacing a key frees its current entry, so the projection must subtract
    // the existing entry size before adding the replacement entry size.
    const projectedUsage = currentUsage - existingEntrySize + replacementEntrySize;
    if (projectedUsage > QUOTA) {
      const error = buildQuotaError(key, currentUsage, replacementEntrySize);
      showStorageQuotaWarning(error);
      throw error; // Old value is preserved; callers handle the rejection.
    }
    try {
      localStorage.setItem(key, text);
    } catch (nativeError) {
      // The browser's real quota can be lower than our estimate. Fail closed:
      // preserve the old value and reject the write with the same recovery path.
      const error = buildQuotaError(key, getStorageUsage(), replacementEntrySize);
      showStorageQuotaWarning(error);
      throw error;
    }
  }

  function updateMeter() {
    const meter = document.getElementById("storage-progress");
    const label = document.getElementById("storage-label");
    if (!meter && !label) return;
    const pct = Number((getStorageUsage() / QUOTA * 100).toFixed(1));
    if (meter) meter.value = pct;
    if (label) label.textContent = pct + "%";
  }

  global.arcStorage = {
    getItem: function (key) { return localStorage.getItem(key); },
    setItem: setItem,
    removeItem: function (key) { localStorage.removeItem(key); },
    getUsage: getStorageUsage,
    getQuota: function () { return QUOTA; },
    getPercentage: function () { return (getStorageUsage() / QUOTA * 100).toFixed(1); },
    getLargestEntries: largestEntries,
    updateMeter: updateMeter
  };

  setInterval(updateMeter, 5000);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", updateMeter, { once: true });
  } else {
    updateMeter();
  }
})(window);
