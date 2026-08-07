/**
 * ARC provider client — production Cloudflare edition.
 *
 * Browser code never receives provider credentials. All provider traffic is
 * routed to the dedicated authenticated Workers:
 *   /ai/*            Gemini + Claude
 *   /legal-api/*     CourtListener + legal records
 *   /research-api/*  Firecrawl public-web research
 *
 * Legacy OpenAI/Google-CSE entry points are intentionally disabled. The
 * production ARC provider set is Gemini, Claude, CourtListener and Firecrawl.
 */
(function (globalScope) {
  "use strict";

  var capabilityCache = null;
  var capabilityPromise = null;

  function ARCProviderError(message, options) {
    var error = new Error(message);
    error.name = "ARCProviderError";
    error.provider = (options && options.provider) || "";
    error.status = (options && options.status) || 0;
    error.configured = options && options.configured === false ? false : true;
    return error;
  }

  function activeCaseId(value) {
    if (value && value.caseId) return String(value.caseId);
    try {
      if (globalScope.ARCLink && globalScope.ARCLink.activeCaseId) {
        var linked = globalScope.ARCLink.activeCaseId();
        if (linked) return String(linked);
      }
    } catch (_) {}
    try {
      if (globalScope.ARCBackend && globalScope.ARCBackend.activeCaseId) {
        var backend = globalScope.ARCBackend.activeCaseId();
        if (backend) return String(backend);
      }
    } catch (_) {}
    try {
      if (globalScope.ARCUnified && globalScope.ARCUnified.getCase) {
        var c = globalScope.ARCUnified.getCase() || {};
        return String(c.caseId || c.id || "");
      }
    } catch (_) {}
    return "";
  }

  function localPreviewGuard(provider) {
    if (globalScope.location && globalScope.location.protocol === "file:") {
      throw ARCProviderError(
        provider + " requires the deployed ARC Cloudflare Workers. Local file preview only tests the interface and navigation.",
        { provider: provider, status: 0 }
      );
    }
  }

  async function requestJson(path, options, provider) {
    localPreviewGuard(provider);
    var opts = options || {};
    var headers = Object.assign({}, opts.headers || {});
    if (opts.json !== undefined) headers["Content-Type"] = "application/json";
    var caseId = opts.caseId || activeCaseId(opts.json);
    if (caseId) headers["X-ARC-Case-ID"] = String(caseId);
    var response;
    try {
      response = await fetch(path, {
        method: opts.method || "GET",
        credentials: "include",
        headers: headers,
        body: opts.json !== undefined ? JSON.stringify(opts.json) : opts.body
      });
    } catch (_) {
      throw ARCProviderError("Could not reach the ARC server. Check your connection and try again.", { provider: provider });
    }
    var data = null;
    try { data = await response.json(); } catch (_) { data = null; }
    if (!response.ok) {
      throw ARCProviderError((data && data.error) || (provider + " request failed (" + response.status + ")."), {
        provider: provider,
        status: response.status,
        configured: data && data.configured === false ? false : true
      });
    }
    return data;
  }

  function textFromContents(contents) {
    var out = [];
    (Array.isArray(contents) ? contents : []).forEach(function (entry) {
      (entry && Array.isArray(entry.parts) ? entry.parts : []).forEach(function (part) {
        if (part && part.text) out.push(String(part.text));
      });
    });
    return out.join("\n\n");
  }

  function systemFromOptions(options) {
    var s = options && options.systemInstruction;
    if (typeof s === "string") return s;
    if (s && Array.isArray(s.parts)) return s.parts.map(function (p) { return p.text || ""; }).join("\n");
    return String((options && options.system) || "");
  }

  async function aiRun(task, payload, provider, caseId) {
    return requestJson("/ai/run", {
      method: "POST",
      caseId: caseId || activeCaseId(payload),
      json: { task: task, caseId: caseId || activeCaseId(payload), payload: payload || {} }
    }, provider || "ARC AI");
  }

  async function capabilities(forceRefresh) {
    if (capabilityCache && !forceRefresh) return capabilityCache;
    if (capabilityPromise && !forceRefresh) return capabilityPromise;
    capabilityPromise = (async function () {
      var fallback = {
        configured: false, openai: false, anthropic: false, gemini: false,
        courtlistener: false, firecrawl: false, googleCse: false,
        documentAiOcr: false, storage: { d1: false, r2: false, mode: "cloudflare" }, unavailable: true
      };
      if (globalScope.location && globalScope.location.protocol === "file:") return fallback;
      try {
        var results = await Promise.allSettled([
          fetch("/ai/status", { credentials: "include" }).then(function (r) { if (!r.ok) throw new Error(); return r.json(); }),
          fetch("/legal-api/provider-status", { credentials: "include" }).then(function (r) { if (!r.ok) throw new Error(); return r.json(); }),
          fetch("/research-api/status", { credentials: "include" }).then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
        ]);
        var ai = results[0].status === "fulfilled" ? results[0].value : {};
        var legal = results[1].status === "fulfilled" ? results[1].value : {};
        var research = results[2].status === "fulfilled" ? results[2].value : {};
        capabilityCache = {
          configured: Boolean(ai.geminiConfigured || ai.claudeConfigured || legal.courtlistenerConfigured || research.configured),
          openai: false,
          anthropic: Boolean(ai.claudeConfigured || legal.claudeConfigured),
          gemini: Boolean(ai.geminiConfigured),
          courtlistener: Boolean(legal.courtlistenerConfigured),
          firecrawl: Boolean(research.configured),
          googleCse: false,
          documentAiOcr: Boolean(ai.geminiConfigured),
          storage: { d1: Boolean(legal.d1), r2: Boolean(legal.r2), mode: "cloudflare" },
          unavailable: results.every(function (r) { return r.status !== "fulfilled"; })
        };
        return capabilityCache;
      } catch (_) {
        capabilityCache = fallback;
        return fallback;
      } finally {
        capabilityPromise = null;
      }
    })();
    return capabilityPromise;
  }

  function unavailableMessage(provider) {
    return provider + " is not configured on this ARC server. Ask your ARC administrator to configure the Worker secret. API keys are never entered in the browser.";
  }

  function openaiDisabled() {
    return Promise.reject(ARCProviderError(
      "OpenAI is not part of the ARC production provider architecture. Use Gemini for investigation analysis and Claude for final reports/motions.",
      { provider: "OpenAI", status: 410, configured: false }
    ));
  }

  function openaiResponses() { return openaiDisabled(); }
  function openaiUpload() { return openaiDisabled(); }

  /** Legacy Gemini-shaped wrapper. The requested model is deliberately ignored;
      the Worker chooses the production model from its allowlisted ladder. */
  async function gemini(options) {
    var o = options || {};
    var prompt = textFromContents(o.contents) || String(o.prompt || "");
    var gen = o.generationConfig || {};
    var payload = {
      system: systemFromOptions(o),
      prompt: prompt,
      schema: gen.responseSchema || o.schema || undefined,
      jsonMode: gen.responseMimeType === "application/json" || Boolean(gen.responseSchema || o.schema)
    };
    var result = await aiRun("notebook.query", payload, "Google Gemini", activeCaseId(o));
    return {
      model: result.model,
      provider: result.provider,
      candidates: [{ content: { parts: [{ text: String(result.text || "") }] }, finishReason: "STOP" }]
    };
  }

  async function geminiText(prompt, options) {
    var result = await aiRun("notebook.query", {
      system: systemFromOptions(options || {}),
      prompt: String(prompt || "")
    }, "Google Gemini", activeCaseId(options || {}));
    return String(result.text || "");
  }

  async function anthropicMessages(options) {
    var o = options || {};
    var prompt = String(o.prompt || "");
    if (!prompt && Array.isArray(o.messages)) {
      prompt = o.messages.map(function (m) {
        return typeof m.content === "string" ? m.content : "";
      }).filter(Boolean).join("\n\n");
    }
    var result = await aiRun(o.task || "report.final.revise", {
      system: String(o.system || ""), prompt: prompt, maxTokens: o.maxTokens || o.max_tokens
    }, "Anthropic Claude", activeCaseId(o));
    return { text: result.text, model: result.model, provider: result.provider };
  }

  async function finalReportPolish(options) {
    var o = options || {};
    var text = String(o.reportText || "");
    var result = await aiRun("report.final.revise", {
      system: "You are revising an investigator-approved ARC report. Preserve all facts, attributions, source tags, uncertainty, and legal distinctions. Do not add facts, citations, legal conclusions, or advocacy. Improve clarity and professional readability only.",
      prompt: "Revise the following report without adding or removing substantive information. Return only the revised report text.\n\n" + text,
      maxTokens: o.maxTokens || 8000
    }, "Claude final report polish", activeCaseId(o));
    return { text: result.text, model: result.model, provider: result.provider };
  }

  async function caseChain(options) {
    var o = options || {};
    var prompt = [
      "Extract structured intake information from this single supplied case document.",
      "Use only the supplied text. Do not invent missing values. Preserve conflicts and identify them instead of reconciling them.",
      "Return JSON only with this shape:",
      '{"caseInformation":{"docketNumber":"","court":"","subjectName":"","clientName":"","incidentDate":""},"people":[{"value":"","sourceFile":"","page":"","confidence":0,"status":"needs_review"}],"charges":[],"evidence":[],"timeline":[],"contradictions":[],"missingInformation":[]}',
      "Each array item must use value/sourceFile/page/confidence/status. status must remain needs_review unless directly stated in the source.",
      "File: " + String(o.fileName || "uploaded document"),
      "Category: " + String(o.category || ""),
      "SOURCE TEXT:\n" + String(o.text || "").slice(0, 120000)
    ].join("\n\n");
    var result = await aiRun("intake.extract", { prompt: prompt, jsonMode: true }, "Gemini case intake", activeCaseId(o));
    var parsed = {};
    try { parsed = JSON.parse(String(result.text || "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")); }
    catch (_) { throw ARCProviderError("Gemini returned unreadable intake JSON. Nothing was autofilled.", { provider: "Gemini", status: 502 }); }
    return { data: parsed, model: result.model, provider: result.provider, interactionId: "", executionTrace: [] };
  }

  async function groundedResearch(options) {
    var o = options || {};
    var caseId = activeCaseId(o);
    var query = String(o.question || o.query || "").trim();
    if (!query) throw ARCProviderError("A research question is required.", { provider: "Firecrawl", status: 400 });
    var data = await requestJson("/research-api/search", {
      method: "POST", caseId: caseId, json: { query: query, limit: 6 }
    }, "Firecrawl public web research");
    var raw = data && data.result ? data.result : {};
    var rows = Array.isArray(raw.data) ? raw.data : (Array.isArray(raw.results) ? raw.results : []);
    var citations = rows.map(function (r) {
      var md = String(r.markdown || r.description || r.content || "");
      return { title: r.title || r.url || "Public source", url: r.url || "", citedText: md.slice(0, 500) };
    }).filter(function (r) { return /^https:\/\//i.test(r.url); });
    var text = citations.length
      ? citations.map(function (c, i) { return (i + 1) + ". " + c.title + "\n" + c.citedText + "\n" + c.url; }).join("\n\n")
      : "Firecrawl completed the search, but no public results were returned in a displayable form.";
    return { text: text, citations: citations, searches: [query], interactionId: "", provider: "firecrawl", status: "needs_review" };
  }

  async function mapsGrounding(options) {
    var o = options || {};
    var prompt = [
      "Provide an investigative geographic analysis using ONLY the user-supplied location question and coordinates below.",
      "Do not claim that you queried Google Maps, do not invent business/place listings, and do not create source URLs.",
      "State clearly when external geographic verification is required. This is analytical work product, not evidence.",
      "Question: " + String(o.query || ""),
      o.latitude != null && o.longitude != null ? ("Coordinates: " + o.latitude + ", " + o.longitude) : "Coordinates not supplied.",
      o.caseContext ? ("Case context: " + String(o.caseContext)) : ""
    ].filter(Boolean).join("\n");
    var result = await aiRun("map.ground", { prompt: prompt }, "Gemini geographic analysis", activeCaseId(o));
    return { text: result.text, places: [], model: result.model, provider: result.provider, status: "needs_review" };
  }

  async function reportReview(options) {
    var o = options || {};
    var prompt = [
      "Review this ARC investigation report for internal quality control only.",
      "Do not add facts or legal authority. Identify unsupported assertions, missing attribution, internal inconsistencies, placeholders, missing sections, and statements that require source verification.",
      'Return JSON only: {"text":"short review summary","sectionResults":[{"name":"","present":true}],"findings":[{"severity":"HIGH|MEDIUM|LOW","category":"","statement":"","recommendation":""}],"citations":[]}.',
      "External citations must remain an empty array; this task does not research the web.",
      "REPORT:\n" + String(o.reportText || "").slice(0, 120000)
    ].join("\n\n");
    var result = await aiRun("report.review", { prompt: prompt, jsonMode: true }, "Gemini report review", activeCaseId(o));
    var parsed;
    try { parsed = JSON.parse(String(result.text || "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")); }
    catch (_) { parsed = { text: result.text || "Review completed.", sectionResults: [], findings: [], citations: [] }; }
    parsed.model = result.model; parsed.retention = "provider API request; no browser key retained";
    return parsed;
  }

  async function pdfReview(options) {
    var o = options || {};
    var caseId = activeCaseId(o);
    var ocr = await requestJson("/api/ocr/document-ai", {
      method: "POST", caseId: caseId,
      json: { fileName: o.fileName || "document.pdf", mimeType: o.mimeType || "application/pdf", base64: o.base64 || "" }
    }, "Gemini document OCR");
    var text = ocr && ocr.ocr ? String(ocr.ocr.text || "") : "";
    var prompt = [
      "Review the OCR text of this PDF for internal investigative quality control.",
      "Use only the OCR text. Do not invent unreadable content or legal authority.",
      'Return JSON only with keys summary, facts, tables, visualEvidence, inconsistencies, missingPages, unreadableAreas, reportRisks. Each key except summary must be an array.',
      "OCR TEXT:\n" + text.slice(0, 120000)
    ].join("\n\n");
    var result = await aiRun("pdf.review", { prompt: prompt, jsonMode: true }, "Gemini PDF review", caseId);
    var review;
    try { review = JSON.parse(String(result.text || "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")); }
    catch (_) { review = { summary: result.text || "Review completed.", facts: [], tables: [], visualEvidence: [], inconsistencies: [], missingPages: [], unreadableAreas: [], reportRisks: [] }; }
    return { review: review, ocr: { used: true, mode: "Gemini OCR", pageCount: ocr.ocr && ocr.ocr.pageCount, textLength: text.length }, citations: [], model: result.model };
  }

  function ocrDocument(options) {
    var o = options || {};
    return requestJson("/api/ocr/document-ai", { method: "POST", caseId: activeCaseId(o), json: o }, "Gemini document OCR");
  }

  function extractCitationStrings(text) {
    var source = String(text || "");
    var patterns = [
      /\b\d+\s+Mass\.\s+(?:App\.\s+Ct\.\s+)?\d+\b/g,
      /\b\d+\s+N\.E\.\d*d?\s+\d+\b/g,
      /\b\d+\s+U\.S\.\s+\d+\b/g,
      /\b\d+\s+F\.(?:2d|3d|4th)\s+\d+\b/g
    ];
    var out = [];
    patterns.forEach(function (re) { (source.match(re) || []).forEach(function (c) { if (out.indexOf(c) < 0) out.push(c); }); });
    return out.slice(0, 12);
  }

  async function courtlistener(options) {
    var o = options || {};
    var caseId = activeCaseId(o);
    var endpoint = String(o.endpoint || "search");
    if (endpoint === "search") {
      var p = o.params || {};
      var data = await requestJson("/legal-api/search", {
        method: "POST", caseId: caseId,
        json: {
          caseId: caseId,
          q: p.q || p.query || "",
          caseName: p.caseName || "",
          citation: p.citation || "",
          docketNumber: p.docketNumber || p.docket_number || "",
          court: p.court || "",
          dateAfter: p.dateAfter || "",
          dateBefore: p.dateBefore || "",
          jurisdiction: p.jurisdiction || "massachusetts-first"
        }
      }, "CourtListener");
      return data;
    }
    if (endpoint === "citation-lookup") {
      var cites = extractCitationStrings(o.text || "");
      var rows = [];
      for (var i = 0; i < cites.length; i++) {
        try {
          var found = await requestJson("/legal-api/search", {
            method: "POST", caseId: caseId,
            json: { caseId: caseId, citation: cites[i], jurisdiction: "massachusetts-first" }
          }, "CourtListener");
          rows.push({ citation: cites[i], located: Boolean(found && found.results && found.results.length), results: (found.results || []).slice(0, 3) });
        } catch (e) {
          rows.push({ citation: cites[i], located: false, error: e.message });
        }
      }
      return { citations: rows };
    }
    throw ARCProviderError("Unsupported CourtListener legacy endpoint: " + endpoint, { provider: "CourtListener", status: 400 });
  }

  async function firecrawl(options) {
    var o = options || {};
    var caseId = activeCaseId(o);
    if (o.url) return requestJson("/research-api/scrape", { method: "POST", caseId: caseId, json: { url: o.url, onlyMainContent: o.onlyMainContent !== false } }, "Firecrawl");
    return requestJson("/research-api/search", { method: "POST", caseId: caseId, json: { query: o.query || o.q || "", limit: o.limit || 5 } }, "Firecrawl");
  }

  function googleSearch() {
    return Promise.reject(ARCProviderError(
      "Google Programmable Search is not used in the ARC production build. Use Public Web Research (Firecrawl).",
      { provider: "Google Programmable Search", status: 410, configured: false }
    ));
  }

  async function renderStatusInto(container) {
    if (!container) return;
    var status = await capabilities(true);
    var rows = [
      ["Anthropic Claude", status.anthropic],
      ["Google Gemini", status.gemini],
      ["CourtListener", status.courtlistener],
      ["Firecrawl", status.firecrawl],
      ["D1 database", status.storage && status.storage.d1],
      ["R2 evidence storage", status.storage && status.storage.r2]
    ];
    container.textContent = "";
    var list = document.createElement("ul");
    list.style.cssText = "list-style:none;margin:0;padding:0;display:grid;gap:8px";
    rows.forEach(function (row) {
      var item = document.createElement("li");
      item.style.cssText = "display:flex;align-items:center;gap:10px;padding:9px 12px;border:1px solid #d8dee6;border-radius:6px;background:#fff";
      var dot = document.createElement("span");
      dot.style.cssText = "width:9px;height:9px;border-radius:50%;flex:0 0 9px;background:" + (row[1] ? "#19734c" : "#9aa5b4");
      var name = document.createElement("span"); name.style.cssText = "font-weight:700;font-size:13px;flex:1"; name.textContent = row[0];
      var state = document.createElement("span"); state.style.cssText = "font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:" + (row[1] ? "#19734c" : "#667386"); state.textContent = row[1] ? "Configured" : "Not configured";
      item.appendChild(dot); item.appendChild(name); item.appendChild(state); list.appendChild(item);
    });
    container.appendChild(list);
    var note = document.createElement("p");
    note.style.cssText = "margin:12px 0 0;font-size:12px;line-height:1.5;color:#667386";
    note.textContent = "Provider credentials are Cloudflare Worker secrets and are never stored in this browser.";
    container.appendChild(note);
  }

  var warned = false;
  function warnOnce() {
    if (warned) return; warned = true;
    console.warn("[ARC] Browser provider keys are disabled. Production provider credentials live in Cloudflare Worker secrets.");
  }
  var legacyShim = {
    read: function () { warnOnce(); return { openai: "", gemini: "", courtlistener: "", firecrawl: "", googleCseId: "" }; },
    write: function () { warnOnce(); return false; },
    clear: function () { return true; },
    status: function () { return capabilityCache || { configured: false, unavailable: true }; },
    capabilities: capabilities,
    mergeIntoModule: function () { warnOnce(); return {}; }
  };

  function scrubLegacySecrets() {
    var directKeys = ["ARC_OPENAI_KEY_V1","ARC_GEMINI_KEY_V1","ARC_FIRECRAWL_KEY_V1","ARC_COURTLISTENER_TOKEN","ARC_COURTLISTENER_TOKEN_V1","arc_defense_system_keys_v1","arc_standalone_provider_keys_v1"];
    var jsonStores = ["arcMotionBank_apiSettings_v1"];
    var secretFields = ["openai","gemini","googleApiKey","courtlistener","courtListenerToken","firecrawl","firecrawlKey"];
    try {
      directKeys.forEach(function (key) { localStorage.removeItem(key); sessionStorage.removeItem(key); });
      jsonStores.forEach(function (store) {
        [localStorage, sessionStorage].forEach(function (area) {
          var raw = area.getItem(store); if (!raw) return;
          try {
            var parsed = JSON.parse(raw), changed = false;
            secretFields.forEach(function (field) { if (parsed && Object.prototype.hasOwnProperty.call(parsed, field)) { delete parsed[field]; changed = true; } });
            if (changed) area.setItem(store, JSON.stringify(parsed));
          } catch (_) { area.removeItem(store); }
        });
      });
      sessionStorage.removeItem("arcMotionBank_apiSettings_session_v1");
    } catch (_) {}
  }
  scrubLegacySecrets();

  globalScope.ARCProviders = {
    capabilities: capabilities,
    unavailableMessage: unavailableMessage,
    renderStatusInto: renderStatusInto,
    openaiResponses: openaiResponses,
    openaiUpload: openaiUpload,
    anthropicMessages: anthropicMessages,
    finalReportPolish: finalReportPolish,
    gemini: gemini,
    geminiText: geminiText,
    caseChain: caseChain,
    groundedResearch: groundedResearch,
    mapsGrounding: mapsGrounding,
    reportReview: reportReview,
    pdfReview: pdfReview,
    ocrDocument: ocrDocument,
    courtlistener: courtlistener,
    firecrawl: firecrawl,
    googleSearch: googleSearch,
    ProviderError: ARCProviderError
  };
  globalScope.ARC_SYSTEM_KEYS = legacyShim;
})(typeof window !== "undefined" ? window : globalThis);
