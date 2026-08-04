# ARC v11.4 Fixes — Prioritized Action List

## Phase 1: Authentication (BLOCKER FOR EVERYTHING ELSE)
Must complete Phase 1 before any litigation data touches the system.

### [P1.1] CRITICAL: Implement Real Per-User Authentication
**Issue:** Optional ARC_ACCESS_TOKEN is a shared secret. If it leaks, attacker can read/modify every case.

**Location:** 
- `api/_lib/` (new: `auth.js`)
- `vercel.json` (update headers)
- All `/api/cases/*` and `/api/report-assets/*` routes
- Browser: new `arcAuthSession.js` module

**Effort:** HIGH (2–3 days)  
**Blocker for:** P1.2, P2.1, P2.2, P2.3, P3.1

**Implementation Steps:**

1. Create `api/_lib/auth.js`:
```javascript
/**
 * Authentication module for ARC.
 * Assumes Cloudflare Access provides oidc token in CF-Access-JWT-Assertion header.
 * Alternatively, use Vercel JWT tokens or session-based auth.
 */

const store = require("./store");

async function verifyCloudflareAccess(request) {
  // Cloudflare Access provides CF-Access-JWT-Assertion header
  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token) return null;
  
  // In production, validate signature with Cloudflare's public key
  // For now, trust Cloudflare (it's in front of the app)
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    
    const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());
    return {
      userId: payload.email || payload.sub,
      email: payload.email,
      groups: payload.groups || [],
      expiresAt: payload.exp * 1000
    };
  } catch (error) {
    return null;
  }
}

async function verifySessionToken(request) {
  // Alternative: session-based auth with signed JWT or opaque tokens
  const token = request.headers.get("x-session-token") || 
                (request.headers.get("cookie") || "").split("session=")[1];
  
  if (!token) return null;
  
  const session = await store.getJson("arc:session:" + token);
  if (!session || session.expiresAt < Date.now()) {
    return null;
  }
  
  return {
    userId: session.userId,
    email: session.email,
    expiresAt: session.expiresAt
  };
}

async function authenticate(request) {
  // Try Cloudflare Access first
  let user = await verifyCloudflareAccess(request);
  if (user) return user;
  
  // Fall back to session token
  user = await verifySessionToken(request);
  if (user) return user;
  
  return null;
}

function sendUnauthorized(response) {
  return {
    status: 401,
    body: JSON.stringify({ error: "Unauthorized" }),
    headers: { "Content-Type": "application/json" }
  };
}

module.exports = { authenticate, verifyCloudflareAccess, verifySessionToken, sendUnauthorized };
```

2. Update `api/_lib/http.js` to use authentication:
```javascript
// In handler wrapper, add auth check
async function authHandler(authRequired = true) {
  return async (request, response) => {
    if (authRequired) {
      const user = await authenticate(request);
      if (!user) return sendUnauthorized(response);
      request.user = user;
    }
    // ... rest of handler
  };
}
```

3. Update all `/api/cases/*` routes:
```javascript
// api/cases/index.js
const { authHandler } = require("../_lib/http");
const { authenticate } = require("../_lib/auth");

module.exports = authHandler(true)(async function (request, response) {
  const user = request.user;  // Now set by authHandler
  
  if (request.method === "GET") {
    // List only THIS USER'S cases
    const userKey = "arc:cases:index:" + user.userId;
    const ids = await store.readIndex(userKey);
    // ...
  }
  
  if (request.method === "POST") {
    // New case owned by THIS USER
    const payload = { ...body, ownerId: user.userId };
    await store.setJson(caseKey(id), payload);
    
    // Add to user's case index
    await store.addToIndex("arc:cases:index:" + user.userId, id);
  }
});
```

4. Update `/api/cases/[id].js`:
```javascript
// Verify user owns this case before allowing read/write
const caseData = await store.getJson(caseKey(id));
if (!caseData || caseData.ownerId !== user.userId) {
  return sendJson(response, 403, { error: "Access denied" });
}
```

5. Update browser-side authentication:
```javascript
// arcAuthSession.js (new)
(function (global) {
  "use strict";
  
  const SESSION_KEY = "arc_auth_session_v1";
  
  function getSession() {
    try {
      const session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
      if (session && session.expiresAt > Date.now()) {
        return session;
      }
    } catch (error) {}
    return null;
  }
  
  function setSession(session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }
  
  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
  }
  
  async function apiCall(method, path, body) {
    const session = getSession();
    const headers = {
      "Content-Type": "application/json"
    };
    
    if (session) {
      headers["x-session-token"] = session.token;
    }
    
    const response = await fetch(path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
    
    if (response.status === 401) {
      clearSession();
      window.location.href = "/login";
      return null;
    }
    
    return response;
  }
  
  global.arcAuth = {
    getSession,
    setSession,
    clearSession,
    apiCall
  };
})(window);
```

**Test:**
- Create two user accounts (Alice, Bob)
- Alice creates case "Case A", saves to server
- Bob tries to list cases → should not see Case A
- Bob tries to fetch `/api/cases/case-a-uuid` → should get 403 Forbidden
- Alice fetches `/api/cases/case-a-uuid` → should work

**Acceptance:** All API routes require valid auth header. Shared token no longer accepted.

---

### [P1.2] CRITICAL: Remove Optional Shared Token (ARC_ACCESS_TOKEN)
**Issue:** Fallback to shared secret allows bypass of per-user auth.

**Location:**
- All `/api/*` routes
- `vercel.json` (remove from headers example)
- Documentation

**Effort:** LOW (30 min)

**Implementation:**
```javascript
// REMOVE this pattern everywhere:
// const token = request.headers.get("x-arc-token") || getCookie(request, "arc_token");
// if (token === process.env.ARC_ACCESS_TOKEN) { ... }

// REPLACE with:
const user = await authenticate(request);  // Requires real auth now
if (!user) return sendUnauthorized(response);
```

**Test:**
- Attempt API call without auth header → 401
- Attempt API call with made-up token → 401
- Attempt API call with old ARC_ACCESS_TOKEN value → 401

**Acceptance:** No route accepts unauthenticated requests.

---

## Phase 2: Server-Side Persistence (Durability & Audit)
These fixes prevent data loss and enable compliance.

### [P2.1] CRITICAL: Move Audit Trail to Server
**Issue:** arc_unified_audit_v1 in localStorage lost on browser crash/cache clear. Courts demand audit history.

**Location:**
- `api/_lib/store.js` (add audit functions)
- New route: `api/audit-log.js` or `api/audit-log/index.js`
- Browser: update logging calls to sync to server

**Effort:** MEDIUM (1–2 days)

**Depends on:** P1.1 (per-user auth)

**Implementation Steps:**

1. Create `api/audit-log/index.js`:
```javascript
const { sendJson, readBody, handler } = require("../_lib/http");
const { authenticate } = require("../_lib/auth");
const store = require("../_lib/store");

module.exports = handler(async function (request, response) {
  const user = await authenticate(request);
  if (!user) return sendJson(response, 401, { error: "Unauthorized" });
  
  if (request.method === "POST") {
    // Log single audit entry
    const body = await readBody(request);
    const entry = {
      id: require("crypto").randomUUID(),
      timestamp: new Date().toISOString(),
      userId: user.userId,
      action: body.action,  // "save", "approve", "reject", "export", etc.
      caseId: body.caseId,
      reportId: body.reportId,
      details: body.details,
      synced: true
    };
    
    // Store in KV under audit:[caseId]
    const auditKey = "arc:audit:" + body.caseId;
    const logs = await store.getJson(auditKey) || [];
    logs.push(entry);
    await store.setJson(auditKey, logs);
    
    return sendJson(response, 200, entry);
  }
  
  if (request.method === "GET") {
    // List audit entries for a case
    const caseId = request.query.caseId;
    if (!caseId) return sendJson(response, 400, { error: "caseId required" });
    
    // Verify user owns case
    const caseData = await store.getJson("arc:case:" + caseId);
    if (!caseData || caseData.ownerId !== user.userId) {
      return sendJson(response, 403, { error: "Access denied" });
    }
    
    const logs = await store.getJson("arc:audit:" + caseId) || [];
    return sendJson(response, 200, { caseId, entries: logs });
  }
});
```

2. Create `api/audit-log/batch.js` for bulk logging:
```javascript
const { sendJson, readBody, handler } = require("../_lib/http");
const { authenticate } = require("../_lib/auth");
const store = require("../_lib/store");

module.exports = handler(async function (request, response) {
  const user = await authenticate(request);
  if (!user) return sendJson(response, 401, { error: "Unauthorized" });
  
  if (request.method === "POST") {
    // Log multiple audit entries (for syncing from browser)
    const body = await readBody(request);
    const entries = body.entries || [];
    
    for (const entry of entries) {
      // Verify user owns case
      const caseData = await store.getJson("arc:case:" + entry.caseId);
      if (!caseData || caseData.ownerId !== user.userId) {
        continue;  // Skip unauthorized entries
      }
      
      const auditKey = "arc:audit:" + entry.caseId;
      const logs = await store.getJson(auditKey) || [];
      
      logs.push({
        id: entry.id || require("crypto").randomUUID(),
        timestamp: new Date().toISOString(),
        userId: user.userId,
        action: entry.action,
        caseId: entry.caseId,
        details: entry.details,
        synced: true
      });
      
      await store.setJson(auditKey, logs);
    }
    
    return sendJson(response, 200, { synced: entries.length });
  }
});
```

3. Update browser logging in all tools:
```javascript
// Replace this:
// localStorage.setItem("arc_unified_audit_v1", JSON.stringify(logs));

// With this:
async function auditLog(action, caseId, details) {
  const entry = {
    timestamp: new Date().toISOString(),
    action,
    caseId,
    details,
    synced: false
  };
  
  // Local backup
  const localLogs = JSON.parse(localStorage.getItem("arc_unified_audit_v1") || "[]");
  localLogs.push(entry);
  localStorage.setItem("arc_unified_audit_v1", JSON.stringify(localLogs));
  
  // Sync to server (best-effort, don't block on failure)
  try {
    await fetch("/api/audit-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry)
    });
  } catch (error) {
    console.warn("Audit sync failed, will retry later:", error);
  }
}

// Periodically flush pending logs to server
setInterval(async () => {
  const logs = JSON.parse(localStorage.getItem("arc_unified_audit_v1") || "[]");
  const pending = logs.filter(entry => !entry.synced);
  
  if (pending.length > 0) {
    try {
      await fetch("/api/audit-log/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: pending })
      });
      
      // Mark as synced
      logs.forEach(entry => { entry.synced = true; });
      localStorage.setItem("arc_unified_audit_v1", JSON.stringify(logs));
    } catch (error) {
      // Retry next interval
    }
  }
}, 30000);  // Every 30 seconds
```

4. Add audit log viewer to 11 Reports Dashboard:
```html
<!-- In report review page, add audit trail tab -->
<div id="audit-log">
  <h3>Audit Trail</h3>
  <table id="audit-table">
    <thead>
      <tr>
        <th>Timestamp</th>
        <th>User</th>
        <th>Action</th>
        <th>Details</th>
      </tr>
    </thead>
    <tbody id="audit-body"></tbody>
  </table>
</div>

<script>
async function loadAuditLog(caseId) {
  const response = await arcAuth.apiCall("GET", "/api/audit-log?caseId=" + caseId);
  if (!response.ok) return;
  
  const data = await response.json();
  const tbody = document.getElementById("audit-body");
  
  data.entries.forEach(entry => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${new Date(entry.timestamp).toLocaleString()}</td>
      <td>${entry.userId}</td>
      <td>${entry.action}</td>
      <td>${JSON.stringify(entry.details)}</td>
    `;
    tbody.appendChild(row);
  });
}
</script>
```

**Test:**
- User approves report → entry logged to `/api/audit-log`
- Verify entry in KV: `redis-cli GET arc:audit:case-uuid` contains approval
- Clear browser cache → approve report again → both entries exist in KV
- Switch device/browser → audit trail still visible in /api/audit-log response

**Acceptance:** 
- Audit trail persists across browser restarts
- Court can request audit trail and it exists in server backup
- Approval history shows reviewer name, timestamp, action

---

### [P2.2] CRITICAL: Implement Optimistic Locking on Case Updates
**Issue:** Two tabs editing same case → last write wins, silent overwrite.

**Location:**
- `api/cases/[id].js` (PUT handler)
- Browser: update `arcSaveCase()` to include `updatedAt`

**Effort:** MEDIUM (1 day)

**Depends on:** P1.1 (authentication)

**Implementation Steps:**

1. Update `api/cases/[id].js`:
```javascript
const { sendJson, readBody, handler } = require("../_lib/http");
const { authenticate } = require("../_lib/auth");
const store = require("../_lib/store");

const caseKey = function (id) { return "arc:case:" + id; };

module.exports = handler(async function (request, response) {
  const user = await authenticate(request);
  if (!user) return sendJson(response, 401, { error: "Unauthorized" });
  
  const caseId = request.url.match(/\/api\/cases\/([^/?]+)/)[1];
  
  if (request.method === "PUT") {
    const body = await readBody(request);
    const previous = await store.getJson(caseKey(caseId));
    
    // Verify case ownership
    if (!previous || previous.ownerId !== user.userId) {
      return sendJson(response, 403, { error: "Access denied" });
    }
    
    // Check optimistic lock
    if (body.updatedAt && body.updatedAt !== previous.updatedAt) {
      // Conflict: client's version is stale
      return sendJson(response, 409, {
        error: "Case was modified. Your changes conflict.",
        conflict: {
          attemptedAt: body.updatedAt,
          currentUpdatedAt: previous.updatedAt,
          current: previous  // Send current version so client can merge
        }
      });
    }
    
    // Update succeeds
    const updated = {
      ...previous,
      ...body,
      updatedAt: new Date().toISOString(),
      modifiedBy: user.userId
    };
    
    await store.setJson(caseKey(caseId), updated);
    
    // Log audit entry
    await fetch("http://localhost:3000/api/audit-log", {  // Same origin in Vercel
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "case_updated",
        caseId: caseId,
        userId: user.userId,
        details: { modifiedFields: Object.keys(body).filter(k => k !== "updatedAt") }
      })
    }).catch(() => {});  // Non-blocking
    
    return sendJson(response, 200, updated);
  }
});
```

2. Update browser to include `updatedAt` on save:
```javascript
// In every tool that saves case data
async function saveCaseToServer(caseData) {
  // Fetch latest version first to get updatedAt
  const response = await arcAuth.apiCall("GET", "/api/cases/" + caseData.id);
  if (!response.ok) return;
  
  const current = await response.json();
  
  // Include updatedAt for optimistic lock
  const payload = {
    ...caseData,
    updatedAt: current.updatedAt  // Send server's timestamp
  };
  
  const saveResponse = await arcAuth.apiCall("PUT", "/api/cases/" + caseData.id, payload);
  
  if (saveResponse.status === 409) {
    // Conflict detected
    const conflict = await saveResponse.json();
    console.error("Edit conflict:", conflict.conflict);
    
    // Show merge dialog to user
    showMergeDialog(payload, conflict.conflict.current);
    return false;
  }
  
  if (saveResponse.ok) {
    const updated = await saveResponse.json();
    localStorage.setItem("arc_unified_case_context_v1", JSON.stringify(updated));
    return true;
  }
}

function showMergeDialog(attempted, current) {
  // UI: "Your changes conflict. Here's what changed on the server. Merge?"
  // Options: Keep mine, Use server's, Merge manually
}
```

**Test:**
- Tab A: edit investigator name, don't save yet
- Tab B: edit incident date, save successfully (updatedAt changes on server)
- Tab A: try to save → should get 409 Conflict with server version
- UI shows: "Your changes conflict. Server has newer version. Merge?"

**Acceptance:** 
- 409 Conflict response prevents overwrites
- User is notified of conflict
- Can see both versions before merging

---

### [P2.3] CRITICAL: Test KV Connectivity in Health Check
**Issue:** Reports `durable: true` based on env vars, not actual connectivity. Data written to ephemeral /tmp, lost on redeploy.

**Location:** `api/health.js`

**Effort:** LOW (1 hour)

**Depends on:** None (but helps diagnose P2.1, P2.2)

**Implementation:**
```javascript
const { sendJson, handler } = require("./_lib/http");
const store = require("./_lib/store");

module.exports = handler(async function (request, response) {
  const health = {
    status: "ok",
    version: "11.4.0",
    timestamp: new Date().toISOString()
  };
  
  // Test storage connectivity
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    try {
      const testKey = "arc:health-check:" + Date.now();
      await store.setJson(testKey, { test: true });
      const result = await store.getJson(testKey);
      
      health.storage = {
        mode: "kv",
        durable: result && result.test === true,  // Only true if actually works
        kvReachable: true,
        uptime: process.uptime()
      };
    } catch (error) {
      health.storage = {
        mode: "kv",
        durable: false,
        kvReachable: false,
        error: error.message
      };
    }
  } else {
    health.storage = {
      mode: process.env.VERCEL ? "ephemeral-tmp" : "local-file",
      durable: !process.env.VERCEL,  // Only local files are truly durable
      note: "KV not configured. Using " + 
            (process.env.VERCEL ? "ephemeral storage (data lost on redeploy)" : "local JSON")
    };
  }
  
  const statusCode = health.storage.durable ? 200 : 503;  // 503 if not durable
  return sendJson(response, statusCode, health);
});
```

**Test:**
```bash
# With KV working
curl https://www.arcdefensereport.com/api/health
# Should return: "durable": true, "kvReachable": true, status: 200

# With KV down
# Should return: "durable": false, "kvReachable": false, status: 503

# Without KV configured
# Should return: "durable": false, "mode": "ephemeral-tmp", status: 503
```

**Acceptance:**
- Health check actually tests KV
- Returns 503 if not durable (monitoring alerts)
- Clear indication whether data will survive redeploy

---

## Phase 3: Workflow Integrity (Approvals & Sync)
These fixes ensure report workflows work across devices and sessions.

### [P3.1] HIGH: Sync Report Approval Status to Server
**Issue:** Report approval saved in localStorage only. Switch device → approval invisible. Cross-device workflow breaks.

**Location:**
- New route: `api/report-approvals.js`
- Stage 4 (11 Reports Dashboard): update approval save logic
- Browser: sync approvals before export

**Effort:** MEDIUM (1–2 days)

**Depends on:** P1.1 (authentication)

**Implementation Steps:**

1. Create `api/report-approvals.js`:
```javascript
const { sendJson, readBody, handler } = require("./_lib/http");
const { authenticate } = require("./_lib/auth");
const store = require("./_lib/store");

module.exports = handler(async function (request, response) {
  const user = await authenticate(request);
  if (!user) return sendJson(response, 401, { error: "Unauthorized" });
  
  if (request.method === "POST") {
    // Log approval
    const body = await readBody(request);
    const { reportId, caseId, status } = body;  // "approved" or "rejected"
    
    // Verify case ownership
    const caseData = await store.getJson("arc:case:" + caseId);
    if (!caseData || caseData.ownerId !== user.userId) {
      return sendJson(response, 403, { error: "Access denied" });
    }
    
    const approval = {
      id: require("crypto").randomUUID(),
      reportId,
      caseId,
      status,
      reviewerId: user.userId,
      reviewerEmail: user.email,
      timestamp: new Date().toISOString()
    };
    
    // Store approval
    const appKey = "arc:approval:" + reportId;
    await store.setJson(appKey, approval);
    
    // Add to case's approvals index
    const approvalIndex = await store.readIndex("arc:case:" + caseId + ":approvals");
    if (!approvalIndex.includes(reportId)) {
      await store.addToIndex("arc:case:" + caseId + ":approvals", reportId);
    }
    
    // Log audit
    await auditLog("report_" + status, caseId, { reportId });
    
    return sendJson(response, 200, approval);
  }
  
  if (request.method === "GET") {
    // List approvals for a case
    const caseId = request.query.caseId;
    if (!caseId) return sendJson(response, 400, { error: "caseId required" });
    
    const caseData = await store.getJson("arc:case:" + caseId);
    if (!caseData || caseData.ownerId !== user.userId) {
      return sendJson(response, 403, { error: "Access denied" });
    }
    
    const reportIds = await store.readIndex("arc:case:" + caseId + ":approvals");
    const approvals = [];
    
    for (const reportId of reportIds) {
      const approval = await store.getJson("arc:approval:" + reportId);
      if (approval) approvals.push(approval);
    }
    
    return sendJson(response, 200, { caseId, approvals });
  }
});
```

2. Update Stage 4 (Reports Dashboard) approval UI:
```javascript
// In 11_Reports_Dashboard.html or similar
async function approveReport(reportId, caseId) {
  // Save locally first (for immediate feedback)
  const localApproval = {
    reportId,
    caseId,
    status: "approved",
    timestamp: new Date().toISOString(),
    synced: false
  };
  
  const approvals = JSON.parse(localStorage.getItem("arc_report_approvals_v1") || "[]");
  approvals.push(localApproval);
  localStorage.setItem("arc_report_approvals_v1", JSON.stringify(approvals));
  
  // Sync to server
  try {
    const response = await arcAuth.apiCall("POST", "/api/report-approvals", {
      reportId,
      caseId,
      status: "approved"
    });
    
    if (response.ok) {
      // Mark as synced
      localApproval.synced = true;
      localStorage.setItem("arc_report_approvals_v1", JSON.stringify(approvals));
      
      // Show confirmation
      showNotification("Report approved and synced to server");
    } else {
      showNotification("Local approval saved, but server sync failed. Will retry.");
    }
  } catch (error) {
    showNotification("Local approval saved, but server sync failed. Will retry.");
  }
}

async function getReportApproval(reportId) {
  // Check local first
  const approvals = JSON.parse(localStorage.getItem("arc_report_approvals_v1") || "[]");
  const local = approvals.find(a => a.reportId === reportId);
  if (local && local.synced) return local;
  
  // If no local, fetch from server
  if (!local) {
    const caseId = getCurrentCaseId();
    const response = await arcAuth.apiCall("GET", "/api/report-approvals?caseId=" + caseId);
    if (response.ok) {
      const data = await response.json();
      const approval = data.approvals.find(a => a.reportId === reportId);
      return approval;
    }
  }
  
  return local || null;
}
```

3. Before exporting, verify approvals are on server:
```javascript
async function exportFinalReport() {
  const caseId = getCurrentCaseId();
  
  // Get list of reports to include
  const selectedReports = getSelectedReports();
  
  // Check each is approved on server
  const response = await arcAuth.apiCall("GET", "/api/report-approvals?caseId=" + caseId);
  const serverApprovals = await response.json();
  
  for (const reportId of selectedReports) {
    const approval = serverApprovals.approvals.find(a => a.reportId === reportId);
    if (!approval || approval.status !== "approved") {
      showError("Report " + reportId + " is not approved on server. Approval may have been lost.");
      return;
    }
  }
  
  // Safe to export
  proceedWithExport();
}
```

**Test:**
- Device A: Approve report, sync succeeds
- Device A: Check /api/report-approvals?caseId=xyz → approval exists
- Device B (new browser): Load same case → fetch /api/report-approvals → approval visible
- Device A: Clear localStorage → approvals still exist via API
- Try to export without server approval → blocked

**Acceptance:**
- Approval status persists across devices
- Device B sees Device A's approvals
- Cannot export unapproved reports

---

### [P3.2] HIGH: Fix BroadcastChannel Fallback for Separate Windows
**Issue:** Two windows don't share BroadcastChannel context. Easy to get out of sync.

**Location:** `arc_unified_bridge.js`

**Effort:** MEDIUM (1 day)

**Depends on:** P2.1 (server-persisted case data)

**Implementation:**
```javascript
// arc_unified_bridge.js
(function () {
  "use strict";
  
  const CASE_KEY = "arc_unified_case_context_v1";
  const POLL_INTERVAL = 5000;  // Poll server every 5 seconds
  
  // Try BroadcastChannel for same-window sync
  let channel = null;
  try {
    if ("BroadcastChannel" in window) {
      channel = new BroadcastChannel("arc-unified-system");
      channel.onmessage = (event) => {
        if (event.data.type === "case-update") {
          localStorage.setItem(CASE_KEY, JSON.stringify(event.data.case));
          document.dispatchEvent(new CustomEvent("arc:case-updated", { 
            detail: event.data.case 
          }));
        }
      };
    }
  } catch (error) {
    console.warn("BroadcastChannel not available");
  }
  
  // Fallback: Poll server for case updates (cross-window sync)
  setInterval(async () => {
    const currentCase = JSON.parse(localStorage.getItem(CASE_KEY) || "{}");
    if (!currentCase.id) return;  // No case loaded
    
    try {
      const response = await fetch("/api/cases/" + currentCase.id);
      if (!response.ok) return;
      
      const serverCase = await response.json();
      
      // Check if server version is newer
      if (serverCase.updatedAt !== currentCase.updatedAt) {
        // Server has a newer version
        console.log("Case updated on server, syncing local context");
        localStorage.setItem(CASE_KEY, JSON.stringify(serverCase));
        
        // Notify all tools
        document.dispatchEvent(new CustomEvent("arc:case-updated", { 
          detail: serverCase 
        }));
        
        // If BroadcastChannel exists, also broadcast (for other tabs)
        if (channel) {
          channel.postMessage({
            type: "case-update",
            case: serverCase
          });
        }
      }
    } catch (error) {
      console.warn("Case sync failed:", error);
    }
  }, POLL_INTERVAL);
  
  // When user shares case locally, also sync to server
  const originalShareCase = window.arcShareCase;
  window.arcShareCase = async function(caseId) {
    // Call original
    if (originalShareCase) originalShareCase(caseId);
    
    // Also sync to server (POST to /api/cases to ensure it's persisted)
    try {
      const caseData = JSON.parse(localStorage.getItem(CASE_KEY) || "{}");
      if (caseData.id === caseId) {
        await fetch("/api/cases/" + caseId, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(caseData)
        });
      }
    } catch (error) {
      console.warn("Failed to sync case to server");
    }
  };
})();
```

**Test:**
- Window A: Load case, share it (broadcasts)
- Window B: Open same case in separate window
- Window A: Edit case metadata, save
- Wait 5 seconds
- Window B: Should automatically refresh case context (no manual refresh needed)
- Edit something in Window B
- Window A: Should pick up changes from Window B

**Acceptance:**
- Windows without BroadcastChannel (separate windows) still sync
- Poll-based fallback every 5 seconds
- No stale context in separate windows

---

### [P3.3] HIGH: Implement localStorage Quota Management
**Issue:** Multiple cases + metadata + audit logs fill 5–10 MB quota. Silently fails when full.

**Location:** Browser storage wrapper (new: `arcStorageManager.js`)

**Effort:** MEDIUM (1 day)

**Implementation:**
```javascript
// arcStorageManager.js (new module in every tool)
(function (global) {
  "use strict";
  
  const QUOTA = 9 * 1024 * 1024;  // 9 MB (leaving 1 MB safety margin)
  const AUDIT_LOG_RETENTION = 30 * 24 * 60 * 60 * 1000;  // 30 days
  
  function getStorageUsage() {
    let total = 0;
    for (const key in localStorage) {
      const value = localStorage.getItem(key);
      total += (key.length + value.length) * 2;  // UTF-16
    }
    return total;
  }
  
  function evictOldAuditLogs() {
    const audit = JSON.parse(localStorage.getItem("arc_unified_audit_v1") || "[]");
    const cutoff = Date.now() - AUDIT_LOG_RETENTION;
    const filtered = audit.filter(entry => 
      new Date(entry.timestamp).getTime() > cutoff
    );
    
    const saved = audit.length - filtered.length;
    if (saved > 0) {
      localStorage.setItem("arc_unified_audit_v1", JSON.stringify(filtered));
      console.log("Evicted " + saved + " old audit logs");
    }
    
    return (audit.length - filtered.length) * 500;  // Rough bytes saved
  }
  
  function evictOldReportData() {
    // Evict approved reports (they're on server)
    const inbox = JSON.parse(localStorage.getItem("arc_unified_report_inbox_v1") || "{}");
    let bytesFreed = 0;
    
    for (const key in inbox) {
      const series = inbox[key];
      if (series.status === "approved") {
        const size = JSON.stringify(series).length * 2;
        delete inbox[key];
        bytesFreed += size;
      }
    }
    
    if (bytesFreed > 0) {
      localStorage.setItem("arc_unified_report_inbox_v1", JSON.stringify(inbox));
    }
    
    return bytesFreed;
  }
  
  function setItem(key, value) {
    const currentUsage = getStorageUsage();
    const newValueSize = (key.length + value.length) * 2;
    
    if (currentUsage + newValueSize > QUOTA) {
      console.warn("Storage quota exceeded (" + currentUsage + " / " + QUOTA + " bytes)");
      
      // Try to free space
      let freed = 0;
      freed += evictOldAuditLogs();
      freed += evictOldReportData();
      
      console.log("Evicted " + freed + " bytes");
      
      // Check again
      const revisedUsage = getStorageUsage();
      if (revisedUsage + newValueSize > QUOTA) {
        const error = {
          message: "Storage quota exceeded. Please sync pending cases to server and clear browser data.",
          usage: revisedUsage,
          quota: QUOTA,
          requested: newValueSize
        };
        
        // Show UI warning
        showStorageQuotaWarning(error);
        throw error;
      }
    }
    
    localStorage.setItem(key, value);
  }
  
  function showStorageQuotaWarning(error) {
    const dialog = document.createElement("div");
    dialog.className = "arc-storage-warning";
    dialog.innerHTML = `
      <div style="padding: 20px; background: #fff3cd; border: 1px solid #ffc107; border-radius: 4px;">
        <h3>Storage Nearly Full</h3>
        <p>${error.message}</p>
        <p>Usage: ${(error.usage / 1024 / 1024).toFixed(1)} MB / ${(error.quota / 1024 / 1024).toFixed(1)} MB</p>
        <button onclick="this.parentElement.parentElement.remove()">Dismiss</button>
        <button onclick="arcSyncPendingToServer()">Sync Now</button>
      </div>
    `;
    document.body.insertBefore(dialog, document.body.firstChild);
  }
  
  global.arcStorage = {
    getItem: (key) => localStorage.getItem(key),
    setItem,
    removeItem: (key) => localStorage.removeItem(key),
    getUsage: getStorageUsage,
    getQuota: () => QUOTA,
    getPercentage: () => (getStorageUsage() / QUOTA * 100).toFixed(1)
  };
})(window);
```

2. Update all localStorage.setItem calls:
```javascript
// Replace:
// localStorage.setItem("arc_unified_case_context_v1", JSON.stringify(case));

// With:
arcStorage.setItem("arc_unified_case_context_v1", JSON.stringify(case));
```

3. Add storage monitor to toolbar:
```html
<!-- In index.html header -->
<div id="storage-meter" style="display: flex; align-items: center; gap: 8px; padding: 8px;">
  <label style="font-size: 12px;">Storage:</label>
  <progress id="storage-progress" max="100" style="width: 100px;"></progress>
  <span id="storage-label" style="font-size: 11px;"></span>
</div>

<script>
setInterval(() => {
  const pct = arcStorage.getPercentage();
  document.getElementById("storage-progress").value = pct;
  document.getElementById("storage-label").textContent = pct + "%";
  
  if (pct > 90) {
    document.getElementById("storage-meter").style.backgroundColor = "#fff3cd";
  } else if (pct > 75) {
    document.getElementById("storage-meter").style.backgroundColor = "#e8f5e9";
  }
}, 1000);
</script>
```

**Test:**
- Create 10 cases with metadata
- Storage meter should show ~50–70%
- Approve reports (should evict from localStorage since they're on server)
- Storage should decrease
- Try to create case when quota full → should evict old audit logs, retry
- Monitor shouldn't show errors if eviction succeeds

**Acceptance:**
- Storage meter visible to user
- Auto-eviction of old data prevents silent failures
- Clear warning when quota exceeded
- Option to sync and clear

---

## Phase 4: Data Validation (Compliance & Integrity)
These fixes ensure exported reports actually contain approved data.

### [P4.1] HIGH: Validate Report Asset Approvals in Manifest
**Issue:** `/api/report-assets/manifest` returns assets marked "approved" without verifying approval was stored server-side.

**Location:** `api/report-assets/manifest.js`

**Effort:** MEDIUM (1 day)

**Depends on:** P2.1 (audit logs), P3.1 (approval status storage)

**Implementation:**
```javascript
// api/report-assets/manifest.js
const { sendJson, handler } = require("../_lib/http");
const { authenticate } = require("../_lib/auth");
const store = require("../_lib/store");

module.exports = handler(async function (request, response) {
  const user = await authenticate(request);
  if (!user) return sendJson(response, 401, { error: "Unauthorized" });
  
  const caseId = request.query.caseId;
  if (!caseId) return sendJson(response, 400, { error: "caseId required" });
  
  // Verify case ownership
  const caseData = await store.getJson("arc:case:" + caseId);
  if (!caseData || caseData.ownerId !== user.userId) {
    return sendJson(response, 403, { error: "Access denied" });
  }
  
  // Get list of assets selected for report
  const selectedAssets = request.query.assetIds?.split(",") || [];
  
  const approved = [];
  const unapproved = [];
  
  for (const assetId of selectedAssets) {
    const asset = await store.getJson("arc:asset:" + assetId);
    if (!asset) continue;
    
    // Check if approval exists on server
    const approval = await store.getJson("arc:approval:asset:" + assetId);
    
    if (approval && approval.status === "approved") {
      approved.push({
        ...asset,
        approval: {
          approvedBy: approval.reviewerId,
          approvedAt: approval.timestamp
        }
      });
    } else {
      unapproved.push({
        ...asset,
        approval: null
      });
    }
  }
  
  // If any unapproved assets, return 409 Conflict
  if (unapproved.length > 0) {
    return sendJson(response, 409, {
      error: "Cannot include unapproved assets in final report",
      approved: approved.length,
      unapproved: unapproved.length,
      unapprovedAssets: unapproved.map(a => ({
        id: a.id,
        name: a.name,
        approval: null
      })),
      message: "The following assets are not approved on the server: " + 
               unapproved.map(a => a.name).join(", ")
    });
  }
  
  return sendJson(response, 200, {
    caseId,
    assets: approved,
    count: approved.length,
    generatedAt: new Date().toISOString(),
    certification: {
      allApproved: true,
      reviewedBy: user.userId
    }
  });
});
```

**Test:**
- Approve Asset A on server
- Select Asset A + Asset B for export
- Call `/api/report-assets/manifest?caseId=xyz&assetIds=A,B`
- Should return 409 Conflict with list of unapproved assets
- Approve Asset B on server
- Call again → should return 200 with both assets

**Acceptance:**
- Cannot export reports with unapproved assets
- Clear error message showing which assets are unapproved
- Certification flag indicates all assets were server-approved

---

## Phase 5: Performance & UX (Medium Priority)
These fixes improve speed and reliability.

### [P5.1] MEDIUM: Batch KV Operations for List Queries
**Issue:** `GET /api/cases` does N+1 queries (list index, then read each case). Slow.

**Location:** `api/_lib/store.js`, `api/cases/index.js`

**Effort:** MEDIUM (1 day)

**Implementation:**
```javascript
// api/_lib/store.js - add batch operations
async function batchGetJson(keys) {
  // If using Upstash Redis, use MGET
  if (kvEnabled) {
    const mgetCommand = ["MGET", ...keys];
    const results = await kv(mgetCommand);
    return results.map((value, i) => {
      try {
        return value ? JSON.parse(value) : null;
      } catch (error) {
        return null;
      }
    });
  }
  
  // Fallback: sequential reads
  const results = [];
  for (const key of keys) {
    results.push(await getJson(key));
  }
  return results;
}

module.exports = { ..., batchGetJson };
```

Then use in `/api/cases`:
```javascript
// api/cases/index.js
if (request.method === "GET") {
  const userKey = "arc:cases:index:" + user.userId;
  const ids = await store.readIndex(userKey);
  
  // Batch read all cases
  const caseKeys = ids.map(id => "arc:case:" + id);
  const caseObjects = await store.batchGetJson(caseKeys);
  
  const cases = caseObjects
    .filter(c => c !== null)
    .map(c => ({
      id: c.id,
      name: c.name,
      docket: c.docket,
      updatedAt: c.updatedAt
    }));
  
  return sendJson(response, 200, cases);
}
```

**Test:**
- List cases with 10 cases existing
- Should take ~200ms (1 round-trip), not 1+ second (N round-trips)

**Acceptance:** Case list loads in <500ms

---

### [P5.2] MEDIUM: Add Caching to Geocoding & Routing
**Issue:** Every location search hits Nominatim. Repeated queries = rate limiting for all users.

**Location:** `api/geocoding/search.js`, `api/routing/route.js`

**Effort:** MEDIUM (1 day)

**Implementation:**
```javascript
// api/geocoding/search.js
const { sendJson, handler } = require("../_lib/http");
const { authenticate } = require("../_lib/auth");
const store = require("../_lib/store");

module.exports = handler(async function (request, response) {
  const query = request.query.q;
  if (!query) return sendJson(response, 400, { error: "q required" });
  
  // Check cache
  const cacheKey = "arc:geocoding:" + query.toLowerCase();
  const cached = await store.getJson(cacheKey);
  if (cached) {
    return sendJson(response, 200, {
      ...cached,
      cached: true
    });
  }
  
  // Rate limit by client IP
  const clientIp = request.headers.get("x-forwarded-for") || "unknown";
  const rateLimitKey = "arc:rate:geocoding:" + clientIp;
  const count = await store.incr(rateLimitKey);
  await store.expire(rateLimitKey, 3600);  // 1 hour window
  
  if (count > 100) {
    return sendJson(response, 429, { error: "Rate limit exceeded. Try again in 1 hour." });
  }
  
  // Query Nominatim
  try {
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json`;
    const geoResponse = await fetch(nominatimUrl);
    const results = await geoResponse.json();
    
    // Cache for 24 hours
    await store.setJson(cacheKey, {
      query,
      results,
      timestamp: new Date().toISOString()
    }, 86400);
    
    return sendJson(response, 200, {
      query,
      results,
      cached: false
    });
  } catch (error) {
    return sendJson(response, 503, { error: "Geocoding service unavailable" });
  }
});
```

**Test:**
- Search for "Boston, MA"
- Second search for same → should return immediately (cached: true)
- Search 101 times in 1 hour → 101st should get 429

**Acceptance:** 
- Repeated searches are instant (cached)
- Rate limiting per IP, not global

---

## Summary & Order

**Phase 1 (Auth):** Days 1–3
- P1.1: Real authentication (BLOCKER)
- P1.2: Remove shared token

**Phase 2 (Durability):** Days 4–8
- P2.1: Server-persisted audit logs (dependency for compliance)
- P2.2: Optimistic locking on updates (prevents overwrites)
- P2.3: KV connectivity health check (helps debug P2.1)

**Phase 3 (Workflow):** Days 9–12
- P3.1: Sync approval status (cross-device workflow)
- P3.2: BroadcastChannel fallback (separate windows)
- P3.3: Storage quota management (prevents silent failures)

**Phase 4 (Compliance):** Day 13
- P4.1: Validate asset approvals (prevent unapproved export)

**Phase 5 (Performance):** Days 14–15 (optional, but recommended)
- P5.1: Batch KV operations
- P5.2: Geocoding caching

---

## Testing Checklist

After each fix, test:

- [ ] No unauthenticated access to /api/*
- [ ] Case owned by Alice is invisible to Bob
- [ ] Audit trail survives browser crash (on server)
- [ ] Concurrent edits show 409 Conflict, not silent overwrite
- [ ] Health check returns 503 if KV unreachable
- [ ] Approvals persist across devices
- [ ] Separate windows sync case context
- [ ] Storage meter shows quota, warns at 90%
- [ ] Final report cannot include unapproved assets

---

## Deployment Checklist

Before pushing to production:

- [ ] All Phase 1 & 2 fixes merged
- [ ] Audit trail verified in staging
- [ ] Health check confirms `durable: true` with KV
- [ ] Phase 3 at least 80% complete
- [ ] P4.1 (compliance) verified
- [ ] Documentation updated with new auth flow
- [ ] Attorneys briefed on approval workflow
- [ ] Backup/restore procedure documented
- [ ] Rate limiting configured in Vercel
- [ ] Cloudflare Access enabled for domain

---

Let's start with Phase 1. Ready to code P1.1?
