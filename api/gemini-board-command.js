/**
 * Secure Intelligence Board command endpoint.
 * Uses server-side GEMINI_API_KEY. The browser never needs to embed a Gemini key
 * for board arrangement commands.
 *
 * Expected request:
 *   { command, board: { nodes: [...] }, allowedActions: [...] }
 * Response:
 *   { message, actions: [{ type:'move', nodeId, left, top } | { type:'open_view', view }] }
 */

const { sendJson, readBody, handler } = require("./_lib/http");
const { generateContent, parseJsonFromModel } = require("./_lib/gemini");

const ALLOWED_VIEWS = new Set([
  "boardView",
  "geoView",
  "timelineView",
  "linkageView",
  "sourceView",
  "briefView"
]);

function sanitizeActions(actions, nodeIds) {
  if (!Array.isArray(actions)) return [];
  const idSet = new Set(nodeIds || []);
  const out = [];
  for (const action of actions) {
    if (!action || typeof action !== "object") continue;
    if (action.type === "move") {
      const nodeId = String(action.nodeId || "").trim();
      if (!idSet.has(nodeId)) continue;
      const left = String(action.left || "").trim();
      const top = String(action.top || "").trim();
      if (!/^\d+(\.\d+)?%$/.test(left) || !/^\d+(\.\d+)?%$/.test(top)) continue;
      out.push({ type: "move", nodeId: nodeId, left: left, top: top });
    } else if (action.type === "open_view") {
      const view = String(action.view || "").trim();
      if (!ALLOWED_VIEWS.has(view)) continue;
      out.push({ type: "open_view", view: view });
    } else if (action.type === "filter_nodes") {
      const ids = Array.isArray(action.nodeIds)
        ? action.nodeIds.map(function (id) { return String(id); }).filter(function (id) { return idSet.has(id); })
        : [];
      out.push({ type: "filter_nodes", nodeIds: ids });
    }
  }
  return out.slice(0, 24);
}

function localFallback(command, nodes) {
  const c = String(command || "").toLowerCase();
  const ids = (nodes || []).map(function (n) { return n.id; });
  if (c.includes("geographic") || c.includes("geography") || c.includes("map")) {
    return { message: "Opened the Geographic Profiling Protocol.", actions: [{ type: "open_view", view: "geoView" }] };
  }
  if (c.includes("show") && c.includes("conflict")) {
    return {
      message: "Isolated the disputed account, material conflict, and related person.",
      actions: [{ type: "filter_nodes", nodeIds: ids.filter(function (id) { return id === "n4" || id === "n5" || id === "n1"; }) }]
    };
  }
  if (c.includes("center") && (c.includes("defendant") || c.includes("person"))) {
    return {
      message: "Centered the person and arranged the connected evidence around that node.",
      actions: [
        { type: "move", nodeId: "n1", left: "42%", top: "34%" },
        { type: "move", nodeId: "n2", left: "8%", top: "14%" },
        { type: "move", nodeId: "n3", left: "70%", top: "14%" },
        { type: "move", nodeId: "n4", left: "8%", top: "62%" },
        { type: "move", nodeId: "n5", left: "70%", top: "62%" }
      ].filter(function (a) { return ids.includes(a.nodeId); })
    };
  }
  if (c.includes("type") || c.includes("group") || c.includes("arrange")) {
    return {
      message: "Grouped person, digital, vehicle, statement, and conflict items by evidence type.",
      actions: [
        { type: "move", nodeId: "n1", left: "8%", top: "10%" },
        { type: "move", nodeId: "n2", left: "38%", top: "10%" },
        { type: "move", nodeId: "n3", left: "68%", top: "10%" },
        { type: "move", nodeId: "n4", left: "23%", top: "58%" },
        { type: "move", nodeId: "n5", left: "58%", top: "58%" }
      ].filter(function (a) { return ids.includes(a.nodeId); })
    };
  }
  if (c.includes("reset")) {
    return {
      message: "Restored the original board layout.",
      actions: [
        { type: "move", nodeId: "n1", left: "38%", top: "8%" },
        { type: "move", nodeId: "n2", left: "8%", top: "32%" },
        { type: "move", nodeId: "n3", left: "65%", top: "31%" },
        { type: "move", nodeId: "n4", left: "38%", top: "52%" },
        { type: "move", nodeId: "n5", left: "65%", top: "68%" }
      ].filter(function (a) { return ids.includes(a.nodeId); })
    };
  }
  if (c.includes("timeline")) {
    return { message: "Opened Timeline Conflicts.", actions: [{ type: "open_view", view: "timelineView" }] };
  }
  if (c.includes("linkage")) {
    return { message: "Opened the Case Linkage Matrix.", actions: [{ type: "open_view", view: "linkageView" }] };
  }
  if (c.includes("source")) {
    return { message: "Opened the Source Ledger.", actions: [{ type: "open_view", view: "sourceView" }] };
  }
  if (c.includes("brief") || c.includes("summary")) {
    return { message: "Opened the Defense Intelligence Brief.", actions: [{ type: "open_view", view: "briefView" }] };
  }
  return {
    message: "Command not recognized. Try: arrange by type, show conflicts, center defendant, reset layout, or open geography/timeline/linkage/sources/brief.",
    actions: []
  };
}

module.exports = handler(async function (request, response) {
  if (request.method !== "POST") return false;
  const body = await readBody(request);
  const command = String(body.command || "").trim();
  if (!command) return sendJson(response, 400, { error: "Missing command" });

  const nodes = Array.isArray((body.board || {}).nodes) ? body.board.nodes : [];
  const nodeIds = nodes.map(function (n) { return String((n && n.id) || ""); }).filter(Boolean);
  const boardSummary = nodes.map(function (n) {
    return {
      id: n.id,
      title: n.title,
      type: n.type,
      left: n.left,
      top: n.top
    };
  });

  let payload;
  const hasServerKey = Boolean(String(process.env.GEMINI_API_KEY || "").trim());
  if (!hasServerKey) {
    payload = localFallback(command, nodes);
    payload.fallback = true;
    payload.reason = "GEMINI_API_KEY not configured; used local parser";
  } else {
    try {
      const prompt = [
        "You are the ARC Criminal Intelligence Board command interpreter.",
        "Return ONLY JSON with this schema:",
        '{"message":"short investigator-facing reply","actions":[{"type":"move","nodeId":"n1","left":"40%","top":"20%"},{"type":"open_view","view":"geoView"},{"type":"filter_nodes","nodeIds":["n1","n4"]}]}',
        "Allowed views: boardView, geoView, timelineView, linkageView, sourceView, briefView.",
        "Only move nodeIds that exist on the board. Prefer percentage positions.",
        "Do not invent evidence facts. Only rearrange, filter, open views, or summarize layout intent.",
        "",
        "Board nodes:",
        JSON.stringify(boardSummary),
        "",
        "Investigator command:",
        command
      ].join("\n");

      const result = await generateContent({
        prompt: prompt,
        generationConfig: { temperature: 0.2 }
      });
      payload = parseJsonFromModel(result.text);
    } catch (error) {
      payload = localFallback(command, nodes);
      payload.fallback = true;
      payload.reason = error && error.message ? error.message : "Gemini unavailable";
    }
  }

  const message = String((payload && payload.message) || "Command completed.").slice(0, 800);
  const actions = sanitizeActions(payload && payload.actions, nodeIds);
  return sendJson(response, 200, {
    message: message,
    actions: actions,
    fallback: Boolean(payload && payload.fallback),
    reason: payload && payload.reason ? String(payload.reason).slice(0, 240) : undefined
  });
});
