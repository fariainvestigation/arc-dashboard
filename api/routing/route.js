const crypto = require("crypto");
const { sendJson, readBody, handler, httpError } = require("../_lib/http");
const store = require("../_lib/store");

module.exports = handler(async function (request, response) {
  if (request.method !== "POST") return false;
  const body = await readBody(request);
  const start = body.start;
  const end = body.end;
  const profile = body.profile || "driving";
  if (!start || !end) return sendJson(response, 400, { error: "Missing start or end point" });
  const costing = { driving: "auto", walking: "pedestrian", cycling: "bicycle" }[profile];
  if (!costing) return sendJson(response, 400, { error: "Unsupported routing profile" });
  const points = [start, end].map(function (point) {
    return { lat: Number(point.lat), lon: Number(point.lng) };
  });
  const validPoints = points.every(function (point) {
    return Number.isFinite(point.lat) && Number.isFinite(point.lon) &&
      point.lat >= -90 && point.lat <= 90 && point.lon >= -180 && point.lon <= 180;
  });
  if (!validPoints) return sendJson(response, 400, { error: "Invalid route coordinates" });

  const cacheSeed = JSON.stringify({ profile: profile, points: points });
  const cacheKey = "arc:routing:" + crypto.createHash("sha256").update(cacheSeed).digest("hex").slice(0, 32);
  const cached = await store.getJson(cacheKey);
  if (cached && cached.geometry) {
    return sendJson(response, 200, Object.assign({}, cached, { cached: true }));
  }

  const remote = await fetch("https://valhalla1.openstreetmap.de/route", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      locations: points,
      costing: costing,
      format: "osrm",
      shape_format: "geojson",
      directions_type: "none"
    }),
    signal: AbortSignal.timeout(30000)
  });
  if (!remote.ok) throw httpError(502, "Routing service failed");
  const data = await remote.json();
  if (data.code !== "Ok" || !data.routes || !data.routes.length) throw httpError(502, "No route found");
  const route = data.routes[0];
  const payload = {
    profile: profile,
    provider: "Valhalla",
    distanceMeters: route.distance,
    durationSeconds: route.duration,
    geometry: route.geometry,
    cached: false
  };
  try {
    await store.setJsonWithTtl(cacheKey, payload, 86400);
  } catch (error) {}
  return sendJson(response, 200, payload);
});
