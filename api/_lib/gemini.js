/**
 * Server-side Gemini helper.
 * Prefer GEMINI_API_KEY from the environment so browser-local vaults are not required
 * for hosted AI routes. Client-supplied keys are allowed only when explicitly enabled
 * (local development) via ARC_ALLOW_CLIENT_API_KEYS=1.
 */

const { httpError } = require("./http");

function allowClientKeys() {
  if (String(process.env.ARC_ALLOW_CLIENT_API_KEYS || "").trim() === "1") return true;
  return !process.env.VERCEL;
}

function resolveGeminiKey(clientKey) {
  const serverKey = String(process.env.GEMINI_API_KEY || "").trim();
  if (serverKey) return { key: serverKey, source: "server" };
  const fromClient = String(clientKey || "").trim();
  if (fromClient && allowClientKeys()) return { key: fromClient, source: "client" };
  if (fromClient && process.env.VERCEL) {
    throw httpError(
      503,
      "Server GEMINI_API_KEY is required on Vercel. Client-supplied keys are disabled for hosted AI routes."
    );
  }
  throw httpError(400, "Missing Gemini API key. Set GEMINI_API_KEY on the server.");
}

// gemini-2.0-flash shut down June 1, 2026 and gemini-2.5-flash began
// returning 404 on July 9, 2026. Default to the current stable flash model
// and keep a fallback ladder for 404 responses.
const FALLBACK_MODELS = ["gemini-3.5-flash", "gemini-2.5-flash", "gemini-flash-latest"];

function defaultModel() {
  return process.env.GEMINI_MODEL || "gemini-3.5-flash";
}

async function generateContent(options) {
  const resolved = resolveGeminiKey(options.apiKey);
  const prompt = String(options.prompt || "");
  if (!prompt) throw httpError(400, "Missing prompt");

  const requested = String(options.model || "").trim();
  const primary = requested || defaultModel();
  const ladder = requested
    ? [requested]
    : [primary].concat(FALLBACK_MODELS.filter(function (name) { return name !== primary; }));

  let remote = null;
  let model = primary;
  for (let index = 0; index < ladder.length; index += 1) {
    model = ladder[index];
    remote = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" +
        encodeURIComponent(model) +
        ":generateContent?key=" +
        encodeURIComponent(resolved.key),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: options.generationConfig || undefined
        }),
        signal: AbortSignal.timeout(options.timeoutMs || 60000)
      }
    );
    if (remote.ok) break;
    if (remote.status === 404 && index + 1 < ladder.length) continue;
    throw httpError(502, "Gemini request failed (" + remote.status + ") for model " + model);
  }

  if (!remote || !remote.ok) {
    throw httpError(502, "Gemini request failed (" + (remote ? remote.status : "no response") + ") for model " + model);
  }

  const data = await remote.json();
  const parts = (((data.candidates || [])[0] || {}).content || {}).parts;
  const text = parts ? parts.map(function (part) { return part.text || ""; }).join("") : "";
  return {
    text: text,
    source: resolved.source,
    model: model,
    raw: data
  };
}

function parseJsonFromModel(text) {
  const cleaned = String(text || "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch (error) {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw httpError(502, "Gemini returned non-JSON content");
  }
}

module.exports = {
  allowClientKeys,
  resolveGeminiKey,
  defaultModel,
  generateContent,
  parseJsonFromModel
};
