/*!
 * arc_gemini_client.js - Shared Gemini provider for ARC modules.
 *
 * Exposes window.ARCGemini. Deliberately dependency-free so any ARC module
 * (Chain Review, Motion Bank, Report Builder, OSINT) can include it directly.
 *
 * Design rules:
 *  - The key is never written into a URL, never logged, never included in any
 *    payload this file returns to a caller.
 *  - Every call is structured-output by default. Callers pass a responseSchema
 *    and receive a parsed object, not prose to be regex'd.
 *  - Nothing here interprets, scores, or concludes. Callers own their prompts.
 */
(function (global) {
  "use strict";

  var KEY_STORAGE = "ARC_GEMINI_KEY_V1";
  var CFG_STORAGE = "ARC_GEMINI_CONFIG_V1";
  var BASE = "/ai/google";
  var ENDPOINT = BASE + "/v1beta/models/";
  var FILES_ENDPOINT = BASE + "/v1beta/files";
  var UPLOAD_ENDPOINT = BASE + "/upload/v1beta/files";

  // Standard ARC three-rung ladder. Model IDs rotate on Google's side;
  // generate() walks this ladder automatically when a model ID is retired.
  var TEXT_MODEL_LADDER = ["gemini-3.6-flash", "gemini-2.5-flash", "gemini-flash-latest"];

  var DEFAULT_CONFIG = {
    extractModel: "gemini-3.6-flash",
    draftModel: "gemini-3.6-flash",
    videoModel: "gemini-3.6-flash",
    audioModel: "gemini-3.6-flash",
    // Image *generation* requires an image-capable model and has no flash-text
    // fallback. If this ID is retired the call fails loudly instead of walking
    // the text ladder.
    imageModel: "gemini-3.1-flash-image",
    maxInlineBytes: 18 * 1024 * 1024
  };

  var SUPPORTED = [
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
    "image/heic",
    "image/heif",
    "text/plain"
  ];

  // Media accepted by the Files API path (video/audio), separate from the
  // inline-document path above.
  var MEDIA_PREFIXES = ["video/", "audio/", "image/"];

  function text(v) { return String(v == null ? "" : v).trim(); }

  /* ----------------------------------------------------------- security ---- */

  // Provider credentials live only in the Cloudflare AI gateway. ARC keeps the
  // legacy method names so older modules do not need a risky flag-day rewrite,
  // but no key is ever accepted, stored, or returned by this browser client.
  try { localStorage.removeItem(KEY_STORAGE); } catch (e) {}

  function getKey() { return ""; }
  function setKey(value) {
    try { localStorage.removeItem(KEY_STORAGE); } catch (e) {}
    return true;
  }
  function clearKey() {
    try { localStorage.removeItem(KEY_STORAGE); } catch (e) {}
    return true;
  }
  function hasKey() { return true; }
  function keyHint() { return "Secured by ARC Cloudflare gateway"; }

  /* ------------------------------------------------------------- config ---- */

  function getConfig() {
    var stored = {};
    try { stored = JSON.parse(localStorage.getItem(CFG_STORAGE) || "{}") || {}; } catch (e) { stored = {}; }
    return {
      extractModel: text(stored.extractModel) || DEFAULT_CONFIG.extractModel,
      draftModel: text(stored.draftModel) || DEFAULT_CONFIG.draftModel,
      videoModel: text(stored.videoModel) || DEFAULT_CONFIG.videoModel,
      audioModel: text(stored.audioModel) || DEFAULT_CONFIG.audioModel,
      imageModel: text(stored.imageModel) || DEFAULT_CONFIG.imageModel,
      maxInlineBytes: Number(stored.maxInlineBytes) || DEFAULT_CONFIG.maxInlineBytes
    };
  }
  function setConfig(patch) {
    var next = Object.assign(getConfig(), patch || {});
    try { localStorage.setItem(CFG_STORAGE, JSON.stringify(next)); } catch (e) {}
    return next;
  }

  /* -------------------------------------------------------------- files ---- */

  function mimeOf(file) {
    var t = text(file && file.type).toLowerCase();
    if (t) return t;
    var name = text(file && file.name).toLowerCase();
    if (/\.pdf$/.test(name)) return "application/pdf";
    if (/\.png$/.test(name)) return "image/png";
    if (/\.jpe?g$/.test(name)) return "image/jpeg";
    if (/\.webp$/.test(name)) return "image/webp";
    if (/\.txt$/.test(name)) return "text/plain";
    return "";
  }

  function isSupported(file) { return SUPPORTED.indexOf(mimeOf(file)) !== -1; }

  function readBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error("The file " + file.name + " could not be read.")); };
      reader.onload = function () {
        var raw = String(reader.result || "");
        var comma = raw.indexOf(",");
        resolve(comma >= 0 ? raw.slice(comma + 1) : "");
      };
      reader.readAsDataURL(file);
    });
  }

  function filePart(file) {
    var mime = mimeOf(file);
    if (!mime) throw new Error("ARC could not determine the file type of " + file.name + ".");
    if (SUPPORTED.indexOf(mime) === -1) {
      throw new Error(file.name + " is a " + mime + " file. Supply a PDF, PNG, JPEG, WEBP, or plain-text record.");
    }
    if (file.size > getConfig().maxInlineBytes) {
      throw new Error(
        file.name + " is " + Math.round(file.size / 1048576) + " MB. Split it into smaller documents " +
        "or raise the inline limit in Settings."
      );
    }
    return readBase64(file).then(function (data) {
      if (!data) throw new Error("The file " + file.name + " produced no readable content.");
      return { inline_data: { mime_type: mime, data: data } };
    });
  }

  /* --------------------------------------------------------------- call ---- */

  function describeHttpError(status, body) {
    var apiMessage = "";
    try { apiMessage = text(body && body.error && body.error.message); } catch (e) {}
    if (status === 400 && /API key not valid/i.test(apiMessage)) {
      return "The ARC Gemini gateway rejected its provider credential. Check the Worker GOOGLE_API_KEY secret.";
    }
    if (status === 401 || status === 403) {
      return "Gemini refused the gateway request (" + status + "). Check the Worker secret, API restrictions, billing, and Cloudflare Access session.";
    }
    if (status === 429) {
      return "Gemini rate limit reached. Wait and retry, or reduce how many documents you send at once.";
    }
    if (status === 413) {
      return "The document was too large for one request. Split it into smaller files.";
    }
    if (status >= 500) {
      return "Gemini returned a server error (" + status + "). Nothing was extracted. Retry shortly.";
    }
    return "Gemini request failed (" + status + ")" + (apiMessage ? ": " + apiMessage : ".");
  }

  function firstTextPart(candidate) {
    var parts = (candidate && candidate.content && candidate.content.parts) || [];
    for (var i = 0; i < parts.length; i++) {
      if (typeof parts[i].text === "string" && parts[i].text.length) return parts[i].text;
    }
    return "";
  }

  /**
   * generate({model, systemInstruction, parts, schema, temperature, signal})
   * Resolves to a parsed object when `schema` is supplied, otherwise to a string.
   */
  function generate(options) {
    var opts = options || {};
    var model = text(opts.model) || getConfig().extractModel;
    var generationConfig = {};
    if (opts.schema) {
      generationConfig.responseMimeType = "application/json";
      generationConfig.responseSchema = opts.schema;
    }
    if (opts.maxOutputTokens) generationConfig.maxOutputTokens = opts.maxOutputTokens;
    // Video billing is ~300 tokens/sec at default resolution and ~100 at low.
    // On an hour of body-cam that is the difference between ~1.08M and ~360k.
    if (opts.mediaResolution) generationConfig.mediaResolution = opts.mediaResolution;
    if (opts.thinkingLevel) generationConfig.thinkingConfig = { thinkingLevel: opts.thinkingLevel };

    var body = {
      contents: [{ role: "user", parts: opts.parts || [{ text: text(opts.prompt) }] }],
      generationConfig: generationConfig
    };
    if (opts.systemInstruction) {
      body.systemInstruction = { parts: [{ text: text(opts.systemInstruction) }] };
    }

    // attempt() performs one fetch and, on a 404 (Google retired the model
    // ID), retries down the standard ladder. It resolves to the raw API
    // payload only; all response interpretation happens once, below.
    function attempt(activeModel, remainingLadder) {
      return fetch(ENDPOINT + encodeURIComponent(activeModel) + ":generateContent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
        signal: opts.signal
      }).then(function (response) {
        return response.json().catch(function () { return null; }).then(function (payload) {
          if (!response.ok) {
            if (response.status === 404 && remainingLadder.length) {
              return attempt(remainingLadder[0], remainingLadder.slice(1));
            }
            throw new Error(describeHttpError(response.status, payload));
          }
          return payload;
        });
      });
    }

    var ladder = TEXT_MODEL_LADDER.filter(function (m) { return m !== model; });
    return attempt(model, ladder).then(function (payload) {
      var blocked = payload && payload.promptFeedback && payload.promptFeedback.blockReason;
      if (blocked) {
        throw new Error("Gemini blocked this document (" + blocked + "). Nothing was extracted.");
      }
      var candidate = payload && payload.candidates && payload.candidates[0];
      if (!candidate) throw new Error("Gemini returned no content for this document.");

      var reason = text(candidate.finishReason);
      if (reason === "SAFETY" || reason === "PROHIBITED_CONTENT") {
        throw new Error("Gemini stopped on a safety filter. Nothing was extracted from this document.");
      }
      if (reason === "MAX_TOKENS") {
        throw new Error("The response was cut off before completing. Split the document and rerun so no record is silently dropped.");
      }
      if (reason === "RECITATION") {
        throw new Error("Gemini halted on a recitation filter. Nothing was extracted.");
      }

      var raw = firstTextPart(candidate);
      if (!raw) throw new Error("Gemini returned an empty response for this document.");
      if (!opts.schema) return raw;

      try {
        return JSON.parse(raw);
      } catch (e) {
        throw new Error("Gemini returned malformed JSON. Nothing was staged from this document.");
      }
    }).catch(function (error) {
      if (error && error.name === "AbortError") throw new Error("Extraction cancelled.");
      if (error instanceof TypeError) {
        throw new Error("Could not reach the ARC Gemini gateway. Check the network connection and Cloudflare Access session.");
      }
      throw error;
    });
  }

  /* ---------------------------------------------------------- files API ---- */
  /*
   * Body-worn camera footage is far too large for an inline request, so video
   * goes through the resumable Files API instead. Uploaded files live on
   * Google's servers for 48 hours and are then deleted automatically.
   *
   * Browser caveat: this is a cross-origin upload, so it depends on Google
   * exposing X-Goog-Upload-URL via Access-Control-Expose-Headers. If a browser
   * blocks it we surface that plainly rather than failing silently.
   */
  function isMedia(file) {
    var mime = mimeOf(file);
    return MEDIA_PREFIXES.some(function (p) { return mime.indexOf(p) === 0; });
  }

  function uploadFile(file, onProgress) {
    var mime = mimeOf(file) || "application/octet-stream";
    var report = function (stage, pct) { if (onProgress) { try { onProgress(stage, pct); } catch (e) {} } };

    report("starting", 0);
    return fetch(UPLOAD_ENDPOINT, {
      method: "POST",
      headers: {
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(file.size),
        "X-Goog-Upload-Header-Content-Type": mime,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ file: { display_name: file.name } }),
      credentials: "include"
    }).then(function (response) {
      if (!response.ok) {
        return response.json().catch(function () { return null; }).then(function (payload) {
          throw new Error(describeHttpError(response.status, payload));
        });
      }
      var uploadUrl = response.headers.get("X-Goog-Upload-URL") || response.headers.get("x-goog-upload-url");
      if (!uploadUrl) {
        throw new Error(
          "The upload session URL was not readable from the browser. Google did not expose the " +
          "X-Goog-Upload-URL header to this origin. Route uploads through a small server-side proxy, " +
          "or clip the footage under 100 MB and use inline mode."
        );
      }
      report("uploading", 5);
      return fetch(uploadUrl, {
        method: "POST",
        headers: {
          "Content-Length": String(file.size),
          "X-Goog-Upload-Offset": "0",
          "X-Goog-Upload-Command": "upload, finalize"
        },
        body: file
      });
    }).then(function (response) {
      return response.json().catch(function () { return null; }).then(function (payload) {
        if (!response.ok) throw new Error(describeHttpError(response.status, payload));
        var f = payload && payload.file;
        if (!f || !f.uri) throw new Error("The upload finished but Google returned no file reference.");
        report("processing", 60);
        return waitForActive(f, report);
      });
    }).catch(function (error) {
      if (error instanceof TypeError) {
        throw new Error("The upload could not reach Google, which usually means the browser blocked it as cross-origin. A server-side proxy is required for large-file uploads from this page.");
      }
      throw error;
    });
  }

  /** Video is transcoded server-side; it is unusable until state is ACTIVE. */
  function waitForActive(fileRef, report) {
    var name = fileRef.name;
    var attempts = 0;
    function poll() {
      attempts += 1;
      if (attempts > 150) throw new Error("Google is still processing this file after several minutes. Try a shorter clip.");
      return new Promise(function (r) { setTimeout(r, 2000); }).then(function () {
        return fetch(BASE + "/v1beta/" + name, { credentials: "include" });
      }).then(function (response) {
        return response.json().catch(function () { return null; });
      }).then(function (payload) {
        var state = payload && payload.state;
        if (state === "ACTIVE") { if (report) report("ready", 100); return payload; }
        if (state === "FAILED") {
          throw new Error("Google could not process this file. It may be a codec it does not accept. Re-export as H.264 MP4.");
        }
        if (report) report("processing", Math.min(95, 60 + attempts * 2));
        return poll();
      });
    }
    if (fileRef.state === "ACTIVE") { if (report) report("ready", 100); return Promise.resolve(fileRef); }
    return poll();
  }

  function deleteFile(name) {
    if (!name) return Promise.resolve(false);
    return fetch(BASE + "/v1beta/" + name, { method: "DELETE", credentials: "include" })
      .then(function (r) { return r.ok; }).catch(function () { return false; });
  }

  function fileDataPart(fileRef) {
    return { file_data: { mime_type: fileRef.mimeType || fileRef.mime_type, file_uri: fileRef.uri } };
  }

  /* ------------------------------------------------------ image + audio ---- */
  /** Returns a data URL, or "" if the model returned no image part. */
  function generateImage(options) {
    var opts = options || {};
    var parts = [];
    if (opts.imageBase64) {
      parts.push({ inline_data: { mime_type: opts.imageMime || "image/png", data: String(opts.imageBase64).replace(/^data:[^;]+;base64,/, "") } });
    }
    parts.push({ text: text(opts.prompt) });
    return fetch(ENDPOINT + encodeURIComponent(opts.model || getConfig().imageModel) + ":generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: parts }],
        generationConfig: { imageConfig: { aspectRatio: opts.aspectRatio || "16:9", imageSize: opts.imageSize || "1K" } }
      }),
      credentials: "include"
    }).then(function (response) {
      return response.json().catch(function () { return null; }).then(function (payload) {
        if (!response.ok) throw new Error(describeHttpError(response.status, payload));
        var candidate = payload && payload.candidates && payload.candidates[0];
        var pieces = (candidate && candidate.content && candidate.content.parts) || [];
        for (var i = 0; i < pieces.length; i++) {
          var d = pieces[i].inlineData || pieces[i].inline_data;
          if (d && d.data) return "data:" + (d.mimeType || d.mime_type || "image/png") + ";base64," + d.data;
        }
        return "";
      });
    });
  }

  function transcribeAudio(blob, instruction) {
    return readBase64(blob).then(function (data) {
      return generate({
        model: getConfig().audioModel,
        parts: [
          { inline_data: { mime_type: blob.type || "audio/webm", data: data } },
          { text: text(instruction) || "Transcribe this recording verbatim. Label speakers only where a speaker identifies themselves or is named. Do not summarize, correct grammar, or infer words that are inaudible - mark those [inaudible]." }
        ],
      });
    });
  }

  /** Cheap key check that does not spend a document. */
  function testKey() {
    return generate({
      prompt: "Reply with the single word: ready",
      maxOutputTokens: 16
    }).then(function () { return true; });
  }

  global.ARCGemini = {
    KEY_STORAGE: KEY_STORAGE,
    getKey: getKey,
    setKey: setKey,
    clearKey: clearKey,
    hasKey: hasKey,
    keyHint: keyHint,
    getConfig: getConfig,
    setConfig: setConfig,
    isSupported: isSupported,
    isMedia: isMedia,
    supportedTypes: SUPPORTED.slice(),
    filePart: filePart,
    mimeOf: mimeOf,
    readBase64: readBase64,
    uploadFile: uploadFile,
    deleteFile: deleteFile,
    fileDataPart: fileDataPart,
    generate: generate,
    generateImage: generateImage,
    transcribeAudio: transcribeAudio,
    testKey: testKey
  };
})(window);
