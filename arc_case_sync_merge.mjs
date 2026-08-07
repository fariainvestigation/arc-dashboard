/**
 * Pure case-sync merge helpers for ARC 11.7.4.
 * Browser bridge embeds the same algorithm; tests import this module.
 */

export const CASE_SYNC_FIELDS = [
  "matter", "docket", "court", "clientName", "subjectName", "attorney", "attorneyFirm",
  "charges", "nextCourtDate", "nextCourtEvent", "scope", "incidentDate", "priority",
  "status", "investigator", "notes", "source"
];

export function fieldFingerprint(value) {
  if (value == null) return "";
  if (typeof value === "object") {
    try { return JSON.stringify(value); } catch (_) { return String(value); }
  }
  return String(value);
}

/**
 * Three-way merge of scalar case fields.
 * base = last successfully synced snapshot
 * local = browser pending edits
 * server = newest D1 case
 *
 * Auto-merges when local and server touched different fields.
 * Records same-field conflicts when both changed a field to different values.
 */
export function rebaseCaseOnConflict(base, local, server) {
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
      // Keep local value visibly pending until the investigator chooses.
      merged[field] = l[field];
      return;
    }
    if (serverChanged && !localChanged) merged[field] = s[field];
    else if (localChanged) merged[field] = l[field];
    else merged[field] = s[field] != null && s[field] !== "" ? s[field] : l[field];
  });

  // Preserve complex collections from local when present; otherwise server.
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
    } else if (serverChanged && !localChanged) {
      merged[field] = s[field];
    } else if (localChanged) {
      merged[field] = l[field];
    } else {
      merged[field] = s[field] != null ? s[field] : l[field];
    }
  });

  merged.caseId = s.caseId || l.caseId || b.caseId || "";
  merged.id = merged.caseId;
  merged.__rev = Number(s.__rev || s.rev || 0) || 0;
  merged.__updatedAt = s.__updatedAt || s.updatedAt || l.__updatedAt || null;
  merged.__updatedBy = s.__updatedBy || s.updatedBy || "";
  merged.updatedAt = l.updatedAt || s.updatedAt || merged.__updatedAt;

  return { merged: merged, conflicts: conflicts, canAutoSave: conflicts.length === 0 };
}
