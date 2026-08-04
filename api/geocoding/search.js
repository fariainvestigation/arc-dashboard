const { sendJson, query, handler, httpError } = require("../_lib/http");
const store = require("../_lib/store");

module.exports = handler(async function (request, response) {
  if (request.method !== "GET") return false;
  const q = query(request, "q").slice(0, 500);
  if (!q) return sendJson(response, 400, { error: "Missing query" });

  const cacheKey = "arc:geocoding:" + q.toLowerCase();
  const cached = await store.getJson(cacheKey);
  if (cached && Array.isArray(cached.results)) {
    return sendJson(response, 200, {
      results: cached.results,
      cached: true
    });
  }

  const clientIp = String(
    (request.headers["x-forwarded-for"] || "").toString().split(",")[0] ||
    request.socket && request.socket.remoteAddress ||
    "unknown"
  ).trim();
  const rateKey = "arc:rate:geocoding:" + clientIp;
  try {
    const count = await store.incr(rateKey);
    if (count === 1) await store.expire(rateKey, 3600);
    if (count > 100) {
      return sendJson(response, 429, { error: "Geocoding rate limit exceeded. Try again in an hour." });
    }
  } catch (error) {
    // Rate limiting is best-effort when storage is unavailable.
  }

  const nominatim =
    "https://nominatim.openstreetmap.org/search?format=json&limit=5&q=" + encodeURIComponent(q);
  const remote = await fetch(nominatim, {
    headers: { "User-Agent": "ARC-Integrated-System/11.4 (arcdefensereport.com)" },
    signal: AbortSignal.timeout(15000)
  });
  if (!remote.ok) throw httpError(502, "Geocoding service failed");
  const data = await remote.json();
  const results = data.map(function (item) {
    return { lat: Number(item.lat), lng: Number(item.lon), label: item.display_name };
  });

  try {
    await store.setJsonWithTtl(cacheKey, {
      query: q,
      results: results,
      timestamp: new Date().toISOString()
    }, 86400);
  } catch (error) {}

  return sendJson(response, 200, { results: results, cached: false });
});
