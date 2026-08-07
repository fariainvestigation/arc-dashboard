/**
 * ARC backend adapter.
 *
 * The four-page entry layer talks ONLY to this file. ARC production is
 * Cloudflare Pages + Workers + D1 + R2 + Access; this adapter intentionally has
 * no Vercel/KV production fallback.
 *
 * Identity comes from Cloudflare Access. Every fetch sends credentials so the
 * Access cookie and the arc_session cookie both travel. No credential, key or
 * token is ever held in this file.
 */
(function (global) {
  "use strict";

  var BACKEND = "cloudflare";

  var ROUTES = {
    cloudflare: {
      whoami: "/sync/whoami",
      cases: "/sync/cases",
      caseById: function (id) { return "/sync/cases/" + encodeURIComponent(id); },
      summary: "/sync/dashboard/summary",
      health: "/sync/health"
    }
  };

  function routes() { return ROUTES.cloudflare; }

  /** Canonical ARC case id. Never derived from a display name or a docket. */
  var CASE_ID_PATTERN = /^[A-Za-z0-9_-]{4,64}$/;

  function isCaseId(value) {
    return CASE_ID_PATTERN.test(String(value || ""));
  }

  /**
   * Errors surfaced to the UI carry a short, safe message only. §19 forbids
   * leaking stack traces, internal structure or other users' identifiers.
   */
  function ArcBackendError(message, status) {
    var error = new Error(message);
    error.name = "ArcBackendError";
    error.status = status || 0;
    return error;
  }

  function safeMessage(status) {
    if (status === 401 || status === 403) return "Your session is not authenticated. Reload to sign in through Cloudflare Access.";
    if (status === 404) return "That record was not found, or you do not have access to it.";
    if (status === 409) return "This record was changed elsewhere. Reload before saving again.";
    if (status === 503) return "Storage is not available right now. Nothing was saved.";
    if (status >= 500) return "The ARC server could not complete the request.";
    if (status >= 400) return "The request could not be completed.";
    return "The ARC server could not be reached.";
  }

  async function request(path, options) {
    var opts = options || {};
    var response;
    try {
      response = await fetch(path, {
        method: opts.method || "GET",
        credentials: "include",
        cache: "no-store",
        headers: opts.body
          ? { "Content-Type": "application/json" }
          : undefined,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        signal: opts.signal
      });
    } catch (error) {
      throw ArcBackendError(safeMessage(0), 0);
    }
    if (!response.ok) {
      throw ArcBackendError(safeMessage(response.status), response.status);
    }
    if (response.status === 204) return null;
    try {
      return await response.json();
    } catch (error) {
      throw ArcBackendError("The ARC server returned an unreadable response.", response.status);
    }
  }

  /**
   * Authenticated identity. Returns null when identity cannot be confirmed.
   * §7: never fall back to a fake user and never hard-code an identity.
   */
  async function whoami() {
    // Local preview is intentionally available only when files are opened
    // directly from disk (or through the bundled localhost preview server).
    // Production HTTP(S) deployments still require the real authenticated
    // backend identity and never fall back to a fabricated user.
    var localPreview = location.protocol === "file:" ||
      ((location.hostname === "127.0.0.1" || location.hostname === "localhost") &&
       (location.port === "8080" || location.search.indexOf("arcLocal=1") >= 0));
    if (localPreview) {
      return { email: "local.preview@arc.invalid", userId: "local-preview", role: "investigator", source: "local-preview" };
    }
    var data = await request(routes().whoami);
    if (!data) return null;

    var email = String(data.email || "").trim();
    if (!email) return null;
    return { email: email, userId: String(data.sub || email), role: data.role || "investigator", source: "cloudflare-access" };
  }

  /**
   * Display name derived from the confirmed email only. Called after whoami
   * succeeds, never before. "rafael.faria@example.com" -> "Rafael Faria".
   */
  function displayName(user) {
    if (!user || !user.email) return "";
    var local = String(user.email).split("@")[0];
    return local
      .split(/[._-]+/)
      .filter(Boolean)
      .map(function (part) { return part.charAt(0).toUpperCase() + part.slice(1); })
      .join(" ");
  }

  /** Cases visible to the authenticated user. Scoping is enforced server-side. */
  async function listCases() {
    var data = await request(routes().cases);
    var rows = Array.isArray(data) ? data : (data && Array.isArray(data.cases) ? data.cases : []);
    return rows
      .map(function (row) {
        var id = String(row.id || row.caseId || "");
        return {
          id: id,
          name: String(row.name || (row.meta && row.meta.caseName) || "Untitled"),
          docket: String(row.docket || (row.meta && row.meta.docket) || ""),
          client: String(row.client || (row.meta && row.meta.clientName) || ""),
          court: String(row.court || (row.meta && row.meta.court) || ""),
          stage: String(row.stage || ""),
          updatedAt: row.updatedAt || row.__updatedAt || row.createdAt || null
        };
      })
      .filter(function (row) { return isCaseId(row.id); });
  }

  async function getCase(caseId) {
    if (!isCaseId(caseId)) throw ArcBackendError("That case id is not valid.", 400);
    return request(routes().caseById(caseId));
  }

  /**
   * Aggregate dashboard metrics. Computed server-side in one call rather than
   * an N+1 fetch per case from the browser. Any metric the server cannot
   * compute comes back null, and the UI renders an unavailable state for it
   * rather than inventing a number. §18.
   */
  async function dashboardSummary() {
    return request(routes().summary);
  }

  /** Storage / provider health, used for the Page 4 status strip. §18. */
  async function systemStatus() {
    return request(routes().health);
  }

  /* ------------------------------------------------ navigation state ------ */

  var ENTRY_MODE_KEY = "arcEntryMode";
  var ACTIVE_CASE_ID_KEY = "arcActiveCaseId";
  var ACTIVE_CASE_NAME_KEY = "arcActiveCaseName";

  function session(action, key, value) {
    try {
      if (action === "get") return sessionStorage.getItem(key) || "";
      if (action === "set") { sessionStorage.setItem(key, value); return value; }
      if (action === "remove") { sessionStorage.removeItem(key); return ""; }
    } catch (error) { /* private mode or storage disabled */ }
    return "";
  }

  function setEntryMode(mode) {
    var value = mode === "new" || mode === "open" ? mode : "";
    if (!value) return session("remove", ENTRY_MODE_KEY);
    return session("set", ENTRY_MODE_KEY, value);
  }

  function entryMode() {
    var fromUrl = "";
    try { fromUrl = new URLSearchParams(location.search).get("mode") || ""; } catch (error) {}
    var value = fromUrl || session("get", ENTRY_MODE_KEY);
    return value === "new" || value === "open" ? value : "";
  }

  /** Clears navigation state only. Never touches saved case records. §8. */
  function clearActiveCase() {
    session("remove", ACTIVE_CASE_ID_KEY);
    session("remove", ACTIVE_CASE_NAME_KEY);
  }

  function setActiveCase(caseId, caseName) {
    if (!isCaseId(caseId)) return "";
    session("set", ACTIVE_CASE_ID_KEY, caseId);
    if (caseName) session("set", ACTIVE_CASE_NAME_KEY, String(caseName).slice(0, 300));
    return caseId;
  }

  /**
   * The URL is authoritative. sessionStorage is a convenience fallback only,
   * and a display name is never accepted as an identifier. §13, §15.
   */
  function activeCaseId() {
    var fromUrl = "";
    try { fromUrl = new URLSearchParams(location.search).get("caseId") || ""; } catch (error) {}
    if (isCaseId(fromUrl)) return fromUrl;
    var stored = session("get", ACTIVE_CASE_ID_KEY);
    return isCaseId(stored) ? stored : "";
  }

  /** Guards against a double-click firing two case creations. §21. */
  function once(button, work) {
    if (!button) return;
    var busy = false;
    button.addEventListener("click", async function (event) {
      event.preventDefault();
      if (busy) return;
      busy = true;
      var label = button.getAttribute("aria-busy");
      button.setAttribute("aria-busy", "true");
      button.disabled = true;
      try {
        await work(event);
      } catch (error) {
        // Restore on controlled failure so the user can retry. §21.
        button.disabled = false;
        if (label === null) button.removeAttribute("aria-busy"); else button.setAttribute("aria-busy", label);
        throw error;
      }
      busy = false;
      button.disabled = false;
      if (label === null) button.removeAttribute("aria-busy"); else button.setAttribute("aria-busy", label);
    });
  }

  global.ARCBackend = {
    backend: BACKEND,
    isCaseId: isCaseId,
    whoami: whoami,
    displayName: displayName,
    listCases: listCases,
    getCase: getCase,
    dashboardSummary: dashboardSummary,
    systemStatus: systemStatus,
    setEntryMode: setEntryMode,
    entryMode: entryMode,
    setActiveCase: setActiveCase,
    activeCaseId: activeCaseId,
    clearActiveCase: clearActiveCase,
    once: once
  };
})(window);
