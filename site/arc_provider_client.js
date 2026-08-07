(function (global) {
  "use strict";

  async function mapsGrounding(request) {
    const query = String(request && request.query || "").trim();
    if (!query) throw new Error("Maps grounding query required");
    const latitude = request && request.latitude != null ? Number(request.latitude) : null;
    const longitude = request && request.longitude != null ? Number(request.longitude) : null;
    const hasPoint = Number.isFinite(latitude) && Number.isFinite(longitude);
    return {
      interactionId: "local_maps_" + Date.now().toString(36),
      answer: hasPoint
        ? "Maps grounding service is not configured in this local ARC build. The entered coordinates were preserved for investigator review."
        : "Maps grounding service is not configured in this local ARC build. The query was preserved for investigator review.",
      confidence: "needs_review",
      places: hasPoint ? [{
        name: query,
        address: latitude.toFixed(6) + ", " + longitude.toFixed(6),
        uri: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(latitude + "," + longitude)
      }] : [],
      citations: [],
      provider: "local-fallback"
    };
  }

  global.ARCProviders = Object.assign({}, global.ARCProviders || {}, {
    mapsGrounding: mapsGrounding
  });
})(window);
