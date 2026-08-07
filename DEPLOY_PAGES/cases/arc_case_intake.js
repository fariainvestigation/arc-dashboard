/* ===================================================================
   ARC Case Intake, migrated in full from the retired standalone
   Case Intake Dashboard page.

   Case Intake used to be the only place in ARC where a case could be
   created; every other module reads case context from arc_unified_bridge.js,
   which only intake populated. The whole capability now lives here as the
   "intake" route so the Report Generator is the single dashboard and case
   entry point.

   Helpers reused from this file rather than re-implemented: escapeHtml,
   formatBytes, uid, icon, pageHeading, toast/toastRegion, view.
   =================================================================== */
const INTAKE_KEY = "arc_case_intake_package_v1";
const INTAKE_DB_NAME = "arc_case_intake_db";
const INTAKE_CORE = [
  { id: "masscourt", label: "Docket Information (from MassCourt)" },
  { id: "police_app", label: "Police Report + Criminal Application" },
  { id: "discovery", label: "Discovery" },
  { id: "investigator", label: "Investigators Reports" },
  { id: "media", label: "Media / News" }
];
const INTAKE_PARTIES = [
  { id: "defendant", label: "A -- Defendant", hint: "Primary subject" },
  { id: "codefendant", label: "B -- Co-Defendant", hint: "Optional" },
  { id: "victim", label: "C -- Victim", hint: "Complaining witness / alleged victim" },
  { id: "officers", label: "D -- Officers", hint: "POST / agency search" }
];
// Local builds, not a CDN. The repo already ships pdf.js under libs/, so the
// CDN copy was both a second pdf.js instance in one product and an external
// script fetch on a page that handles police reports and discovery.
const INTAKE_CDN = {
  pdfjs: "../../libs/pdf.min.js",
  pdfjsWorker: "../../libs/pdf.worker.min.js",
  mammoth: "../../libs/mammoth.browser.min.js"
};
const INTAKE_DEFAULT_STATUS = "Automated chain-of-custody logging begins when the case is initiated.";
const INTAKE_DEFAULT_EXTRACTION =
  "No extracted report facts yet. Upload a PDF, DOCX, TXT, HTML, CSV, or JSON report to any Case Dashboard slot.";
const intakeLoadedScripts = {};

let intakeStatusMessage = INTAKE_DEFAULT_STATUS;
let intakeShellMessage = "Case Intake ready";
let intakeToastNode = null;

function intakeText(value) {
  return String(value == null ? "" : value).trim();
}

function intakeEl(id) {
  return document.getElementById(id);
}

function intakeMakeCaseId() {
  if (window.ARCUnified && typeof window.ARCUnified.newCaseId === "function") return window.ARCUnified.newCaseId();
  return "case_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
}

function intakeBlank() {
  return {
    caseId: intakeMakeCaseId(),
    createdAt: new Date().toISOString(),
    policeSeed: [],
    defendant: "",
    docket: "",
    court: "",
    attorney: "",
    incidentDate: "",
    extractions: [],
    aiChain: { interactionId: "", model: "", updatedAt: "", history: [] },
    core: INTAKE_CORE.reduce(function (acc, row) { acc[row.id] = { skipped: false, files: [] }; return acc; }, {}),
    parties: INTAKE_PARTIES.reduce(function (acc, row) {
      acc[row.id] = { approved: false, notes: "", files: [], search: "" };
      return acc;
    }, {})
  };
}

let intakeState = intakeBlank();

// 00 used a single-slot toast element. This file already has one toast system,
// so reuse it and retire the previous intake toast instead of shipping a second
// implementation; progress messages still replace one another.
function intakeNotify(message, isError) {
  if (intakeToastNode && intakeToastNode.isConnected) intakeToastNode.remove();
  toast(String(message == null ? "" : message), "", isError ? "error" : "info", 3200);
  intakeToastNode = toastRegion.lastElementChild;
}

function intakeSetStatus(message) {
  intakeStatusMessage = message;
  const node = intakeEl("statusLine");
  if (node) node.textContent = message;
}

function intakeSetShellMeta(message) {
  intakeShellMessage = message;
  const node = intakeEl("shellMeta");
  if (node) node.textContent = message;
}

function intakeLoadScript(url) {
  if (intakeLoadedScripts[url]) return intakeLoadedScripts[url];
  intakeLoadedScripts[url] = new Promise(function (resolve, reject) {
    const existing = document.querySelector("script[src='" + url + "']");
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      if (url.indexOf("pdf.min.js") >= 0 && window.pdfjsLib) resolve();
      if (url.indexOf("mammoth") >= 0 && window.mammoth) resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = url;
    script.onload = resolve;
    script.onerror = function () { reject(new Error("Could not load the document extraction library.")); };
    document.head.appendChild(script);
  });
  return intakeLoadedScripts[url];
}

function intakeNormalizeName(raw) {
  let value = intakeText(raw).replace(/\s+/g, " ").replace(/[.,;|]+$/, "");
  const lastFirst = value.match(/^([A-Za-z'\-]+),\s+(.+)$/);
  if (lastFirst) value = lastFirst[2] + " " + lastFirst[1];
  if (value && value === value.toUpperCase()) {
    value = value.toLowerCase().split(" ").map(function (part) {
      if (/^(ii|iii|iv)$/.test(part)) return part.toUpperCase();
      if (/^(jr|sr)\.?$/.test(part)) return part.charAt(0).toUpperCase() + part.slice(1);
      return part.split("-").map(function (piece) {
        return piece.charAt(0).toUpperCase() + piece.slice(1);
      }).join("-");
    }).join(" ");
  }
  return value;
}

function intakeCleanValue(value) {
  return intakeText(value).replace(/\s+/g, " ").replace(/^[#:.\-\s]+/, "").replace(/[|;]+$/, "").trim();
}

function intakeItemsToLines(items) {
  const rows = [];
  items.forEach(function (item) {
    if (!item.str || !item.str.trim()) return;
    const y = (item.transform && item.transform[5]) || 0;
    const x = (item.transform && item.transform[4]) || 0;
    let row = rows.find(function (candidate) { return Math.abs(candidate.y - y) < 3; });
    if (!row) {
      row = { y: y, items: [] };
      rows.push(row);
    }
    row.items.push({ x: x, str: item.str });
  });
  rows.sort(function (left, right) { return right.y - left.y; });
  return rows.map(function (row) {
    return row.items.sort(function (left, right) { return left.x - right.x; })
      .map(function (item) { return item.str; }).join(" ").replace(/\s+/g, " ").trim();
  }).filter(Boolean).join("\n");
}

async function intakeTextFromPdf(file, progress) {
  await intakeLoadScript(INTAKE_CDN.pdfjs);
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = INTAKE_CDN.pdfjsWorker;
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await window.pdfjsLib.getDocument({ data: data }).promise;
  const out = [];
  const pageLimit = Math.min(pdf.numPages, 80);
  for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
    if (progress) progress("Reading " + file.name + " page " + pageNumber + " of " + pdf.numPages);
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    out.push("[Page " + pageNumber + "]\n" + intakeItemsToLines(content.items));
    if (page.cleanup) page.cleanup();
  }
  let extracted = out.join("\n\n");
  if (pdf.numPages > pageLimit) extracted += "\n\n[Only first " + pageLimit + " pages were scanned for Case Dashboard autofill.]";
  return extracted;
}

async function intakeTextFromDocx(file) {
  await intakeLoadScript(INTAKE_CDN.mammoth);
  const buffer = await file.arrayBuffer();
  const result = await window.mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value || "";
}

async function intakeExtractTextFromFile(file, progress) {
  const name = (file.name || "").toLowerCase();
  const type = (file.type || "").toLowerCase();
  if (type === "application/pdf" || name.endsWith(".pdf")) {
    const embeddedText = await intakeTextFromPdf(file, progress);
    if (embeddedText.replace(/\[Page\s+\d+\]/gi, "").trim().length >= 80) return embeddedText;
    try {
      if (progress) progress("No usable embedded text found. Running Google Document AI OCR for " + file.name + ".");
      return await intakeServerOcr(file);
    } catch (ocrError) {
      if (embeddedText.trim()) return embeddedText;
      throw ocrError;
    }
  }
  if (name.endsWith(".docx") || type.indexOf("officedocument.wordprocessingml") >= 0) return intakeTextFromDocx(file);
  if (type.startsWith("text/") || /\.(txt|md|csv|json|html?|xml)$/i.test(name)) return file.text();
  if (type.startsWith("image/") || /\.(png|jpe?g|tiff?|webp|bmp|gif)$/i.test(name)) {
    if (progress) progress("Running Google Document AI OCR for " + file.name + ".");
    return intakeServerOcr(file);
  }
  throw new Error("Unsupported extraction type. Stored the file, but could not read text from it.");
}

function intakeFindField(rawText, patterns) {
  for (let index = 0; index < patterns.length; index += 1) {
    const match = rawText.match(patterns[index]);
    if (match && match[1]) return intakeCleanValue(match[1]);
  }
  return "";
}

function intakeExtractCaseFields(rawText, category) {
  const source = String(rawText || "").replace(/\r\n?/g, "\n");
  const compact = source.replace(/[ \t]+/g, " ");
  const fields = {};
  fields.docket = intakeFindField(compact, [
    /\b(?:docket|case|complaint|citation)\s*(?:no\.?|number|num\.?|#)\s*[:.]?\s*([0-9]{2,4}[A-Z]{0,4}[- ]?[A-Z]{0,3}[0-9]{2,7}[A-Z]{0,3}(?:[- ][0-9A-Z]{1,6})?)/i,
    /\b([0-9]{2,4}(?:CR|DL|JV|RO|AC|SU|PC)[0-9]{4,7}[A-Z]{0,2})\b/i
  ]);
  fields.court = intakeFindField(source, [
    /\b([A-Z][A-Za-z ]+\s+(?:Superior|District|Juvenile|Municipal)\s+Court(?:\s+Department)?(?:\s*[-,]\s*[A-Za-z ]+Division)?)/,
    /\b(BMC\s+[A-Za-z ]+(?:Division)?)/i,
    /COURT\s*NAME\s*\n\s*([^\n]{5,120})/i
  ]);
  fields.defendant = intakeFindField(source, [
    /(?:^|\n)\s*(?:DEFENDANT|ARRESTEE|SUSPECT|OPERATOR|OFFENDER|SUBJECT)(?:\s+NAME)?\s*[:#]?\s*([A-Z][A-Za-z'\-]+(?:,?\s+[A-Z][A-Za-z'\-.]+){1,4})/i,
    /DEFENDANT\s*NAME[^\n]*\n\s*([^\n]{4,120})/i,
    /Commonwealth\s+v\.?\s+([A-Z][A-Za-z'\-]+(?:\s+[A-Z][A-Za-z'\-]+){0,4})/i
  ]);
  if (fields.defendant) fields.defendant = intakeNormalizeName(fields.defendant.replace(/\b(?:BMC|District|Superior|Municipal|Juvenile)\b.*$/i, ""));
  fields.attorney = intakeFindField(source, [
    /(?:attorney|counsel|defense counsel|counsel of record)\s*[:.]?\s*([^\n]{4,100})/i,
    /(?:BBO|bar no\.?).{0,40}\n\s*([A-Z][^\n]{4,100})/i
  ]);
  fields.incidentDate = intakeFindField(source, [
    /(?:date\s+of\s+(?:incident|offense|occurrence)|incident\s+date|offense\s+date)\s*[:.]?\s*([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{2,4}|20[0-9]{2}-[0-9]{2}-[0-9]{2})/i,
    /DATE OF OFFENSE[^\n]*\n[^\n]*?([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{2,4})/i
  ]);
  fields.charges = intakeFindField(source, [
    /(?:charges?|offenses?)\s*[:.]\s*([^\n]{4,180})/i,
    /^\s*\d+\s+\d{2,3}[A-Z]?\/\S+\s+(.{4,120})$/im
  ]);
  fields.agency = intakeFindField(source, [
    /\b([A-Z][A-Za-z.]+(?:\s+[A-Z][A-Za-z.]+){0,4}\s+(?:Police|POLICE)\s+(?:Department|DEPARTMENT))\b/,
    /(?:agency|department|reporting agency)\s*[:.]\s*([^\n]{3,100})/i
  ]);
  fields.officers = [];
  const officerRe = /\b(Officer|Ofc\.?|Detective|Det\.?|Sergeant|Sgt\.?|Lieutenant|Lt\.?|Trooper|Tpr\.?)\s+([A-Z](?:[A-Za-z'\-]+|\.)?(?:\s+[A-Z][A-Za-z'\-]+){0,2})(?:\s*#\s*([0-9]{2,7}))?/g;
  let match;
  while ((match = officerRe.exec(source)) !== null && fields.officers.length < 10) {
    const officer = intakeCleanValue(match[1].replace(/\.$/, "") + " " + match[2] + (match[3] ? " #" + match[3] : ""));
    if (fields.officers.map(function (item) { return item.toLowerCase(); }).indexOf(officer.toLowerCase()) < 0) fields.officers.push(officer);
  }
  if (category.indexOf("party:defendant") === 0 && !fields.defendant) {
    fields.defendant = intakeFindField(source, [/^\s*([A-Z][A-Za-z'\-]+(?:\s+[A-Z][A-Za-z'\-]+){1,4})\s*$/m]);
  }
  return fields;
}

function intakeApplyExtractedFields(fields) {
  const changed = [];
  function setField(id, value, label) {
    value = intakeCleanValue(value);
    const input = intakeEl(id);
    if (!value || !input || intakeText(input.value)) return;
    input.value = value;
    changed.push(label || id);
  }
  setField("docket", fields.docket, "docket");
  setField("court", fields.court, "court");
  setField("defendant", fields.defendant, "matter title");
  setField("attorney", fields.attorney, "counsel/client");
  intakeReadForm();
  if (fields.incidentDate && !intakeState.incidentDate) {
    intakeState.incidentDate = fields.incidentDate;
    changed.push("incident date");
  }
  return changed;
}

function intakeExtractionFacts(fields) {
  const facts = [];
  ["docket", "court", "defendant", "attorney", "incidentDate", "charges", "agency"].forEach(function (key) {
    if (fields[key]) facts.push({ category: key, text: fields[key] });
  });
  (fields.officers || []).forEach(function (officer) { facts.push({ category: "officer", text: officer }); });
  return facts;
}

function intakeOpenDb() {
  return new Promise(function (resolve, reject) {
    const req = indexedDB.open(INTAKE_DB_NAME, 1);
    req.onupgradeneeded = function () {
      const db = req.result;
      if (!db.objectStoreNames.contains("files")) db.createObjectStore("files", { keyPath: "id" });
    };
    req.onsuccess = function () { resolve(req.result); };
    req.onerror = function () { reject(req.error); };
  });
}

function intakePutBlob(meta, blob) {
  return intakeOpenDb().then(function (db) {
    return new Promise(function (resolve, reject) {
      const tx = db.transaction("files", "readwrite");
      tx.objectStore("files").put({ id: meta.id, meta: meta, blob: blob });
      tx.oncomplete = function () { resolve(meta); };
      tx.onerror = function () { reject(tx.error); };
    });
  });
}

function intakeGetBlob(fileId) {
  return intakeOpenDb().then(function (db) {
    return new Promise(function (resolve, reject) {
      const req = db.transaction("files", "readonly").objectStore("files").get(fileId);
      req.onsuccess = function () { resolve(req.result || null); };
      req.onerror = function () { reject(req.error); };
    });
  });
}


async function intakeSha256(file) {
  if (!file || !file.arrayBuffer || !window.crypto || !window.crypto.subtle) return "";
  const digest = await window.crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map(function (byte) {
    return byte.toString(16).padStart(2, "0");
  }).join("");
}

function intakeReadBase64(file) {
  return new Promise(function (resolve, reject) {
    const reader = new FileReader();
    reader.onerror = function () { reject(new Error("The document could not be read for OCR.")); };
    reader.onload = function () {
      const raw = String(reader.result || "");
      const comma = raw.indexOf(",");
      resolve(comma >= 0 ? raw.slice(comma + 1) : raw);
    };
    reader.readAsDataURL(file);
  });
}

async function intakeServerOcr(file) {
  if (!window.ARCProviders || typeof window.ARCProviders.ocrDocument !== "function") {
    throw new Error("Google Document AI OCR is unavailable on this ARC server.");
  }
  const base64 = await intakeReadBase64(file);
  const response = await window.ARCProviders.ocrDocument({
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    base64: base64,
    caseId: intakeState.caseId
  });
  const ocr = response && response.ocr ? response.ocr : {};
  if (Array.isArray(ocr.pages) && ocr.pages.length) {
    return ocr.pages.map(function (page, index) {
      return "[Page " + (page.page || index + 1) + "]\n" + String(page.text || "");
    }).join("\n\n");
  }
  if (ocr.text) return String(ocr.text);
  throw new Error("OCR completed but returned no readable text.");
}

async function intakeMirrorSharedDocument(meta, extractedText, status, extractionError) {
  if (!window.ARCCaseDocuments || typeof window.ARCCaseDocuments.mirrorIntakeDocument !== "function") return null;
  return window.ARCCaseDocuments.mirrorIntakeDocument({
    id: meta.id,
    originalFileId: meta.id,
    caseId: intakeState.caseId,
    name: meta.name,
    mime: meta.type,
    size: meta.size,
    uploadedAt: meta.uploadedAt,
    status: status,
    processingStatus: meta.extraction && meta.extraction.status || "",
    docType: meta.category,
    origin: "new-matter-initiation",
    sha256: meta.sha256 || "",
    serverAssetId: meta.serverAssetId || "",
    serverStored: Boolean(meta.serverStored || meta.serverAssetId),
    text: extractedText || "",
    extractionError: extractionError || ""
  });
}

function intakeFileMeta(file, category) {
  return {
    id: uid("file"),
    name: file.name,
    size: file.size,
    type: file.type || "application/octet-stream",
    category: category,
    uploadedAt: new Date().toISOString()
  };
}

function intakeRenderChips(container, files, onRemove) {
  if (!container) return;
  container.innerHTML = "";
  container.className = "intake-chips";
  files.forEach(function (file) {
    const chip = document.createElement("span");
    chip.className = "intake-chip";
    const extraction = file.extraction && file.extraction.status ? " - " + file.extraction.status : "";
    chip.innerHTML =
      "<span>" + escapeHtml(file.name) + " <small>(" + escapeHtml(formatBytes(file.size)) + extraction + ")</small></span>";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "icon-button small danger";
    remove.title = "Delete";
    remove.setAttribute("aria-label", "Delete " + file.name);
    remove.innerHTML = icon("trash");
    remove.onclick = function () { onRemove(file.id); };
    chip.appendChild(remove);
    container.appendChild(chip);
  });
}

function intakeRenderExtractionSummary() {
  const root = intakeEl("extractionSummary");
  if (!root) return;
  const rows = intakeState.extractions || [];
  if (!rows.length) {
    root.textContent = INTAKE_DEFAULT_EXTRACTION;
    return;
  }
  const facts = [];
  rows.forEach(function (row) {
    (row.facts || []).forEach(function (fact) {
      const key = fact.category + "|" + String(fact.text || "").toLowerCase();
      if (!facts.some(function (existing) { return existing.key === key; })) {
        facts.push({ key: key, category: fact.category, text: fact.text, source: row.name });
      }
    });
  });
  const latest = rows.slice(-3).map(function (row) {
    const label = row.status === "extracted" ? (row.textChars + " chars") : row.status;
    return "<li>" + escapeHtml(row.name) + " - " + escapeHtml(label) + "</li>";
  }).join("");
  const factList = facts.slice(0, 10).map(function (fact) {
    return "<li><strong>" + escapeHtml(fact.category) + ":</strong> " + escapeHtml(fact.text) + "</li>";
  }).join("");
  root.innerHTML = "<strong>Extraction summary:</strong> " + rows.length + " file(s) processed, " + facts.length + " fact(s) detected." +
    (latest ? "<ul>" + latest + "</ul>" : "") +
    (factList ? "<ul>" + factList + "</ul>" : "");
}

function intakeUpdateFolder() {
  const attorney = intakeEl("attorney");
  const label = intakeEl("folderLabel");
  if (!label) return;
  const name = intakeText(attorney ? attorney.value : intakeState.attorney) || "[Attorney Name]";
  label.innerHTML = "FOLDER: <b>" + escapeHtml(name) + " Folder</b> -- routed from attorney info";
}

function intakeRenderPolice() {
  intakeRenderChips(intakeEl("policeFiles"), intakeState.policeSeed, function (id) {
    intakeState.policeSeed = intakeState.policeSeed.filter(function (file) { return file.id !== id; });
    intakeRenderPolice();
    intakePersist();
  });
}

function intakeRenderCore() {
  const root = intakeEl("coreUploads");
  if (!root) return;
  root.innerHTML = "";
  INTAKE_CORE.forEach(function (row) {
    const slot = intakeState.core[row.id];
    const wrap = document.createElement("div");
    wrap.className = "intake-upload-row";
    wrap.innerHTML = "<div><div class='intake-row-name'>" + escapeHtml(row.label) + "</div><div class='intake-chips' data-files></div></div>";
    intakeRenderChips(wrap.querySelector("[data-files]"), slot.files, function (id) {
      slot.files = slot.files.filter(function (file) { return file.id !== id; });
      intakeRenderCore();
      intakePersist();
    });
    const upload = document.createElement("button");
    upload.type = "button";
    upload.className = "button ghost";
    upload.innerHTML = icon("upload") + " Upload";
    const skip = document.createElement("button");
    skip.type = "button";
    skip.className = "button ghost";
    skip.textContent = slot.skipped ? "Skipped" : "Skip";
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "button danger";
    clear.textContent = "Clear";
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.className = "intake-hidden-input";
    upload.onclick = function () { input.click(); };
    skip.onclick = function () {
      slot.skipped = !slot.skipped;
      intakeRenderCore();
      intakePersist();
    };
    clear.onclick = function () {
      slot.files = [];
      slot.skipped = false;
      intakeRenderCore();
      intakePersist();
    };
    input.onchange = function () { intakeIngestFiles(input.files, row.id, "core"); input.value = ""; };
    wrap.appendChild(upload);
    wrap.appendChild(skip);
    wrap.appendChild(clear);
    wrap.appendChild(input);
    root.appendChild(wrap);
  });
}

function intakeRenderParties() {
  const root = intakeEl("parties");
  if (!root) return;
  root.innerHTML = "";
  INTAKE_PARTIES.forEach(function (row) {
    const slot = intakeState.parties[row.id];
    const card = document.createElement("div");
    card.className = "intake-party";
    card.innerHTML =
      "<h3>" + escapeHtml(row.label) + "</h3>" +
      "<div class='intake-party-hint'>" + escapeHtml(row.hint) + "</div>" +
      "<div class='intake-party-actions'></div>" +
      "<div class='intake-chips' data-files></div>";
    const actions = card.querySelector(".intake-party-actions");
    const filesEl = card.querySelector("[data-files]");
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.className = "intake-hidden-input";
    const upload = document.createElement("button");
    upload.type = "button";
    upload.className = "button ghost";
    upload.innerHTML = icon("upload") + " Upload Docs";
    upload.onclick = function () { input.click(); };
    const approve = document.createElement("button");
    approve.type = "button";
    approve.className = "button " + (slot.approved ? "primary" : "ghost");
    approve.textContent = slot.approved ? "Approved" : "Approve / Edit";
    approve.onclick = function () {
      slot.approved = !slot.approved;
      intakeRenderParties();
      intakePersist();
    };
    input.onchange = function () { intakeIngestFiles(input.files, row.id, "party"); input.value = ""; };
    actions.appendChild(upload);
    actions.appendChild(approve);
    if (row.id === "officers") {
      const search = document.createElement("input");
      search.className = "inline-input intake-post-search";
      search.placeholder = "POST Search Q";
      search.setAttribute("aria-label", "POST officer search");
      search.value = slot.search || "";
      search.oninput = function () { slot.search = search.value; intakePersist(); };
      actions.appendChild(search);
    }
    actions.appendChild(input);
    intakeRenderChips(filesEl, slot.files, function (id) {
      slot.files = slot.files.filter(function (file) { return file.id !== id; });
      intakeRenderParties();
      intakePersist();
    });
    root.appendChild(card);
  });
}

function intakeAiListFacts(data) {
  const facts = [];
  [
    ["people", "person"],
    ["charges", "charge"],
    ["evidence", "evidence"],
    ["timeline", "timeline"],
    ["contradictions", "contradiction"],
    ["missingInformation", "missing-information"]
  ].forEach(function (entry) {
    (Array.isArray(data && data[entry[0]]) ? data[entry[0]] : []).forEach(function (item) {
      const value = intakeText(item && (item.value || item.text || item));
      if (!value) return;
      facts.push({
        category: entry[1],
        text: value,
        sourceFile: intakeText(item.sourceFile),
        page: intakeText(item.page),
        confidence: Number.isFinite(Number(item.confidence)) ? Number(item.confidence) : null,
        status: intakeText(item.status) || "needs_review"
      });
    });
  });
  return facts;
}

function intakeApplyAiCaseInformation(data) {
  const info = data && data.caseInformation && typeof data.caseInformation === "object"
    ? data.caseInformation
    : {};
  const changed = [];
  const mappings = [
    ["docketNumber", "docket", "docket"],
    ["court", "court", "court"],
    ["subjectName", "defendant", "defendant"],
    ["clientName", "attorney", "attorney"],
    ["incidentDate", "incidentDate", "incident date"]
  ];
  mappings.forEach(function (mapping) {
    const proposed = intakeText(info[mapping[0]]);
    if (!proposed || intakeText(intakeState[mapping[1]])) return;
    intakeState[mapping[1]] = proposed;
    changed.push(mapping[2]);
  });
  intakeFillForm();
  return changed;
}

async function intakeRunGeminiChain(extractedText, meta) {
  if (!window.ARCProviders || typeof window.ARCProviders.caseChain !== "function") {
    return { changed: [], facts: [], skipped: true };
  }
  intakeNotify("Gemini is reviewing " + meta.name + " for structured autofill.");
  const response = await window.ARCProviders.caseChain({
    action: "extract_case_facts",
    caseId: intakeState.caseId,
    previousInteractionId: intakeText(intakeState.aiChain && intakeState.aiChain.interactionId),
    fileName: meta.name,
    category: meta.category,
    text: String(extractedText || "").slice(0, 120000)
  });
  const data = response && response.data ? response.data : {};
  const changed = intakeApplyAiCaseInformation(data);
  const facts = intakeAiListFacts(data);
  intakeState.aiChain = intakeState.aiChain || { interactionId: "", model: "", updatedAt: "", history: [] };
  intakeState.aiChain.interactionId = intakeText(response.interactionId);
  intakeState.aiChain.model = intakeText(response.model);
  intakeState.aiChain.updatedAt = new Date().toISOString();
  intakeState.aiChain.history = Array.isArray(intakeState.aiChain.history) ? intakeState.aiChain.history : [];
  intakeState.aiChain.history.push({
    interactionId: intakeState.aiChain.interactionId,
    fileId: meta.id,
    fileName: meta.name,
    action: "extract_case_facts",
    changedFields: changed.slice(),
    factCount: facts.length,
    at: intakeState.aiChain.updatedAt
  });
  intakeState.aiChain.history = intakeState.aiChain.history.slice(-50);
  return {
    changed: changed,
    facts: facts,
    data: data,
    executionTrace: Array.isArray(response.executionTrace) ? response.executionTrace : []
  };
}

async function intakeIngestFiles(fileList, key, kind) {
  const files = Array.prototype.slice.call(fileList || []);
  if (!files.length) return;
  const metas = [];
  let failed = 0;
  intakeNotify("Attaching " + files.length + " file(s). Keep this tab open.");
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const meta = intakeFileMeta(file, kind + ":" + key);
    try {
      try { meta.sha256 = await intakeSha256(file); } catch (hashError) { meta.sha256 = ""; }
      await intakePutBlob(meta, file);
      try {
        const extractedText = await intakeExtractTextFromFile(file, function (message) { intakeNotify(message); });
        const fields = intakeExtractCaseFields(extractedText, meta.category);
        const localFacts = intakeExtractionFacts(fields);
        const localChanged = intakeApplyExtractedFields(fields);
        let aiResult = { changed: [], facts: [], data: null, executionTrace: [] };
        try {
          aiResult = await intakeRunGeminiChain(extractedText, meta);
        } catch (aiError) {
          aiResult.error = aiError.message || "Gemini autofill failed";
        }
        const facts = localFacts.concat(aiResult.facts || []);
        const changed = Array.from(new Set(localChanged.concat(aiResult.changed || [])));
        meta.extraction = {
          status: facts.length ? "extracted" : "read-no-fields",
          textChars: extractedText.length,
          fields: fields,
          facts: facts,
          ai: aiResult.data ? {
            interactionId: intakeText(intakeState.aiChain && intakeState.aiChain.interactionId),
            model: intakeText(intakeState.aiChain && intakeState.aiChain.model),
            data: aiResult.data,
            executionTrace: aiResult.executionTrace || []
          } : null,
          aiError: aiResult.error || "",
          preview: extractedText.slice(0, 2500)
        };
        intakeState.extractions.push({
          id: meta.id,
          name: meta.name,
          category: meta.category,
          status: meta.extraction.status,
          textChars: meta.extraction.textChars,
          fields: fields,
          facts: facts,
          ai: meta.extraction.ai,
          aiError: meta.extraction.aiError,
          preview: meta.extraction.preview,
          extractedAt: new Date().toISOString()
        });
        await intakeMirrorSharedDocument(meta, extractedText, extractedText.trim() ? "READY" : "PARTIAL", "");
        if (changed.length) intakeNotify("Autofilled " + changed.join(", ") + " from " + file.name + ".");
        else if (aiResult.data) intakeNotify("Gemini review completed for " + file.name + "; proposed facts are marked for review.");
      } catch (extractError) {
        meta.extraction = {
          status: "stored-only",
          error: extractError.message || "Extraction failed"
        };
        intakeState.extractions.push({
          id: meta.id,
          name: meta.name,
          category: meta.category,
          status: "stored-only",
          error: meta.extraction.error,
          facts: [],
          extractedAt: new Date().toISOString()
        });
        await intakeMirrorSharedDocument(meta, "", "FAILED", meta.extraction.error);
      }
      metas.push(meta);
      intakeNotify("Attached " + (index + 1) + " of " + files.length + ": " + file.name);
      await new Promise(function (resolve) { setTimeout(resolve, 0); });
    } catch (error) {
      failed += 1;
    }
  }
  if (metas.length) {
    if (kind === "police") intakeState.policeSeed = intakeState.policeSeed.concat(metas);
    else if (kind === "core") {
      intakeState.core[key].skipped = false;
      intakeState.core[key].files = intakeState.core[key].files.concat(metas);
    } else if (kind === "party") {
      intakeState.parties[key].files = intakeState.parties[key].files.concat(metas);
    }
    intakeRenderAll();
    intakePersist();
  }
  if (failed) intakeNotify(metas.length + " attached; " + failed + " failed in this browser profile.", true);
  else intakeNotify(metas.length + " file(s) attached.");
}

function intakeReadForm() {
  const defendant = intakeEl("defendant");
  const docket = intakeEl("docket");
  const court = intakeEl("court");
  const attorney = intakeEl("attorney");
  if (defendant) intakeState.defendant = intakeText(defendant.value);
  if (docket) intakeState.docket = intakeText(docket.value);
  if (court) intakeState.court = intakeText(court.value);
  if (attorney) intakeState.attorney = intakeText(attorney.value);
}

function intakePersist() {
  intakeReadForm();
  try { localStorage.setItem(INTAKE_KEY, JSON.stringify(intakeState)); } catch (error) {}
}

function intakeLoadStored() {
  try {
    const raw = JSON.parse(localStorage.getItem(INTAKE_KEY) || "null");
    if (raw && typeof raw === "object") {
      intakeState = Object.assign(intakeBlank(), raw);
      intakeState.extractions = Array.isArray(raw.extractions) ? raw.extractions : [];
      intakeState.aiChain = Object.assign(intakeBlank().aiChain, raw.aiChain || {});
      intakeState.aiChain.history = Array.isArray(raw.aiChain && raw.aiChain.history) ? raw.aiChain.history : [];
      intakeState.core = Object.assign(intakeBlank().core, raw.core || {});
      intakeState.parties = Object.assign(intakeBlank().parties, raw.parties || {});
    }
  } catch (error) {}
}

function intakeFillForm() {
  const defendant = intakeEl("defendant");
  const docket = intakeEl("docket");
  const court = intakeEl("court");
  const attorney = intakeEl("attorney");
  if (defendant) defendant.value = intakeState.defendant || "";
  if (docket) docket.value = intakeState.docket || "";
  if (court) court.value = intakeState.court || "";
  if (attorney) attorney.value = intakeState.attorney || "";
}

function intakeLoad() {
  intakeLoadStored();
  intakeFillForm();
  intakeUpdateFolder();
  intakeRenderAll();
}

function intakeRenderAll() {
  intakeRenderPolice();
  intakeRenderCore();
  intakeRenderParties();
  intakeRenderExtractionSummary();
}

function intakeBuildCasePayload() {
  intakeReadForm();
  if (!intakeState.defendant && !intakeState.docket) {
    throw new Error("Enter at least a defendant name or docket number.");
  }
  const matter = intakeState.defendant ? ("Commonwealth v. " + intakeState.defendant) : intakeState.docket;
  // Canonical opaque case ID. The docket number is user data, never identity.
  if (!intakeState.caseId) { intakeState.caseId = intakeMakeCaseId(); intakePersist(); }
  const caseId = intakeState.caseId;
  const uploads = [];
  intakeState.policeSeed.forEach(function (file) { uploads.push(file); });
  INTAKE_CORE.forEach(function (row) {
    (intakeState.core[row.id].files || []).forEach(function (file) { uploads.push(file); });
  });
  INTAKE_PARTIES.forEach(function (row) {
    (intakeState.parties[row.id].files || []).forEach(function (file) { uploads.push(file); });
  });
  const totalBytes = uploads.reduce(function (sum, file) { return sum + Number(file.size || 0); }, 0);
  const summary = [
    "Intake generated " + new Date().toLocaleString(),
    "Attached files: " + uploads.length + " (" + formatBytes(totalBytes) + ")",
    "Extracted files: " + (intakeState.extractions || []).filter(function (row) { return row.status === "extracted"; }).length,
    "Detected facts: " + (intakeState.extractions || []).reduce(function (sum, row) { return sum + ((row.facts || []).length); }, 0),
    "Browser storage note: Case Setup stores attachment metadata, extracted field facts, and small text previews. Full long-form report drafting still belongs in Report Builder or the local ARC server workflow.",
    "Police seed files: " + intakeState.policeSeed.length,
    "Attorney folder: " + (intakeState.attorney || "n/a"),
    "Core uploads: " + INTAKE_CORE.map(function (row) {
      const slot = intakeState.core[row.id];
      return row.id + "=" + (slot.skipped ? "skipped" : slot.files.length);
    }).join(", "),
    "Parties: " + INTAKE_PARTIES.map(function (row) {
      const slot = intakeState.parties[row.id];
      return row.id + (slot.approved ? ":approved" : ":pending") + "(" + slot.files.length + ")";
    }).join(", ")
  ].join("\n");
  return {
    caseId: caseId,
    matter: matter,
    docket: intakeState.docket,
    court: intakeState.court,
    subjectName: intakeState.defendant,
    clientName: intakeState.defendant,
    attorney: intakeState.attorney,
    incidentDate: intakeState.incidentDate,
    status: "open",
    source: "case-intake-dashboard",
    notes: summary,
    uploadedFiles: uploads,
    intake: intakeState
  };
}


function intakeRegisterCase(saved) {
  const key = "arc_case_registry_v1";
  let registry = {version:1,cases:[],activeCaseId:"",updatedAt:new Date().toISOString()};
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "null");
    if (parsed && typeof parsed === "object") registry = Object.assign(registry, parsed);
  } catch (error) {}
  if (!Array.isArray(registry.cases)) registry.cases = [];
  const caseId = intakeText(saved && saved.caseId);
  if (!caseId) return;
  let row = registry.cases.find(function (item) { return intakeText(item.caseId) === caseId; });
  if (!row && saved.docket) {
    row = registry.cases.find(function (item) {
      return intakeText(item.docket).toLowerCase() === intakeText(saved.docket).toLowerCase();
    });
  }
  const next = {
    caseId: caseId,
    matter: intakeText(saved.matter),
    docket: intakeText(saved.docket),
    court: intakeText(saved.court),
    clientName: intakeText(saved.clientName),
    subjectName: intakeText(saved.subjectName),
    attorney: intakeText(saved.attorney),
    attorneyFirm: row ? intakeText(row.attorneyFirm) : "",
    investigator: intakeText(saved.investigator),
    charges: row ? intakeText(row.charges) : "",
    status: row && row.status === "closed" ? "closed" : "open",
    nextCourtDate: row ? intakeText(row.nextCourtDate) : "",
    nextCourtEvent: row ? intakeText(row.nextCourtEvent) : "",
    incidentDate: intakeText(saved.incidentDate),
    notes: intakeText(saved.notes),
    createdAt: row && row.createdAt ? row.createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    closedAt: row ? intakeText(row.closedAt) : "",
    closedBy: row ? intakeText(row.closedBy) : "",
    closeReason: row ? intakeText(row.closeReason) : ""
  };
  if (row) Object.assign(row, next, {caseId: row.caseId || caseId});
  else registry.cases.push(next);
  registry.activeCaseId = row ? row.caseId : caseId;
  registry.updatedAt = new Date().toISOString();
  try { localStorage.setItem(key, JSON.stringify(registry)); } catch (error) {}
}


function intakeAllUploadedMetas() {
  const uploads = [];
  intakeState.policeSeed.forEach(function (file) { uploads.push(file); });
  INTAKE_CORE.forEach(function (row) { (intakeState.core[row.id].files || []).forEach(function (file) { uploads.push(file); }); });
  INTAKE_PARTIES.forEach(function (row) { (intakeState.parties[row.id].files || []).forEach(function (file) { uploads.push(file); }); });
  const seen = new Set();
  return uploads.filter(function (file) { const id = intakeText(file && file.id); if (!id || seen.has(id)) return false; seen.add(id); return true; });
}

async function intakePromoteUploadsToServer(savedCase) {
  const caseId = intakeText(savedCase && savedCase.caseId);
  const uploads = intakeAllUploadedMetas();
  if (!uploads.length) return [];
  if (!window.ARCReportAssets || typeof window.ARCReportAssets.saveWithFile !== "function") {
    throw new Error("Secure case file storage is unavailable. The case was saved, but its uploaded documents were not committed to R2.");
  }
  const stored = [];
  for (let i = 0; i < uploads.length; i += 1) {
    const meta = uploads[i];
    intakeNotify("Securing case document " + (i + 1) + " of " + uploads.length + ": " + meta.name);
    const local = await intakeGetBlob(meta.id);
    if (!local || !local.blob) throw new Error("The local upload could not be reopened: " + meta.name);
    const assetId = "source_" + meta.id;
    const extraction = meta.extraction || {};
    const record = await window.ARCReportAssets.saveWithFile({
      id: assetId,
      caseId: caseId,
      type: "source-document",
      title: meta.name,
      description: "Case source document uploaded through New Matter Initiation.",
      source: "new-matter-initiation",
      status: "draft",
      selectedForFinal: false,
      sourceDocumentId: meta.id,
      documentCategory: meta.category || "",
      extractionStatus: extraction.status || "uploaded",
      extractionPreview: extraction.preview || "",
      originalSha256: meta.sha256 || "",
      origin: "new-matter-initiation"
    }, local.blob);
    meta.serverAssetId = record.id || assetId;
    meta.serverStored = true;
    if (window.ARCCaseDocuments && typeof window.ARCCaseDocuments.byCase === "function" && typeof window.ARCCaseDocuments.put === "function") {
      const docs = await window.ARCCaseDocuments.byCase(caseId);
      const existing = (docs || []).find(function (doc) { return doc.id === meta.id; });
      if (existing) {
        existing.serverAssetId = meta.serverAssetId;
        existing.serverStored = true;
        existing.sha256 = existing.sha256 || meta.sha256 || (record.file && record.file.sha256) || "";
        existing.processingStatus = existing.processingStatus || extraction.status || "";
        await window.ARCCaseDocuments.put(existing);
      } else {
        const extractionRow = (intakeState.extractions || []).find(function (row) { return row.id === meta.id; });
        await intakeMirrorSharedDocument(meta, extractionRow && extractionRow.preview || extraction.preview || "", extraction.status === "stored-only" ? "FAILED" : "READY", extraction.error || "");
      }
    }
    stored.push(record);
  }
  intakePersist();
  return stored;
}

async function intakeGenerate() {
  const generateButtons = [intakeEl("btnGenerate"), intakeEl("btnGenerateFooter")].filter(Boolean);
  generateButtons.forEach(function (button) { button.disabled = true; button.setAttribute("aria-busy", "true"); });
  try {
    const payload = intakeBuildCasePayload();
    if (!window.ARCUnified || (typeof window.ARCUnified.saveCaseAsync !== "function" && typeof window.ARCUnified.saveCase !== "function")) {
      throw new Error("Shared case bridge is not available.");
    }
    intakeSetStatus("Creating secure case record...");
    const saved = typeof window.ARCUnified.saveCaseAsync === "function"
      ? await window.ARCUnified.saveCaseAsync(payload)
      : window.ARCUnified.saveCase(payload);
    if (!saved || !saved.caseId) throw new Error("ARC created the case but did not return a valid case ID.");

    if (window.ARCCaseDocuments && typeof window.ARCCaseDocuments.setActiveCase === "function") {
      window.ARCCaseDocuments.setActiveCase({
        caseId: saved.caseId,
        caseName: saved.matter,
        caseNo: saved.docket,
        court: saved.court,
        clientName: saved.clientName,
        subjectName: saved.subjectName,
        investigator: saved.investigator
      });
    }

    intakeRegisterCase(saved);
    intakePersist();
    await intakePromoteUploadsToServer(saved);

    // Re-save the complete case after R2 promotion so the central case record
    // carries the server asset IDs for every uploaded source.
    const promotedPayload = intakeBuildCasePayload();
    promotedPayload.uploadedFiles = intakeAllUploadedMetas();
    const finalSaved = typeof window.ARCUnified.saveCaseAsync === "function"
      ? await window.ARCUnified.saveCaseAsync(Object.assign({}, saved, promotedPayload, { caseId: saved.caseId }))
      : window.ARCUnified.saveCase(Object.assign({}, saved, promotedPayload, { caseId: saved.caseId }));

    intakeRegisterCase(finalSaved || saved);
    intakeSetStatus("Active case generated: " + (saved.matter || saved.docket) + " · documents secured · shared to all modules");
    intakeSetShellMeta("Active: " + (saved.matter || "case") + (saved.docket ? " · " + saved.docket : ""));
    if (window.parent !== window) {
      try {
        window.parent.postMessage({ type: "ARC_INTAKE_GENERATED", case: finalSaved || saved }, ((location.protocol === "http:" || location.protocol === "https:") ? location.origin : "*"));
        window.parent.postMessage({ type: "ARC_MODULE_READY", title: document.title }, ((location.protocol === "http:" || location.protocol === "https:") ? location.origin : "*"));
      } catch (error) {}
    }
    intakeNotify("Case saved. All intake documents are secured. Opening Notebook.");
    if (window.parent === window) {
      location.href = "../../arc-notebook.html?case=" + encodeURIComponent(saved.caseId) +
        "&mode=new&returnTo=" + encodeURIComponent("cases/index.html");
    }
  } catch (error) {
    intakeNotify(error.message || "Generate failed.", true);
    intakeSetStatus("Initiate Case failed: " + (error.message || "Unknown error"));
  } finally {
    generateButtons.forEach(function (button) { button.disabled = false; button.removeAttribute("aria-busy"); });
  }
}

// In-page confirmation dialog. The native window-level confirm dialog blocks
// and can freeze inside the module iframe, so it must never be used here.
function intakeShowConfirm(message, onConfirm) {
  const existing = document.getElementById("arcConfirmOverlay");
  if (existing) existing.remove();
  const overlay = document.createElement("div");
  overlay.id = "arcConfirmOverlay";
  overlay.className = "modal-backdrop";
  overlay.style.zIndex = "200";
  const box = document.createElement("section");
  box.className = "modal";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  const body = document.createElement("div");
  body.className = "modal-body";
  const paragraph = document.createElement("p");
  paragraph.style.margin = "0 0 16px";
  paragraph.textContent = message;
  const row = document.createElement("div");
  row.className = "button-row";
  row.style.justifyContent = "flex-end";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "button ghost";
  cancel.textContent = "Cancel";
  cancel.onclick = function () { overlay.remove(); };
  const ok = document.createElement("button");
  ok.type = "button";
  ok.className = "button primary";
  ok.textContent = "Start New Case";
  ok.onclick = function () { overlay.remove(); onConfirm(); };
  row.appendChild(cancel);
  row.appendChild(ok);
  body.appendChild(paragraph);
  body.appendChild(row);
  box.appendChild(body);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  ok.focus();
}

function intakeHasUnsavedData() {
  intakeReadForm();
  if (intakeState.defendant || intakeState.docket || intakeState.court || intakeState.attorney) return true;
  if (intakeState.policeSeed.length || (intakeState.extractions || []).length) return true;
  if (INTAKE_CORE.some(function (row) {
    const slot = intakeState.core[row.id];
    return slot && (slot.skipped || (slot.files || []).length);
  })) return true;
  if (INTAKE_PARTIES.some(function (row) {
    const slot = intakeState.parties[row.id];
    return slot && (slot.approved || (slot.files || []).length || intakeText(slot.search));
  })) return true;
  return false;
}

function intakeStartNewCase() {
  // Atomic reset: clear intake storage, reset local state, and clear the
  // shared active-case pointer so no field, file, or fact leaks from the
  // prior case into the new one.
  try { localStorage.removeItem(INTAKE_KEY); } catch (error) {}
  intakeState = intakeBlank();
  if (window.ARCUnified && typeof window.ARCUnified.beginNewCase === "function") {
    const fresh = window.ARCUnified.beginNewCase();
    if (fresh && fresh.caseId) intakeState.caseId = fresh.caseId;
  }
  intakeFillForm();
  intakeUpdateFolder();
  intakeRenderAll();
  intakePersist();
  intakeSetStatus("New intake started.");
  intakeNotify("New case intake ready.");
}

// Another module (or this one) started a new case: drop every case-bound
// cache this page owns so nothing leaks between matters.
document.addEventListener("arc:case-new", (event) => {
  try { localStorage.removeItem(INTAKE_KEY); } catch (error) {}
  intakeState = intakeBlank();
  if (event && event.detail && event.detail.caseId) intakeState.caseId = event.detail.caseId;
  intakeFillForm();
  intakeUpdateFolder();
  intakeRenderAll();
});

document.addEventListener("arc:case-context", (event) => {
  const context = event.detail || {};
  const defendant = intakeEl("defendant");
  const docket = intakeEl("docket");
  const court = intakeEl("court");
  const attorney = intakeEl("attorney");
  if (!intakeState.defendant && (context.subjectName || context.matter) && defendant) {
    defendant.value = context.subjectName || String(context.matter || "").replace(/^Commonwealth v\.\s*/i, "");
  }
  if (!intakeState.docket && context.docket && docket) docket.value = context.docket;
  if (!intakeState.court && context.court && court) court.value = context.court;
  if (!intakeState.attorney && context.clientName && attorney) attorney.value = context.clientName;
  intakeUpdateFolder();
});

function renderIntake() {
  view.innerHTML = `
    <div class="view-shell">
      <div class="sr-only" id="shellMeta" aria-live="polite">${escapeHtml(intakeShellMessage)}</div>
      ${pageHeading(
        "System entry",
        "Case Intake",
        "Initialize new matters inside the ARC integrated system and establish the evidentiary chain at the point of origin.",
        `<button class="button ghost" id="btnNewCase" type="button">${icon("plus")} New Case</button>
         <button class="button navy" id="btnGenerate" type="button" aria-label="Generate Information and initiate case">${icon("spark")} Initiate Case</button>`
      )}

      <div class="details-grid">
        <div class="details-main">
          <section class="card">
            <div class="card-header">
              <div><h2>New Matter Initiation</h2><p>Formal dossier creation</p></div>
            </div>
            <div class="card-body">
              <div class="form-grid">
                <label class="field"><span>Case Reference ID</span><input id="docket" placeholder="e.g. 2026-INT-001"></label>
                <label class="field"><span>Court / Division</span><input id="court" placeholder="Court or jurisdiction"></label>
                <label class="field full"><span>Matter Title</span><input id="defendant" placeholder="Defendant or formal matter name"></label>
                <label class="field full"><span>Counsel / Client</span><input id="attorney" placeholder="Counsel of record or client name"></label>
              </div>

              <div style="margin-top:16px">
                <span class="field-label">Initial Statement of Facts</span>
                <label class="drop-zone" id="policeDrop" tabindex="0" role="button" aria-label="Upload the seed police report" style="margin-top:6px">
                  <input class="intake-hidden-input" id="policeInput" type="file" multiple accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.tif,.tiff">
                  <span>
                    ${icon("upload")}
                    <strong>Import the seed police report or initiating record</strong>
                    <small>PDF, DOCX, TXT, or image. Multiple files are supported.</small>
                  </span>
                </label>
                <div class="intake-chips" id="policeFiles"></div>
              </div>

              <div class="intake-folder" id="folderLabel">FOLDER: <b>[Attorney Name] Folder</b> - created when counsel information is entered</div>

              <div class="intake-footer">
                <span class="intake-status" id="statusLine">${escapeHtml(intakeStatusMessage)}</span>
                <button class="button navy" id="btnGenerateFooter" type="button" aria-label="Generate Information and initiate case">${icon("spark")} Initiate Case</button>
              </div>

              <div class="intake-extraction" id="extractionSummary">${escapeHtml(INTAKE_DEFAULT_EXTRACTION)}</div>
            </div>
          </section>

          <section class="card">
            <div class="card-header">
              <div><h2>Core Records</h2><p>Upload, skip, or clear each required record group.</p></div>
            </div>
            <div class="card-body" id="coreUploads"></div>
          </section>

          <section class="card">
            <div class="card-header">
              <div><h2>Parties Verification</h2><p>Approve parties and attach their supporting records.</p></div>
            </div>
            <div class="card-body"><div class="intake-parties-grid" id="parties"></div></div>
          </section>
        </div>

        <aside class="details-side">
          <section class="card">
            <div class="card-header">
              <div><h2>Current Workflow</h2><p>Intake sequence</p></div>
              <button class="icon-button small" id="btnRecent" type="button" title="Jump to Core Records">${icon("chevron")}</button>
            </div>
            <div class="intake-workflow-row"><span class="intake-ref">01</span><h3>Identity and scope</h3><p>Set the matter, docket, court, and responsible counsel.</p></div>
            <div class="intake-workflow-row"><span class="intake-ref">02</span><h3>Seed evidence</h3><p>Attach the initiating report and preserve the source record.</p></div>
            <div class="intake-workflow-row"><span class="intake-ref">03</span><h3>Case synchronization</h3><p>Share the verified context with every ARC module.</p></div>
          </section>

          <section class="card">
            <div class="card-header"><div><h2>Rapid Actions</h2><p>Bulk source import</p></div></div>
            <div class="card-body">
              <button class="button ghost full" id="btnQuickUpload" type="button">${icon("upload")} Bulk Import</button>
            </div>
          </section>

          <div class="info-banner">
            ${icon("shield")}
            <div><strong>Secure environment</strong><br>Case activity is retained in the local audit trail for review and export. Attached records stay in this browser until report generation is initiated.</div>
          </div>
        </aside>
      </div>
    </div>
  `;
  intakeMountView();
}

function intakeMountView() {
  intakeFillForm();
  intakeUpdateFolder();
  intakeRenderAll();

  const newCaseButton = intakeEl("btnNewCase");
  if (newCaseButton) {
    newCaseButton.onclick = function () {
      // Confirmation is required only when unsaved data exists -- a browser
      // Back button is not an undo mechanism for localStorage mutation.
      if (!intakeHasUnsavedData()) return intakeStartNewCase();
      intakeShowConfirm(
        "Clear intake fields and start a new case package? The current intake data will be removed.",
        intakeStartNewCase
      );
    };
  }

  const drop = intakeEl("policeDrop");
  const policeInput = intakeEl("policeInput");
  if (drop && policeInput) {
    drop.onkeydown = function (event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        policeInput.click();
      }
    };
    ["dragenter", "dragover"].forEach(function (type) {
      drop.addEventListener(type, function (event) { event.preventDefault(); drop.classList.add("dragover"); });
    });
    ["dragleave", "drop"].forEach(function (type) {
      drop.addEventListener(type, function (event) {
        event.preventDefault();
        drop.classList.remove("dragover");
        if (type === "drop") intakeIngestFiles(event.dataTransfer.files, "police", "police");
      });
    });
    policeInput.onchange = function () { intakeIngestFiles(policeInput.files, "police", "police"); policeInput.value = ""; };
  }

  ["defendant", "docket", "court", "attorney"].forEach(function (id) {
    const field = intakeEl(id);
    if (!field) return;
    field.addEventListener("input", function () {
      intakeUpdateFolder();
      intakePersist();
    });
  });

  const generateButton = intakeEl("btnGenerate");
  if (generateButton) generateButton.onclick = intakeGenerate;
  const generateFooter = intakeEl("btnGenerateFooter");
  if (generateFooter) generateFooter.onclick = intakeGenerate;
  const quickUpload = intakeEl("btnQuickUpload");
  if (quickUpload && policeInput) quickUpload.onclick = function () { policeInput.click(); };
  const recent = intakeEl("btnRecent");
  if (recent) {
    recent.onclick = function () {
      const target = intakeEl("coreUploads");
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    };
  }
}
/* ===== End ARC Case Intake ===== */


/* ------------------------------------------------------------------ exports
   The block above was extracted verbatim from an inline <script> in the Report
   Generator, where top-level declarations landed on window automatically. As a
   separate .js file loaded the same way they still do, but these explicit
   assignments make the contract the intake page depends on visible rather than
   implicit. */
window.intakeLoad = intakeLoad;
window.renderIntake = renderIntake;
window.intakeMountView = intakeMountView;
window.intakeState = intakeState;
