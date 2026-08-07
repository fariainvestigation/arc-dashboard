/*!
 * arc_ai_client.js - the only way an ARC module talks to a model.
 *
 * Every module loads this. No module holds a key. A module names a TASK and the
 * gateway decides the provider from that task:
 *
 *     Claude   motions and the final report
 *     Gemini   everything else
 *
 *     await ARCAI.run("evidence.extract", { prompt, schema });   // Gemini
 *     await ARCAI.run("report.final.draft", { system, prompt }); // Claude
 *
 * This file mirrors the server policy so a wrong task fails immediately with a
 * clear message instead of a 400 from the network. The server remains the
 * authority; this copy is a courtesy, not a control.
 *
 * Replaces the localStorage key path in arc_gemini_client.js. Nothing here
 * reads or writes ARC_GEMINI_KEY_V1.
 */
(function (global) {
  "use strict";

  var GATEWAY = "/ai/run";

  var CLAUDE_TASKS = [
    "motion.draft", "motion.revise", "report.final.draft", "report.final.revise"
  ];
  var GEMINI_TASKS = [
    "evidence.extract", "discovery.review", "custody.analyze", "video.audit",
    "audio.transcribe", "timeline.normalize", "parties.extract", "board.command",
    "notebook.query", "notebook.summarize", "investigation.leads", "oui.analyze",
    "breath.analyze", "lab.analyze", "map.ground", "intake.extract",
    "report.review", "pdf.review"
  ];


  function activeCaseId(payload, options) {
    var opts = options || {};
    var fromPayload = payload && payload.caseId;
    if (opts.caseId) return String(opts.caseId);
    if (fromPayload) return String(fromPayload);
    try { if (global.ARCLink && global.ARCLink.activeCaseId) return String(global.ARCLink.activeCaseId() || ''); } catch (e) {}
    try { if (global.ARCBackend && global.ARCBackend.activeCaseId) return String(global.ARCBackend.activeCaseId() || ''); } catch (e) {}
    try {
      if (global.ARCUnified && global.ARCUnified.getCase) {
        var c = global.ARCUnified.getCase() || {};
        return String(c.caseId || c.id || '');
      }
    } catch (e) {}
    return '';
  }

  function providerFor(task) {
    if (CLAUDE_TASKS.indexOf(task) !== -1) return "claude";
    if (GEMINI_TASKS.indexOf(task) !== -1) return "gemini";
    return "";
  }

  function describeError(status, payload) {
    var msg = payload && payload.error ? payload.error : "";
    if (status === 401) return "Your Cloudflare Access session expired. Reload the page to sign in again.";
    if (status === 403) return msg || "Your role may not run this task.";
    if (status === 413) return "That request is too large. Split the input and rerun.";
    if (status === 429) return "The provider is rate limiting ARC. Wait a moment and rerun.";
    if (status === 502) return msg || "The provider did not respond. Nothing was returned.";
    return msg || ("AI gateway error " + status);
  }

  /**
   * run(task, payload, options)
   *   payload.system       instruction text
   *   payload.prompt       the request
   *   payload.parts        Gemini multipart content, when sending files
   *   payload.schema       Gemini structured output schema; resolves to an object
   *   payload.maxTokens    Claude only
   *   options.signal       AbortSignal
   *   options.caseId       recorded in provider_log
   */
  function run(task, payload, options) {
    var opts = options || {};
    var provider = providerFor(task);
    if (!provider) {
      return Promise.reject(new Error(
        'Unknown AI task "' + task + '". Add it to the gateway routing policy first.'
      ));
    }
    if (global.location && global.location.protocol === "file:") {
      return Promise.reject(new Error(
        "AI analysis is disabled in local file preview. The ARC pages and local case workflow can be tested here, but Gemini/Claude require the deployed Cloudflare Worker."
      ));
    }

    return fetch(GATEWAY, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",           // Cloudflare Access cookie rides along
      signal: opts.signal,
      body: JSON.stringify({
        task: task,
        caseId: activeCaseId(payload, opts),
        payload: payload || {}
      })
    }).then(function (response) {
      return response.json().catch(function () { return null; }).then(function (data) {
        if (!response.ok) throw new Error(describeError(response.status, data));
        return data;
      });
    }).then(function (data) {
      if (payload && payload.schema) {
        try {
          return JSON.parse(data.text);
        } catch (e) {
          throw new Error("The model returned malformed JSON. Nothing was staged.");
        }
      }
      return data.text;
    }).catch(function (error) {
      if (error && error.name === "AbortError") throw new Error("Request cancelled.");
      if (error instanceof TypeError) throw new Error("Could not reach the ARC AI gateway. Check the network connection.");
      throw error;
    });
  }

  /** Full result including which provider and model actually ran. */
  function runDetailed(task, payload, options) {
    var opts = options || {};
    var provider = providerFor(task);
    if (!provider) return Promise.reject(new Error('Unknown AI task "' + task + '".'));
    if (global.location && global.location.protocol === "file:") {
      return Promise.reject(new Error("AI provider checks require the deployed Cloudflare Worker; local file preview does not call provider APIs."));
    }
    return fetch(GATEWAY, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      signal: opts.signal,
      body: JSON.stringify({ task: task, caseId: activeCaseId(payload, opts), payload: payload || {} })
    }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (d) {
        if (!r.ok) throw new Error(describeError(r.status, d));
        return d;
      });
    });
  }

  global.ARCAI = {
    run: run,
    runDetailed: runDetailed,
    providerFor: providerFor,
    tasks: { claude: CLAUDE_TASKS.slice(), gemini: GEMINI_TASKS.slice() },
    gateway: GATEWAY
  };

})(typeof window !== "undefined" ? window : globalThis);
