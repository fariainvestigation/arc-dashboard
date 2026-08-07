/*!
 * arc_case_link.js - ARC shared case link and progressive enrichment layer.
 *
 * Load this on every ARC page, after arc_unified_bridge.js and before any
 * module script. It does three jobs:
 *
 *   1. LISTENS on all five ARC case channels and keeps one merged record per
 *      case, so a field learned anywhere is known everywhere.
 *   2. FILLS MISSING FIELDS ONLY. A value that is already present is never
 *      silently replaced. A disagreement is recorded as a conflict for a human
 *      to resolve, because in a defense file a quietly overwritten docket or
 *      client name is worse than a blank one.
 *   3. EXPOSES window.ARCBridge, the interface Motion & Legal asks for and that
 *      nothing in ARC currently answers. Approved material only.
 *
 * Provenance is recorded per field: who supplied it, when, and at what
 * authority tier. Nothing here interprets or concludes.
 *
 * Storage:
 *   arc_case_field_ledger_v1   merged fields + provenance + conflicts, per case
 *   arc_unified_case_context_v1  (read/write) the existing published context
 */
(function (global) {
  "use strict";

  var LEDGER_KEY = "arc_case_field_ledger_v1";
  var CONTEXT_KEY = "arc_unified_case_context_v1";
  var LEDGER_VERSION = 1;

  /* ------------------------------------------------------------- fields ---
     The canonical vocabulary. Every one of these is read by at least one ARC
     module. The first six are identity: they are what makes two records the
     same case, so they carry the strictest conflict handling.
     ---------------------------------------------------------------------- */
  var IDENTITY_FIELDS = ["caseId", "docket", "clientName", "court", "matter", "incidentDate"];
  var FIELDS = [
    "caseId", "matter", "caseName", "docket", "court", "county",
    "clientName", "subjectName", "charges", "attorney", "attorneyFirm",
    "investigator", "status", "notes", "incidentDate"
  ];

  /* Aliases seen across modules, normalized to the canonical name above. */
  var ALIASES = {
    docketNumber: "docket",
    defendantName: "clientName",
    client: "clientName",
    name: "caseName",
    courtName: "court",
    assignedAttorney: "attorney",
    assignedInvestigator: "investigator",
    id: "caseId"
  };

  /* -------------------------------------------------------- authority ----
     A higher tier may correct a lower one. A lower tier may never overwrite a
     higher one; it can only fill a blank. This is the rule that keeps an AI
     extraction from rewriting what an investigator typed.
     ---------------------------------------------------------------------- */
  var TIERS = { registry: 40, verified: 30, entered: 20, extracted: 10, inferred: 5 };
  function tierOf(name) {
    var t = TIERS[String(name || "").toLowerCase()];
    return typeof t === "number" ? t : TIERS.extracted;
  }

  function text(v) {
    if (v == null) return "";
    if (Array.isArray(v)) {
      return v.map(function (x) { return text(x && x.charge ? x.charge : x); })
              .filter(Boolean).join("; ");
    }
    if (typeof v === "object") return text(v.value != null ? v.value : v.name);
    return String(v).trim();
  }
  function norm(v) { return text(v).toLowerCase().replace(/\s+/g, " "); }

  /* Docket numbers pick up punctuation and spacing differences between a court
     printout and a hand entry. Compare them stripped, store them as given. */
  function compareKey(field, value) {
    var v = norm(value);
    if (field === "docket") return v.replace(/[^a-z0-9]/g, "");
    if (field === "incidentDate") {
      var m = /(\d{4})-(\d{2})-(\d{2})/.exec(v);
      return m ? m[1] + m[2] + m[3] : v;
    }
    return v;
  }

  function canonicalField(key) {
    if (FIELDS.indexOf(key) !== -1) return key;
    return ALIASES[key] || "";
  }
  function now() { return new Date().toISOString(); }

  /* ------------------------------------------------------------ ledger --- */
  function blankLedger() { return { version: LEDGER_VERSION, cases: {}, updatedAt: now() }; }

  var ledger = blankLedger();
  var listeners = [];
  var applying = false;   // echo guard: suppresses our own rebroadcast

  function loadLedger() {
    try {
      var raw = JSON.parse(localStorage.getItem(LEDGER_KEY) || "null");
      if (raw && typeof raw === "object" && raw.cases) ledger = raw;
    } catch (e) { /* storage blocked or corrupt; run from memory */ }
  }
  function saveLedger() {
    ledger.updatedAt = now();
    try { localStorage.setItem(LEDGER_KEY, JSON.stringify(ledger)); }
    catch (e) { /* quota or private mode; the in-memory record still works */ }
  }

  function caseRecord(caseId) {
    var id = text(caseId);
    if (!id) return null;
    if (!ledger.cases[id]) {
      ledger.cases[id] = { caseId: id, fields: {}, conflicts: [], createdAt: now(), updatedAt: now() };
    }
    return ledger.cases[id];
  }

  /* ------------------------------------------------------------- merge ---
     Returns what changed, so callers can decide whether a rebroadcast is
     warranted. Three outcomes per field: filled, corroborated, or conflict.
     ---------------------------------------------------------------------- */
  function mergeField(rec, field, value, source, tier) {
    var incoming = text(value);
    if (!incoming) return null;

    var held = rec.fields[field];
    if (!held || !text(held.value)) {
      rec.fields[field] = {
        value: incoming, source: source, tier: tier, at: now(), corroboratedBy: []
      };
      return { field: field, action: "filled", value: incoming };
    }

    if (compareKey(field, held.value) === compareKey(field, incoming)) {
      if (held.corroboratedBy.indexOf(source) === -1 && source !== held.source) {
        held.corroboratedBy.push(source);
      }
      if (tier > held.tier) { held.tier = tier; held.source = source; held.value = incoming; }
      return { field: field, action: "corroborated", value: held.value };
    }

    /* Values disagree. A stronger tier corrects and keeps the old value on the
       record; anything else is logged and the held value stands. */
    if (tier > held.tier) {
      rec.conflicts.push({
        field: field, kept: incoming, superseded: held.value,
        source: source, previousSource: held.source, at: now(), resolved: true,
        note: "Corrected by a higher-authority source."
      });
      rec.fields[field] = {
        value: incoming, source: source, tier: tier, at: now(), corroboratedBy: []
      };
      return { field: field, action: "corrected", value: incoming };
    }

    var already = rec.conflicts.some(function (c) {
      return c.field === field && !c.resolved &&
             compareKey(field, c.proposed) === compareKey(field, incoming);
    });
    if (!already) {
      rec.conflicts.push({
        field: field, held: held.value, proposed: incoming,
        heldSource: held.source, source: source, at: now(), resolved: false,
        note: IDENTITY_FIELDS.indexOf(field) !== -1
          ? "Identity field disagreement. Resolve before this case is used for filing."
          : "Values disagree. The existing value was kept."
      });
      return { field: field, action: "conflict", value: held.value, proposed: incoming };
    }
    return null;
  }

  /**
   * contribute(caseId, fields, options)
   * Adds whatever this module has learned. Blanks are filled, matches are
   * corroborated, disagreements are recorded. Returns the change list.
   *
   *   ARCLink.contribute(caseId, { court: "Suffolk Superior", county: "Suffolk" },
   *                      { source: "discovery-extraction", tier: "extracted" });
   */
  function contribute(caseId, fields, options) {
    var opts = options || {};
    var rec = caseRecord(caseId);
    if (!rec || !fields || typeof fields !== "object") return [];

    var source = text(opts.source) || "unknown";
    var tier = tierOf(opts.tier);
    var changes = [];

    Object.keys(fields).forEach(function (rawKey) {
      var field = canonicalField(rawKey);
      if (!field || field === "caseId") return;
      var c = mergeField(rec, field, fields[rawKey], source, tier);
      if (c) changes.push(c);
    });

    if (!changes.length) return [];
    rec.updatedAt = now();
    saveLedger();
    audit(caseId, source, changes);

    var material = changes.filter(function (c) {
      return c.action === "filled" || c.action === "corrected";
    });
    if (material.length) broadcast(caseId, material, source);
    notify(caseId, changes);
    return changes;
  }

  function audit(caseId, source, changes) {
    if (!global.ARCUnified || typeof global.ARCUnified.auditEvent !== "function") return;
    try {
      global.ARCUnified.auditEvent({
        type: "case.fields.enriched", caseId: caseId, source: source,
        detail: changes.map(function (c) { return c.action + ":" + c.field; }).join(", ")
      });
    } catch (e) { /* auditing must never block enrichment */ }
  }

  /* ---------------------------------------------------------- read side --- */
  function merged(caseId) {
    var rec = ledger.cases[text(caseId)];
    var out = { caseId: text(caseId) };
    if (!rec) return out;
    FIELDS.forEach(function (f) {
      if (rec.fields[f]) out[f] = rec.fields[f].value;
    });
    /* Aliases every consumer already reads, so nothing needs rewriting. */
    out.docketNumber = out.docket || "";
    out.defendantName = out.clientName || "";
    out.caseName = out.caseName || out.matter || "";
    return out;
  }

  function provenance(caseId, field) {
    var rec = ledger.cases[text(caseId)];
    if (!rec) return null;
    return rec.fields[canonicalField(field) || field] || null;
  }
  function conflicts(caseId, includeResolved) {
    var rec = ledger.cases[text(caseId)];
    if (!rec) return [];
    return rec.conflicts.filter(function (c) { return includeResolved || !c.resolved; });
  }
  function resolveConflict(caseId, index, chosenValue, resolvedBy) {
    var rec = ledger.cases[text(caseId)];
    if (!rec || !rec.conflicts[index]) return false;
    var c = rec.conflicts[index];
    var value = text(chosenValue);
    if (!value) return false;
    rec.fields[c.field] = {
      value: value, source: text(resolvedBy) || "conflict-resolution",
      tier: TIERS.verified, at: now(), corroboratedBy: []
    };
    c.resolved = true;
    c.resolution = value;
    c.resolvedAt = now();
    rec.updatedAt = now();
    saveLedger();
    broadcast(caseId, [{ field: c.field, action: "corrected", value: value }], "conflict-resolution");
    notify(caseId, []);
    return true;
  }

  function missing(caseId) {
    var m = merged(caseId);
    return FIELDS.filter(function (f) { return !text(m[f]); });
  }

  /* --------------------------------------------------------- broadcast ---
     Republish the enriched context so every module autofills the newly known
     fields. `applying` suppresses the echo when our own broadcast comes back
     around through the listeners below.
     ---------------------------------------------------------------------- */
  function broadcast(caseId, changes, source) {
    if (applying) return;
    var ctx = merged(caseId);
    ctx.__arcEnriched = { at: now(), source: source, fields: changes.map(function (c) { return c.field; }) };

    applying = true;
    try {
      if (global.ARCUnified && typeof global.ARCUnified.setCase === "function") {
        try { global.ARCUnified.setCase(ctx); } catch (e) {}
      }
      try { localStorage.setItem(CONTEXT_KEY, JSON.stringify(ctx)); } catch (e) {}
      if (global.document && typeof global.document.dispatchEvent === "function") {
        try { global.document.dispatchEvent(new global.CustomEvent("arc:case-context", { detail: ctx })); } catch (e) {}
        try { global.document.dispatchEvent(new global.CustomEvent("arc:case-enriched", { detail: { caseId: caseId, changes: changes, context: ctx } })); } catch (e) {}
        try { global.document.dispatchEvent(new global.CustomEvent("arc:shared-storage", { detail: ctx })); } catch (e) {}
      }
      var msg = { type: "ARC_ACTIVE_CASE", version: 1, context: ctx };
      if (global.document && global.document.querySelectorAll) {
        Array.prototype.forEach.call(global.document.querySelectorAll("iframe"), function (f) {
          try { f.contentWindow.postMessage(msg, (location.protocol === "http:" || location.protocol === "https:") ? location.origin : "*"); } catch (e) {}
        });
      }
      if (global.parent && global.parent !== global) {
        try { global.parent.postMessage(msg, (location.protocol === "http:" || location.protocol === "https:") ? location.origin : "*"); } catch (e) {}
      }
    } finally {
      applying = false;
    }
  }

  function notify(caseId, changes) {
    listeners.forEach(function (fn) {
      try { fn({ caseId: caseId, changes: changes, context: merged(caseId) }); } catch (e) {}
    });
  }
  function onChange(fn) {
    if (typeof fn === "function") listeners.push(fn);
    return function () {
      var i = listeners.indexOf(fn);
      if (i !== -1) listeners.splice(i, 1);
    };
  }

  /* ------------------------------------------------------------ intake ---
     Anything arriving on a case channel is itself a contribution. This is what
     makes enrichment automatic rather than something each module opts into.
     ---------------------------------------------------------------------- */
  function absorb(ctx, source, tier) {
    if (applying || !ctx || typeof ctx !== "object") return;
    var id = text(ctx.caseId || ctx.id);
    if (!id) return;
    var payload = {};
    Object.keys(ctx).forEach(function (k) {
      if (k.indexOf("__") === 0) return;
      var f = canonicalField(k);
      if (f && f !== "caseId") payload[f] = ctx[k];
    });
    contribute(id, payload, { source: source, tier: tier });
  }

  function readContext() {
    try { return JSON.parse(localStorage.getItem(CONTEXT_KEY) || "null"); }
    catch (e) { return null; }
  }

  function attach() {
    if (!global.document || typeof global.document.addEventListener !== "function") return;

    global.document.addEventListener("arc:case-context", function (e) {
      absorb(e && e.detail, "case-dashboard", "registry");
    });
    global.document.addEventListener("arc:shared-storage", function () {
      absorb(readContext(), "case-dashboard", "registry");
    });
    if (typeof global.addEventListener === "function") {
      global.addEventListener("storage", function (e) {
        if (!e) return;
        if (e.key === CONTEXT_KEY) { absorb(readContext(), "case-dashboard", "registry"); }
        if (e.key === LEDGER_KEY) { loadLedger(); notify("", []); }   // another tab enriched
      });
      global.addEventListener("message", function (e) {
        var d = e && e.data;
        if (d && d.type === "ARC_ACTIVE_CASE" && d.context) absorb(d.context, "arc-shell", "registry");
      });
    }
  }

  /* Seed from whatever is already known when this file loads. */
  function bootstrap() {
    loadLedger();
    absorb(readContext(), "case-dashboard", "registry");
    if (global.ARCUnified && typeof global.ARCUnified.getCase === "function") {
      try { absorb(global.ARCUnified.getCase(), "arc-unified", "registry"); } catch (e) {}
    }
  }

  /* ----------------------------------------------------------- ARCBridge ---
     The interface Motion & Legal calls. Approved material only: suggested,
     draft, rejected, and unverified records never reach a motion.
     ---------------------------------------------------------------------- */
  function activeCaseId() {
    var ctx = readContext();
    if (ctx && text(ctx.caseId)) return text(ctx.caseId);
    if (global.ARCUnified && typeof global.ARCUnified.getCase === "function") {
      try {
        var c = global.ARCUnified.getCase();
        if (c && text(c.caseId)) return text(c.caseId);
      } catch (e) {}
    }
    return "";
  }

  function getActiveCase() {
    var id = activeCaseId();
    if (!id) return null;
    var m = merged(id);
    return {
      caseId: id,
      caseName: m.caseName || m.matter || "",
      clientName: m.clientName || "",
      defendantName: m.clientName || "",
      docket: m.docket || "",
      docketNumber: m.docket || "",
      court: m.court || "",
      county: m.county || "",
      charges: m.charges || "",
      attorney: m.attorney || "",
      attorneyFirm: m.attorneyFirm || "",
      investigator: m.investigator || "",
      status: m.status || "",
      incidentDate: m.incidentDate || ""
    };
  }

  function isApproved(x) {
    var s = norm(x && (x.reviewStatus || x.status || x.approvalStatus));
    if (x && x.approved === true) return true;
    return s === "approved" || s === "final" || s === "verified" || s === "released";
  }

  function getApprovedFindings(caseId) {
    var id = text(caseId) || activeCaseId();
    if (!id || !global.ARCUnified || typeof global.ARCUnified.getFindings !== "function") return [];
    var list = [];
    try { list = global.ARCUnified.getFindings(id) || []; } catch (e) { return []; }
    return list.filter(isApproved).map(function (f) {
      return {
        id: f.id || f.findingId || "",
        text: f.text || f.finding || f.summary || "",
        source: f.source || f.citation || "",
        approvedBy: f.reviewedBy || f.approvedBy || "",
        approvedAt: f.reviewedAt || f.approvedAt || ""
      };
    }).filter(function (f) { return text(f.text); });
  }

  /* Facts are the atomic, source-cited statements a motion may cite with
     [FACT:id]. They are drawn from approved findings and from evidence and
     field records that carry a citation. Anything without a source is dropped:
     an untraceable fact cannot be cited. */
  function getApprovedFacts(caseId) {
    var id = text(caseId) || activeCaseId();
    if (!id || !global.ARCUnified) return [];
    var out = [];
    var seen = {};

    function push(x, kind) {
      var body = text(x.text || x.statement || x.finding || x.summary || x.description);
      var src = text(x.source || x.citation || x.exhibit || x.reference);
      if (!body || !src) return;
      var key = norm(body);
      if (seen[key]) return;
      seen[key] = true;
      out.push({
        id: text(x.id || x.factId || x.findingId) || (kind + "_" + out.length),
        text: body, source: src, kind: kind,
        approvedBy: text(x.reviewedBy || x.approvedBy),
        approvedAt: text(x.reviewedAt || x.approvedAt)
      });
    }

    ["getFindings", "getEvidenceRecords", "getFieldRecords", "getSupplementalRecords"]
      .forEach(function (method) {
        if (typeof global.ARCUnified[method] !== "function") return;
        var rows = [];
        try { rows = global.ARCUnified[method](id) || []; } catch (e) { return; }
        rows.filter(isApproved).forEach(function (r) {
          push(r, method.replace("get", "").replace("Records", "").toLowerCase());
        });
      });

    return out;
  }

  /* ------------------------------------------------------- contract check ---
     ARCBridge reads findings and records through ARCUnified. If a method name
     is wrong or the unified bridge did not load, every read returns an empty
     array and the failure looks exactly like "this case has nothing approved".
     That is the worst possible failure mode, so we detect it and say so.
     ---------------------------------------------------------------------- */
  var REQUIRED = ["getCase"];
  var EXPECTED = ["getFindings", "getEvidenceRecords", "getFieldRecords",
                  "getSupplementalRecords", "auditEvent", "setCase"];

  function selfCheck() {
    var u = global.ARCUnified;
    if (!u) {
      return {
        ok: false, loaded: false, missing: REQUIRED.concat(EXPECTED),
        message: "ARCUnified is not loaded. Load arc_unified_bridge.js before arc_case_link.js. " +
                 "Until then no approved facts can be read and report drafting will refuse."
      };
    }
    var missing = REQUIRED.concat(EXPECTED).filter(function (m) {
      return typeof u[m] !== "function";
    });
    var blocking = REQUIRED.filter(function (m) { return typeof u[m] !== "function"; });
    return {
      ok: !blocking.length,
      loaded: true,
      missing: missing,
      blocking: blocking,
      message: missing.length
        ? "ARCUnified is missing: " + missing.join(", ") +
          ". Approved material from those sources cannot be read, so the report writer " +
          "will see fewer facts than the case actually holds."
        : "ARCUnified contract satisfied."
    };
  }

  /* Warn once, visibly, rather than degrading quietly. */
  function warnOnContract() {
    var c = selfCheck();
    if (c.ok && !c.missing.length) return;
    try {
      if (global.console && console.warn) console.warn("[ARCLink] " + c.message);
    } catch (e) {}
    try {
      if (global.document && global.document.dispatchEvent) {
        global.document.dispatchEvent(new global.CustomEvent("arc:contract-warning", { detail: c }));
      }
    } catch (e) {}
  }

  /* ---------------------------------------------------------------- API --- */
  var ARCLink = {
    contribute: contribute,
    get: merged,
    missing: missing,
    provenance: provenance,
    conflicts: conflicts,
    resolveConflict: resolveConflict,
    onChange: onChange,
    activeCaseId: activeCaseId,
    selfCheck: selfCheck,
    fields: FIELDS.slice(),
    identityFields: IDENTITY_FIELDS.slice(),
    _reset: function () { ledger = blankLedger(); saveLedger(); }
  };

  global.ARCLink = ARCLink;

  /* Install the bridge without stamping on a real one if it ever ships. */
  var existing = global.ARCBridge;
  global.ARCBridge = {
    getActiveCase: (existing && existing.getActiveCase) || getActiveCase,
    getApprovedFacts: (existing && existing.getApprovedFacts) || getApprovedFacts,
    getApprovedFindings: (existing && existing.getApprovedFindings) || getApprovedFindings
  };

  bootstrap();
  attach();
  warnOnContract();

})(typeof window !== "undefined" ? window : globalThis);
