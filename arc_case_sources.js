/**
 * ARC case source text.
 *
 * Rebuilds the full text of every report uploaded at intake, so the Initial
 * Case Analysis has something real to analyse.
 *
 * Why this exists: intake extracts text, sends it to the Gemini autofill chain,
 * and then keeps only `preview: extractedText.slice(0, 2500)`. That is about
 * the first page of a police report. Everything after is discarded. Analysing
 * that would produce a confident-looking analysis of page one and silently miss
 * the rest of the case, which is worse than producing nothing.
 *
 * The original files survive in the arc_case_intake_db IndexedDB store, so this
 * re-extracts from the blobs. That also matches the source hierarchy in the
 * directive, which puts the original uploaded document above extracted text.
 *
 * Extraction ladder per document:
 *   1. Native text (pdf.js for PDF, mammoth for DOCX, direct read for text)
 *   2. Google Document AI OCR when native extraction yields nothing usable,
 *      which is the normal case for scanned discovery
 *   3. Otherwise the document is reported UNREADABLE and is not analysed
 *
 * Page markers matter. The analysis endpoint validates every page citation
 * against the "[Page N]" markers present in the text it was sent, and strips
 * citations it cannot support. Both pdf.js and the OCR path emit them. DOCX and
 * plain text have no page concept, so those documents carry no page citations
 * at all rather than invented ones.
 */
(function (global) {
  "use strict";
  function arcCaseSourcesAsset(name) {
    try {
      var scripts = document.getElementsByTagName("script");
      for (var i = scripts.length - 1; i >= 0; i -= 1) {
        var src = scripts[i].src || "";
        if (/arc_case_sources\.js(?:[?#].*)?$/i.test(src)) return new URL("libs/" + name, new URL(".", src)).href;
      }
    } catch (error) {}
    return "libs/" + name;
  }


  var DB_NAME = "arc_case_intake_db";
  var DB_VERSION = 1;
  var PDFJS = arcCaseSourcesAsset("pdf.min.js");
  var PDFJS_WORKER = arcCaseSourcesAsset("pdf.worker.min.js");
  var MAMMOTH = arcCaseSourcesAsset("mammoth.browser.min.js");

  // Document AI accepts up to 30 MB per request on this deployment.
  var OCR_MAX_BYTES = 30 * 1024 * 1024;
  var MIN_USABLE_CHARS = 40;

  var loaded = {};

  function loadScript(url) {
    if (loaded[url]) return loaded[url];
    loaded[url] = new Promise(function (resolve, reject) {
      var tag = document.createElement("script");
      tag.src = url;
      tag.async = true;
      tag.onload = function () { resolve(); };
      tag.onerror = function () { reject(new Error("Could not load " + url)); };
      document.head.appendChild(tag);
    });
    return loaded[url];
  }

  function openDb() {
    return new Promise(function (resolve, reject) {
      var request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function () {
        var db = request.result;
        // Store name and keyPath must match cases/arc_case_intake.js exactly.
        // It writes { id, meta, blob } into a store called "files"; opening the
        // same database with a different schema would upgrade it out from under
        // intake and orphan every uploaded file.
        if (!db.objectStoreNames.contains("files")) db.createObjectStore("files", { keyPath: "id" });
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error("IndexedDB unavailable")); };
    });
  }

  function readBlob(db, id) {
    return new Promise(function (resolve) {
      var tx;
      try { tx = db.transaction("files", "readonly"); }
      catch (error) { return resolve(null); }
      var request = tx.objectStore("files").get(id);
      request.onsuccess = function () { resolve(request.result || null); };
      request.onerror = function () { resolve(null); };
    });
  }

  /* ------------------------------------------------------ native extraction */

  async function textFromPdf(file, onProgress) {
    await loadScript(PDFJS);
    global.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    var data = new Uint8Array(await file.arrayBuffer());
    var pdf = await global.pdfjsLib.getDocument({ data: data }).promise;
    var pages = [];
    var limitations = [];
    // No page cap here. The intake autofill path stops at 80 pages because it
    // only needs enough to fill a form; an analysis that silently ignored page
    // 81 onward of a discovery packet would be actively misleading. Volume is
    // handled by the character budget on the server, which reports truncation.
    for (var n = 1; n <= pdf.numPages; n += 1) {
      if (onProgress) onProgress("Reading " + file.name + ", page " + n + " of " + pdf.numPages);
      var page = await pdf.getPage(n);
      var content = await page.getTextContent();
      var lines = [];
      var current = null;
      var lastY = null;
      (content.items || []).forEach(function (item) {
        var y = item.transform ? Math.round(item.transform[5]) : null;
        if (lastY === null || Math.abs(y - lastY) > 2) {
          if (current !== null) lines.push(current);
          current = "";
          lastY = y;
        }
        current += item.str || "";
      });
      if (current !== null) lines.push(current);
      pages.push("[Page " + n + "]\n" + lines.join("\n").trim());
      if (page.cleanup) page.cleanup();
    }
    var text = pages.join("\n\n");
    if (text.replace(/\[Page \d+\]/g, "").trim().length < MIN_USABLE_CHARS) {
      limitations.push("No embedded text layer; the file appears to be a scan.");
    }
    return { text: text, pageCount: pdf.numPages, limitations: limitations };
  }

  async function textFromDocx(file) {
    await loadScript(MAMMOTH);
    var result = await global.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return {
      text: result.value || "",
      pageCount: null,
      // Stated plainly so the absent page citations downstream are understood
      // as honest rather than missing.
      limitations: ["Word documents have no fixed pages, so facts from this document carry no page citation."]
    };
  }

  async function textFromPlain(file) {
    return { text: await file.text(), pageCount: null, limitations: ["Plain text file; no page citations available."] };
  }

  /* ------------------------------------------------------------------- OCR */

  function toBase64(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result).split(",")[1] || ""); };
      reader.onerror = function () { reject(new Error("Could not read the file for OCR.")); };
      reader.readAsDataURL(blob);
    });
  }

  async function ocr(file, onProgress) {
    if (file.size > OCR_MAX_BYTES) {
      throw new Error("File is " + Math.round(file.size / 1048576) + " MB, over the 30 MB OCR limit.");
    }
    if (onProgress) onProgress("Running OCR on " + file.name + ". This can take a minute.");
    var response = await fetch("/api/ocr/document-ai", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-ARC-Case-ID": (window.ARCAPI && window.ARCAPI.caseId ? window.ARCAPI.caseId() : (window.ARCLink && window.ARCLink.activeCaseId ? window.ARCLink.activeCaseId() : "")) },
      body: JSON.stringify({
        fileName: file.name,
        mimeType: file.type || "application/pdf",
        base64: await toBase64(file)
      })
    });
    if (!response.ok) {
      var message = response.status === 503
        ? "Document AI OCR is not configured on this ARC server."
        : "OCR failed (" + response.status + ").";
      throw new Error(message);
    }
    var payload = await response.json();
    var result = payload && payload.ocr ? payload.ocr : {};
    var pages = Array.isArray(result.pages) ? result.pages : [];
    // Rebuild with the same [Page N] markers the PDF path uses so citation
    // validation works identically for scanned and native documents.
    var text = pages.length
      ? pages.map(function (page, index) {
          return "[Page " + (page.pageNumber || index + 1) + "]\n" + String(page.text || "").trim();
        }).join("\n\n")
      : String(result.text || "");
    return {
      text: text,
      pageCount: result.pageCount || pages.length || null,
      limitations: ["Text recovered by OCR; wording may contain recognition errors."]
    };
  }

  /* --------------------------------------------------------------- gather */

  function classify(name, category) {
    var lower = String(name || "").toLowerCase();
    if (category === "masscourt" || /docket/.test(lower)) return "Court docket";
    if (category === "police_app" || /police|incident|arrest|narrative/.test(lower)) return "Police report";
    if (category === "discovery" || /discovery/.test(lower)) return "Discovery";
    if (category === "investigator" || /investigat/.test(lower)) return "Investigator report";
    if (category === "media" || /news|media|article/.test(lower)) return "Media or news";
    // The directive is explicit: do not guess the document type.
    return "UNCLASSIFIED REPORT";
  }

  async function extractOne(record, onProgress) {
    var file = record.blob;
    var name = String(record.name || file.name || "document");
    var type = String((file && file.type) || "").toLowerCase();
    var lower = name.toLowerCase();

    var out = null;
    var limitations = [];

    try {
      if (type === "application/pdf" || /\.pdf$/.test(lower)) {
        out = await textFromPdf(file, onProgress);
      } else if (/\.docx$/.test(lower) || type.indexOf("officedocument.wordprocessingml") >= 0) {
        out = await textFromDocx(file);
      } else if (type.indexOf("text/") === 0 || /\.(txt|md|csv|json|html?|xml)$/.test(lower)) {
        out = await textFromPlain(file);
      }
    } catch (error) {
      limitations.push("Native extraction failed: " + (error.message || "unknown error"));
    }

    var body = out ? out.text.replace(/\[Page \d+\]/g, "").trim() : "";
    var needsOcr = !out || body.length < MIN_USABLE_CHARS;

    if (needsOcr) {
      var ocrable = type.indexOf("image/") === 0
        || /\.(png|jpe?g|tiff?|bmp|gif|webp)$/.test(lower)
        || type === "application/pdf"
        || /\.pdf$/.test(lower);
      if (ocrable) {
        try {
          var recovered = await ocr(file, onProgress);
          if (recovered.text.replace(/\[Page \d+\]/g, "").trim().length >= MIN_USABLE_CHARS) {
            return {
              documentId: record.id,
              fileName: name,
              documentType: classify(name, record.category),
              pageCount: recovered.pageCount,
              extractionStatus: "OCR REQUIRED",
              limitations: limitations.concat(out ? out.limitations : []).concat(recovered.limitations),
              text: recovered.text
            };
          }
          limitations.push("OCR returned no usable text.");
        } catch (error) {
          limitations.push(error.message || "OCR failed.");
        }
      } else {
        limitations.push("File type cannot be read as text and is not supported for OCR.");
      }
    }

    if (!out || body.length < MIN_USABLE_CHARS) {
      return {
        documentId: record.id,
        fileName: name,
        documentType: classify(name, record.category),
        pageCount: out ? out.pageCount : null,
        extractionStatus: "UNREADABLE",
        limitations: limitations,
        text: ""
      };
    }

    return {
      documentId: record.id,
      fileName: name,
      documentType: classify(name, record.category),
      pageCount: out.pageCount,
      extractionStatus: out.limitations.length ? "PARTIAL" : "READY",
      limitations: limitations.concat(out.limitations),
      text: out.text
    };
  }

  /**
   * Every uploaded source document for the active case, with full text.
   * Returns { documents, usable, unreadable } so the caller can show what was
   * and was not analysed rather than quietly dropping failures.
   */
  async function gather(caseId, onProgress) {
    var metas = [];
    try {
      var stored = JSON.parse(localStorage.getItem("arc_case_intake_package_v1") || "null");
      if (stored) {
        // intakeState shape: policeSeed is a flat array of file metas; core and
        // parties are objects keyed by slot id, each holding { skipped, files }.
        // Reading them as arrays of metas silently returned nothing, which
        // presented as "no reports uploaded" on a case that had five.
        if (Array.isArray(stored.policeSeed)) metas = metas.concat(stored.policeSeed);
        ["core", "parties"].forEach(function (key) {
          var group = stored[key];
          if (!group || typeof group !== "object") return;
          Object.keys(group).forEach(function (slot) {
            var entry = group[slot];
            if (entry && Array.isArray(entry.files)) metas = metas.concat(entry.files);
            else if (Array.isArray(entry)) metas = metas.concat(entry);
          });
        });
      }
    } catch (error) { /* nothing stored */ }

    var db = null;
    try { db = await openDb(); } catch (error) { db = null; }

    var documents = [];
    for (var i = 0; i < metas.length; i += 1) {
      var meta = metas[i];
      if (!meta || !meta.id) continue;
      var record = db ? await readBlob(db, meta.id) : null;
      if (!record || !record.blob) {
        documents.push({
          documentId: meta.id,
          fileName: String(meta.name || "document"),
          documentType: classify(meta.name, meta.category),
          pageCount: null,
          extractionStatus: "UNREADABLE",
          limitations: ["The stored file could not be found in this browser."],
          text: ""
        });
        continue;
      }
      if (onProgress) onProgress("Processing " + (i + 1) + " of " + metas.length + ": " + (meta.name || "document"));
      documents.push(await extractOne({
        id: meta.id,
        name: meta.name,
        category: meta.category,
        blob: record.blob
      }, onProgress));
    }

    return {
      documents: documents,
      usable: documents.filter(function (d) { return d.extractionStatus !== "UNREADABLE"; }),
      unreadable: documents.filter(function (d) { return d.extractionStatus === "UNREADABLE"; })
    };
  }

  global.ARCCaseSources = { gather: gather, extractOne: extractOne };
})(window);
