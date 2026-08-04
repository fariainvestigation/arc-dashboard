/* ARC API client helpers — access token header + default board endpoint. */
(function (global) {
  "use strict";

  const TOKEN_SESSION_KEY = "arc_access_token_session_v1";
  const DEFAULT_BOARD_ENDPOINT = "/api/gemini-board-command";

  function getAccessToken() {
    try {
      return String(sessionStorage.getItem(TOKEN_SESSION_KEY) || "").trim();
    } catch (error) {
      return "";
    }
  }

  function setAccessToken(token) {
    try {
      const value = String(token || "").trim();
      if (value) sessionStorage.setItem(TOKEN_SESSION_KEY, value);
      else sessionStorage.removeItem(TOKEN_SESSION_KEY);
    } catch (error) {}
  }

  function clearAccessToken() {
    setAccessToken("");
  }

  function withAuthHeaders(headers) {
    const next = Object.assign({ "Content-Type": "application/json" }, headers || {});
    const token = getAccessToken();
    if (token) next["x-arc-token"] = token;
    return next;
  }

  async function apiFetch(url, options) {
    const opts = Object.assign({}, options || {});
    opts.headers = withAuthHeaders(opts.headers);
    opts.credentials = opts.credentials || "same-origin";
    return fetch(url, opts);
  }

  async function establishSession(token) {
    const value = String(token || "").trim();
    if (!value) throw new Error("Access token required");
    const response = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ token: value })
    });
    const data = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(data.error || "Session bootstrap failed");
    setAccessToken(value);
    return data;
  }

  global.ARCApi = {
    DEFAULT_BOARD_ENDPOINT: DEFAULT_BOARD_ENDPOINT,
    getAccessToken: getAccessToken,
    setAccessToken: setAccessToken,
    clearAccessToken: clearAccessToken,
    withAuthHeaders: withAuthHeaders,
    apiFetch: apiFetch,
    establishSession: establishSession
  };
})(window);
