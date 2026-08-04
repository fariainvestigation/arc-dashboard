/* ARC localStorage quota manager */
(function (global) {
  "use strict";

  const QUOTA = 9 * 1024 * 1024;
  const AUDIT_KEY = "arc_unified_audit_v1";
  const REPORT_KEY = "arc_unified_report_inbox_v1";
  const AUDIT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

  function getStorageUsage() {
    let total = 0;
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        const value = localStorage.getItem(key) || "";
        total += (key.length + value.length) * 2;
      }
    } catch (error) {}
    return total;
  }

  function parseJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value == null ? fallback : value;
    } catch (error) {
      return fallback;
    }
  }

  function evictOldAuditLogs() {
    const audit = parseJson(AUDIT_KEY, []);
    if (!Array.isArray(audit)) return 0;
    const cutoff = Date.now() - AUDIT_RETENTION_MS;
    const filtered = audit.filter(function (entry) {
      return new Date(entry.createdAt || entry.timestamp || 0).getTime() > cutoff;
    });
    const removed = audit.length - filtered.length;
    if (removed > 0) localStorage.setItem(AUDIT_KEY, JSON.stringify(filtered));
    return removed;
  }

  function evictApprovedReports() {
    const inbox = parseJson(REPORT_KEY, []);
    if (!Array.isArray(inbox)) return 0;
    const before = JSON.stringify(inbox).length;
    const next = inbox.filter(function (report) {
      const status = String(report && (report.reviewStatus || report.approvalStatus) || "").toLowerCase();
      return status !== "approved";
    });
    if (next.length !== inbox.length) localStorage.setItem(REPORT_KEY, JSON.stringify(next));
    return Math.max(0, before - JSON.stringify(next).length);
  }

  function showStorageQuotaWarning(error) {
    if (document.getElementById("arc-storage-warning")) return;
    const dialog = document.createElement("div");
    dialog.id = "arc-storage-warning";
    dialog.setAttribute("role", "alert");
    dialog.style.cssText = "position:fixed;z-index:99999;left:16px;right:16px;bottom:16px;max-width:520px;margin:auto;padding:14px 16px;background:#fff8e6;border:1px solid #d6a100;border-radius:10px;color:#3b2f00;font:13px/1.45 Segoe UI,Arial,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.2)";
    dialog.innerHTML = "<strong>Storage nearly full</strong><p style='margin:8px 0'>" +
      (error.message || "Browser storage quota exceeded.") +
      "</p><p style='margin:0 0 10px'>Usage: " +
      (error.usage / 1024 / 1024).toFixed(1) + " MB / " +
      (error.quota / 1024 / 1024).toFixed(1) + " MB</p>" +
      "<button type='button' id='arc-storage-dismiss'>Dismiss</button>";
    document.body.appendChild(dialog);
    document.getElementById("arc-storage-dismiss").onclick = function () { dialog.remove(); };
  }

  function setItem(key, value) {
    const text = String(value);
    const currentUsage = getStorageUsage();
    const newValueSize = (String(key).length + text.length) * 2;
    if (currentUsage + newValueSize > QUOTA) {
      evictOldAuditLogs();
      evictApprovedReports();
      const revisedUsage = getStorageUsage();
      if (revisedUsage + newValueSize > QUOTA) {
        const error = {
          message: "Storage quota exceeded. Sync pending work to the server and clear old browser data.",
          usage: revisedUsage,
          quota: QUOTA,
          requested: newValueSize
        };
        showStorageQuotaWarning(error);
        throw error;
      }
    }
    localStorage.setItem(key, text);
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
    updateMeter: updateMeter
  };

  setInterval(updateMeter, 5000);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", updateMeter, { once: true });
  } else {
    updateMeter();
  }
})(window);
