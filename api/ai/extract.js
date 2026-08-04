const { sendJson, readBody, handler } = require("../_lib/http");
const { generateContent, parseJsonFromModel, allowClientKeys } = require("../_lib/gemini");

module.exports = handler(async function (request, response) {
  if (request.method !== "POST") return false;
  const body = await readBody(request);
  const text = body.text;
  if (!text) return sendJson(response, 400, { error: "Missing text" });

  // Prefer server GEMINI_API_KEY. Client apiKey is only used when allowed.
  const prompt = [
    "Extract geographic locations, timestamps, and entities from the following text.",
    "Return ONLY a JSON array of objects with this schema and no markdown:",
    '[{"locText":"","date":"YYYY-MM-DD","time":"HH:MM:SS","activity":"","entityClass":"person|device|vehicle|account|evidence|camera|unknown","sourceQuote":"","reliability":"reported"}]',
    "",
    "Text:",
    text
  ].join("\n");

  const result = await generateContent({
    prompt: prompt,
    apiKey: body.apiKey,
    model: body.model
  });
  const parsed = parseJsonFromModel(result.text);
  if (!Array.isArray(parsed)) {
    return sendJson(response, 502, { error: "Gemini returned unexpected extraction payload" });
  }
  return sendJson(response, 200, parsed);
});

module.exports.meta = {
  clientKeysAllowed: allowClientKeys()
};
