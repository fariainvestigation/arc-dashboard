/* ARC per-user auth session helper */
(function (global) {
  "use strict";

  const TOKEN_KEY = "arc_session_token_v1";
  const USER_KEY = "arc_auth_user_v1";

  function getToken() {
    try { return String(sessionStorage.getItem(TOKEN_KEY) || "").trim(); }
    catch (error) { return ""; }
  }

  function getUser() {
    try { return JSON.parse(sessionStorage.getItem(USER_KEY) || "null"); }
    catch (error) { return null; }
  }

  function setSession(token, user) {
    try {
      if (token) sessionStorage.setItem(TOKEN_KEY, token);
      else sessionStorage.removeItem(TOKEN_KEY);
      if (user) sessionStorage.setItem(USER_KEY, JSON.stringify(user));
      else sessionStorage.removeItem(USER_KEY);
    } catch (error) {}
  }

  function clearSession() {
    setSession("", null);
  }

  function withAuthHeaders(headers) {
    const next = Object.assign({ "Content-Type": "application/json" }, headers || {});
    const token = getToken();
    if (token) next["x-session-token"] = token;
    return next;
  }

  async function apiCall(method, path, body) {
    const response = await fetch(path, {
      method: method,
      headers: withAuthHeaders(),
      credentials: "same-origin",
      body: body ? JSON.stringify(body) : undefined
    });
    if (response.status === 401 && !String(path).includes("/api/auth/")) {
      clearSession();
      if (!/\/login\.html$/i.test(location.pathname)) {
        location.href = "/login.html?next=" + encodeURIComponent(location.pathname + location.search);
      }
      return null;
    }
    return response;
  }

  async function login(email, password) {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ email: email, password: password })
    });
    const data = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(data.error || "Login failed");
    setSession(data.token, data.user);
    return data;
  }

  async function logout() {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: withAuthHeaders(),
        credentials: "same-origin"
      });
    } catch (error) {}
    clearSession();
  }

  async function refresh() {
    const response = await fetch("/api/auth/session", {
      method: "GET",
      headers: withAuthHeaders(),
      credentials: "same-origin"
    });
    const data = await response.json().catch(function () { return {}; });
    if (data && data.authenticated && data.user) {
      setSession(getToken(), data.user);
      return data.user;
    }
    clearSession();
    return null;
  }

  global.arcAuth = {
    getToken: getToken,
    getSession: getUser,
    getUser: getUser,
    setSession: setSession,
    clearSession: clearSession,
    withAuthHeaders: withAuthHeaders,
    apiCall: apiCall,
    login: login,
    logout: logout,
    refresh: refresh
  };

  // Back-compat bridge for earlier ARCApi helper
  global.ARCApi = Object.assign({}, global.ARCApi || {}, {
    DEFAULT_BOARD_ENDPOINT: "/api/gemini-board-command",
    getAccessToken: getToken,
    setAccessToken: function (token) { setSession(token, getUser()); },
    clearAccessToken: clearSession,
    withAuthHeaders: withAuthHeaders,
    apiFetch: function (url, options) {
      const opts = Object.assign({}, options || {});
      opts.headers = withAuthHeaders(opts.headers);
      opts.credentials = opts.credentials || "same-origin";
      return fetch(url, opts).then(function (response) {
        if (response.status === 401) {
          clearSession();
        }
        return response;
      });
    },
    establishSession: async function () {
      throw new Error("Shared ARC_ACCESS_TOKEN gate removed. Use arcAuth.login(email, password).");
    }
  });
})(window);
