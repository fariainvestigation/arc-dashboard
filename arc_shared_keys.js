/* ARC shared system keys - one browser-local vault for every module. */
(function (global) {
  "use strict";

  const SHARED_KEYS_STORAGE = "arc_defense_system_keys_v1";
  const DEFAULTS = {
    openai: "",
    gemini: "",
    courtlistener: "",
    firecrawl: "",
    googleApiKey: "",
    googleCseId: "",
    updatedAt: null
  };
  const DIRECT_KEYS = {
    openai: "ARC_OPENAI_KEY_V1",
    gemini: "ARC_GEMINI_KEY_V1",
    firecrawl: "ARC_FIRECRAWL_KEY_V1",
    courtlistener: "ARC_COURTLISTENER_TOKEN"
  };
  const channel = "BroadcastChannel" in global ? new BroadcastChannel("arc-system-keys") : null;

  function safeParse(raw) {
    try { return raw ? JSON.parse(raw) : {}; } catch (error) { return {}; }
  }

  function getItem(storage, key) {
    try { return storage.getItem(key) || ""; } catch (error) { return ""; }
  }

  function setItem(storage, key, value) {
    try {
      if (value) storage.setItem(key, value);
      else storage.removeItem(key);
    } catch (error) {}
  }

  function readShared() {
    const shared = safeParse(getItem(localStorage, SHARED_KEYS_STORAGE));
    const report = safeParse(getItem(localStorage, "arc_standalone_provider_keys_v1"));
    const motion = safeParse(getItem(localStorage, "arcMotionBank_apiSettings_v1"));
    const next = Object.assign({}, DEFAULTS, shared);

    next.openai = next.openai || getItem(localStorage, DIRECT_KEYS.openai) || report.openai || "";
    next.gemini = next.gemini || next.googleApiKey || getItem(localStorage, DIRECT_KEYS.gemini) || report.gemini || motion.googleApiKey || "";
    next.googleApiKey = next.googleApiKey || next.gemini;
    next.firecrawl = next.firecrawl || getItem(localStorage, DIRECT_KEYS.firecrawl) || motion.firecrawlKey || "";
    next.courtlistener = next.courtlistener || getItem(localStorage, DIRECT_KEYS.courtlistener) || report.courtlistener || motion.courtListenerToken || "";
    next.googleCseId = next.googleCseId || motion.googleCseId || DEFAULTS.googleCseId;
    return next;
  }

  function mirrorModuleStores(next) {
    setItem(localStorage, DIRECT_KEYS.openai, next.openai);
    setItem(localStorage, DIRECT_KEYS.gemini, next.gemini || next.googleApiKey);
    setItem(localStorage, DIRECT_KEYS.firecrawl, next.firecrawl);
    setItem(localStorage, DIRECT_KEYS.courtlistener, next.courtlistener);

    const report = safeParse(getItem(localStorage, "arc_standalone_provider_keys_v1"));
    localStorage.setItem("arc_standalone_provider_keys_v1", JSON.stringify(Object.assign({}, report, {
      openai: next.openai,
      gemini: next.gemini || next.googleApiKey,
      courtlistener: next.courtlistener
    })));

    const motion = safeParse(getItem(localStorage, "arcMotionBank_apiSettings_v1"));
    const motionPayload = Object.assign({}, motion, {
      courtListenerToken: next.courtlistener,
      firecrawlKey: next.firecrawl,
      googleApiKey: next.googleApiKey || next.gemini,
      googleCseId: next.googleCseId,
      persist: motion.persist || "local"
    });
    localStorage.setItem("arcMotionBank_apiSettings_v1", JSON.stringify(motionPayload));

    const sessionMotion = safeParse(getItem(sessionStorage, "arcMotionBank_apiSettings_session_v1"));
    if (Object.keys(sessionMotion).length) {
      sessionStorage.setItem("arcMotionBank_apiSettings_session_v1", JSON.stringify(Object.assign({}, sessionMotion, motionPayload)));
    }
  }

  function writeShared(partial) {
    const next = Object.assign({}, readShared(), partial || {});
    next.gemini = String(next.gemini || next.googleApiKey || "").trim();
    next.googleApiKey = next.gemini;
    next.openai = String(next.openai || "").trim();
    next.firecrawl = String(next.firecrawl || "").trim();
    next.courtlistener = String(next.courtlistener || "").trim();
    next.googleCseId = String(next.googleCseId || DEFAULTS.googleCseId).trim();
    next.updatedAt = new Date().toISOString();

    localStorage.setItem(SHARED_KEYS_STORAGE, JSON.stringify(next));
    mirrorModuleStores(next);
    document.dispatchEvent(new CustomEvent("arc:keys-updated", { detail: status(next) }));
    if (channel) channel.postMessage({ type: "keys-updated", status: status(next) });
    return next;
  }

  function clearShared() {
    return writeShared({ openai: "", gemini: "", googleApiKey: "", courtlistener: "", firecrawl: "", googleCseId: "" });
  }

  function status(value) {
    const keys = value || readShared();
    return {
      openai: Boolean(keys.openai),
      gemini: Boolean(keys.gemini || keys.googleApiKey),
      courtlistener: Boolean(keys.courtlistener),
      firecrawl: Boolean(keys.firecrawl),
      googleCseId: Boolean(keys.googleCseId)
    };
  }

  function mergeIntoModule(moduleName) {
    const shared = readShared();
    mirrorModuleStores(shared);
    if (moduleName === "report") return safeParse(getItem(localStorage, "arc_standalone_provider_keys_v1"));
    if (moduleName === "motion") return safeParse(getItem(localStorage, "arcMotionBank_apiSettings_v1"));
    return shared;
  }

  try { writeShared(readShared()); } catch (error) { console.warn("ARC key vault is unavailable in this browser context.", error); }

  if (channel) {
    channel.addEventListener("message", function (event) {
      if (event.data && event.data.type === "keys-updated") {
        document.dispatchEvent(new CustomEvent("arc:keys-updated", { detail: event.data.status || status() }));
      }
    });
  }

  global.ARC_DEFAULT_CSE_ID = readShared().googleCseId || DEFAULTS.googleCseId;
  global.ARC_SYSTEM_KEYS = {
    STORAGE: SHARED_KEYS_STORAGE,
    read: readShared,
    write: writeShared,
    clear: clearShared,
    status: status,
    mergeIntoModule: mergeIntoModule
  };
})(typeof window !== "undefined" ? window : globalThis);
