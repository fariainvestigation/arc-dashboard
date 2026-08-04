(function () {
  "use strict";

  const PAYLOAD_KEY = "arc_final_attorney_report_payload_v1";
  const TEMPLATE_URL = "19_Final_Client_Report.html";

  function text(value, maxLength) {
    const output = String(value == null ? "" : value).trim();
    return maxLength ? output.slice(0, maxLength) : output;
  }

  function list(value) {
    return Array.isArray(value) ? value : [];
  }

  function safeDate(value) {
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? date.toISOString() : "";
  }

  function dateOnly(value) {
    return safeDate(value).slice(0, 10);
  }

  function stripHtml(value) {
    const source = text(value);
    if (!source) return "";
    if (typeof DOMParser !== "undefined") {
      const documentValue = new DOMParser().parseFromString(source, "text/html");
      return text(documentValue.body && documentValue.body.textContent).replace(/\s+/g, " ");
    }
    return source.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }

  function joinText(values, separator) {
    return list(values).map(function (value) {
      if (typeof value === "string") return text(value);
      return text(value && (value.title || value.description || value.item || value.reason));
    }).filter(Boolean).join(separator || "\n\n");
  }

  function verificationStatus(value) {
    const token = text(value).toLowerCase();
    if (/conflict|disput|reject/.test(token)) return "Disputed";
    if (/corroborat/.test(token)) return "Corroborated";
    if (/verified|approved|included|supported|complete/.test(token)) return "Verified";
    if (/report|selected|pending|open/.test(token)) return "Reported";
    return "Unverified";
  }

  function exactCase(record, caseId) {
    if (!record || typeof record !== "object") return false;
    const recordCaseId = text(record.caseId || record.caseContext && record.caseContext.caseId);
    return Boolean(caseId && recordCaseId && recordCaseId === caseId);
  }

  function caseField(report, pattern, fallback) {
    const match = list(report && report.caseInformation).find(function (item) {
      return pattern.test(text(item && item.label));
    });
    return text(match && match.value || fallback);
  }

  function recordWithCase(caseId, value) {
    return Object.assign({ caseId: caseId }, value);
  }

  function sourceId(prefix, index) {
    return prefix + "-" + String(index + 1).padStart(3, "0");
  }

  function fileExtent(documentValue) {
    const size = Number(documentValue && documentValue.size || 0);
    if (!size) return "";
    if (size < 1024) return size + " bytes";
    if (size < 1024 * 1024) return Math.round(size / 1024) + " KB";
    return (size / 1024 / 1024).toFixed(1) + " MB";
  }

  function dataUrl(blob) {
    return new Promise(function (resolve) {
      if (!blob || typeof FileReader === "undefined") return resolve("");
      const reader = new FileReader();
      reader.onload = function () { resolve(text(reader.result)); };
      reader.onerror = function () { resolve(""); };
      reader.readAsDataURL(blob);
    });
  }

  async function selectedMedia(caseId, media) {
    const output = [];
    const selected = list(media).filter(function (item) {
      return exactCase(item, caseId) && item.include === true;
    }).sort(function (left, right) {
      return Number(left.order || 0) - Number(right.order || 0);
    }).slice(0, 40);
    for (let index = 0; index < selected.length; index += 1) {
      const item = selected[index];
      const src = await dataUrl(item.blob);
      if (!src) continue;
      output.push(recordWithCase(caseId, {
        id: text(item.id) || sourceId("MEDIA", index),
        exhibit: "Figure " + (output.length + 1),
        title: text(item.caption || item.sourceLocation || item.sourceName) || "Included case image",
        caption: text(item.caption || item.sourceLocation),
        source: text(item.sourceName),
        citation: [item.sourceName, item.sourceLocation, item.timestamp].map(function (value) { return text(value); }).filter(Boolean).join(" | "),
        src: src,
        status: "Verified",
        approved: true
      }));
    }
    return output;
  }

  async function approvedAssets(caseId) {
    if (!window.ARCReportAssets) return [];
    let records = [];
    try {
      records = typeof window.ARCReportAssets.list === "function"
        ? await window.ARCReportAssets.list()
        : window.ARCReportAssets.listLocal();
    } catch (error) {
      records = typeof window.ARCReportAssets.listLocal === "function"
        ? window.ARCReportAssets.listLocal()
        : [];
    }
    return list(records).filter(function (item) {
      return exactCase(item, caseId) && item.selectedForFinal === true && ["approved", "included"].includes(text(item.status).toLowerCase());
    }).sort(function (left, right) {
      return Number(left.reportOrder || 0) - Number(right.reportOrder || 0);
    });
  }

  function approvedReports(caseId) {
    if (!window.ARCUnified || typeof window.ARCUnified.getReports !== "function") return [];
    return list(window.ARCUnified.getReports()).filter(function (item) {
      return exactCase(item, caseId) && text(item.reviewStatus).toLowerCase() === "approved";
    });
  }

  function assetFileUrl(asset) {
    if (!window.ARCReportAssets || typeof window.ARCReportAssets.fileUrl !== "function") return "";
    return text(window.ARCReportAssets.fileUrl(asset));
  }

  async function pictureAssets(caseId, assets, startIndex) {
    const pictures = [];
    const records = assets.filter(function (asset) { return asset.type === "picture"; });
    for (let index = 0; index < records.length; index += 1) {
      const asset = records[index];
      const url = assetFileUrl(asset);
      let src = "";
      if (url && location.protocol !== "file:") {
        try {
          const response = await fetch(url, { cache: "no-store" });
          if (response.ok) src = await dataUrl(await response.blob());
        } catch (error) {}
      }
      pictures.push(recordWithCase(caseId, {
        id: text(asset.id) || sourceId("PHOTO", index),
        exhibit: text(asset.exhibitNumber) || "Figure " + (startIndex + index + 1),
        title: text(asset.title) || "Approved photograph",
        caption: text(asset.caption || asset.description),
        source: text(asset.source),
        citation: text(asset.citation),
        src: src,
        status: "Verified",
        approved: true
      }));
    }
    return pictures;
  }

  function parseTimestampRows(value, explanation, caseId) {
    const rows = text(value).split(/\r?\n/).map(function (row) { return text(row); }).filter(Boolean);
    if (!rows.length && !text(explanation)) return [];
    return (rows.length ? rows : [""]).map(function (row) {
      const match = row.match(/^([^\s-]+)\s*[-:]\s*(.*)$/);
      return recordWithCase(caseId, {
        time: text(match && match[1] || row),
        explanation: text(match && match[2] || explanation),
        links: ""
      });
    });
  }

  function buildPayloadSkeleton(caseItem, caseId) {
    const report = caseItem.report || {};
    const generatedAt = safeDate(caseItem.reportMeta && caseItem.reportMeta.generatedAt || caseItem.updatedAt || new Date());
    const findings = list(report.findingsSections);
    const conflicts = list(report.materialConflicts);
    const verification = list(report.verificationItems);
    return {
      schema: "arc-final-attorney-report",
      schemaVersion: 1,
      meta: {
        caseId: caseId,
        caseName: text(caseItem.caseName),
        client: text(caseItem.clientName),
        docket: text(caseItem.docketNumber),
        court: text(caseItem.court),
        leadInvestigator: text(caseItem.investigator),
        version: "Revision 1",
        revision: 1,
        parentRevision: null,
        generatedAt: generatedAt,
        updatedAt: safeDate(caseItem.updatedAt || generatedAt),
        verificationStatus: caseItem.reportFinalized ? "Verified" : "Unverified"
      },
      executive: {
        summary: joinText(report.executiveSummary),
        keyFindings: findings.map(function (item) {
          return [text(item.heading), joinText(item.paragraphs, " ")].filter(Boolean).join(": ");
        }).filter(Boolean),
        defenseIssues: conflicts.map(function (item) { return text(item.significance || item.issue); }).filter(Boolean),
        evidentiaryRisks: verification.map(function (item) { return text(item.reason); }).filter(Boolean),
        missingMaterials: verification.map(function (item) { return text(item.item); }).filter(Boolean),
        attorneyActions: list(report.recommendedActions).map(function (value) { return text(value); }).filter(Boolean),
        upcomingDates: []
      },
      scope: {
        assignment: text(caseItem.notes),
        questionsPresented: "",
        period: [dateOnly(caseItem.createdAt), dateOnly(caseItem.updatedAt)].filter(Boolean).join(" through "),
        cutoff: dateOnly(caseItem.updatedAt),
        materials: []
      },
      caseInfo: {
        incidentDate: text(caseItem.incidentDate || caseField(report, /incident\s+date/i)),
        incidentLocation: caseField(report, /incident\s+location|location\s+of\s+incident/i),
        charges: [],
        proceduralStatus: []
      },
      parties: [],
      methodology: { methods: list(report.methodology).map(function (value) { return text(value); }).filter(Boolean), limitations: [], verificationItems: [] },
      investigatorReport: { assignment: text(caseItem.notes), activity: "", findings: "", limitations: "" },
      interviews: [], transcripts: [], timeline: [], publicRecords: [], followUp: [],
      evidence: [], photos: [], videos: [], digitalLocation: [], forensics: [],
      evidenceAnalysis: [], contradictions: [], discoveryGaps: [],
      defenseAssessment: { supportive: "", adverse: "", unresolved: "", assessment: joinText(report.conclusion) },
      unresolved: [], legalResearch: [], legalIssues: [], motionRecommendations: [], fullMotions: [],
      visualExhibits: [], sources: [], documents: [], appendices: [],
      certification: {
        investigatorLanguage: "I reviewed this report for completeness, case identity, source traceability, and inclusion of only approved attorney-facing material.",
        approved: false,
        approvedBy: "",
        approvedAt: ""
      }
    };
  }

  async function buildPayload(caseItem, options) {
    options = options && typeof options === "object" ? options : {};
    if (!caseItem || typeof caseItem !== "object") throw new Error("An active ARC case is required.");
    const caseId = text(caseItem.id);
    if (!caseId) throw new Error("The active case does not have a case ID.");

    const report = caseItem.report || {};
    const payload = buildPayloadSkeleton(caseItem, caseId);
    const documents = list(caseItem.documents);
    const runtimeDocuments = list(options.documents).filter(function (item) { return exactCase(item, caseId); });
    const runtimeById = new Map(runtimeDocuments.map(function (item) { return [text(item.id), item]; }));
    const reports = approvedReports(caseId);
    const assets = await approvedAssets(caseId);

    payload.scope.materials = documents.map(function (item, index) {
      const runtime = runtimeById.get(text(item.id)) || item;
      return recordWithCase(caseId, {
        id: sourceId("MAT", index), title: text(item.name), received: dateOnly(item.addedAt),
        extent: fileExtent(runtime), source: "Active ARC case", status: "Verified"
      });
    });

    payload.caseInfo.charges = list(report.charges).map(function (item) {
      return recordWithCase(caseId, {
        title: text(item.offense || item.count), statute: text(item.statute), level: text(item.count), status: text(item.dispositionOrStatus)
      });
    });

    payload.parties = list(report.people).map(function (item, index) {
      return recordWithCase(caseId, {
        id: sourceId("PARTY", index), name: text(item.name), role: text(item.role),
        identifiers: [item.dateOfBirth && "DOB: " + item.dateOfBirth, item.address, item.phone].map(function (value) { return text(value); }).filter(Boolean).join(" | "),
        statementStatus: text(item.importantQuote) ? "Statement included" : "No approved statement included",
        status: verificationStatus(item.verificationStatus), sources: text(item.source)
      });
    });

    payload.interviews = list(report.people).filter(function (item) { return text(item.importantQuote); }).map(function (item, index) {
      return recordWithCase(caseId, {
        id: sourceId("INT", index), person: text(item.name), role: text(item.role), date: "", locationFormat: "Attributed statement",
        summary: text(item.importantQuote), sourceMedia: text(item.source), status: verificationStatus(item.verificationStatus)
      });
    });

    payload.methodology.limitations = list(report.verificationItems).map(function (item) { return text(item.reason); }).filter(Boolean);
    payload.methodology.verificationItems = list(report.verificationItems).map(function (item) {
      return recordWithCase(caseId, { title: text(item.item), status: "Unverified", source: text(item.requiredSource || item.reason) });
    });

    payload.investigatorReport.activity = reports.filter(function (item) {
      return !/legal|motion/i.test([item.title, item.reportType, item.source].map(function (value) { return text(value); }).join(" "));
    }).map(function (item) {
      return text(item.title) + "\n" + text(item.text || stripHtml(item.html));
    }).filter(Boolean).join("\n\n");
    payload.investigatorReport.findings = list(report.findingsSections).map(function (item) {
      return [text(item.heading), joinText(item.paragraphs, " ")].filter(Boolean).join("\n");
    }).filter(Boolean).join("\n\n");
    payload.investigatorReport.limitations = payload.methodology.limitations.join("\n");

    payload.timeline = list(report.timeline).map(function (item, index) {
      return recordWithCase(caseId, {
        id: sourceId("EVENT", index), date: text(item.date), time: text(item.time), timezone: "", title: text(item.event),
        description: text(item.conflict), source: text(item.source), confidence: text(item.confidence),
        status: verificationStatus(item.confidence), conflict: Boolean(text(item.conflict)), links: ""
      });
    });

    payload.followUp = list(report.recommendedActions).map(function (action) {
      return recordWithCase(caseId, { action: text(action), reason: "Recommended in the approved case report", due: "", status: "Reported", relevance: "Counsel review", source: text(report.reportTitle) });
    });

    payload.evidence = list(report.evidence).map(function (item, index) {
      return recordWithCase(caseId, {
        id: sourceId("EVID", index), exhibit: text(item.item), title: text(item.item), description: text(item.description),
        type: "Case evidence", source: text(item.source), collectionDate: "", custodian: text(item.collectionOrCustody),
        fileId: "", sha256: "", custodyStatus: text(item.collectionOrCustody), status: "Reported", included: true,
        relatedParties: "", relatedEvents: "", citations: text(item.source), motions: "", custodyEvents: []
      });
    });

    payload.evidenceAnalysis = list(report.findingsSections).map(function (item, index) {
      return recordWithCase(caseId, {
        id: sourceId("FIND", index), classification: "Investigator Analysis", finding: [text(item.heading), joinText(item.paragraphs, " ")].filter(Boolean).join(": "),
        supporting: list(item.supportingSources).map(function (value) { return text(value); }).filter(Boolean).join(" | "), conflicting: "", citations: list(item.supportingSources).map(function (value) { return text(value); }).filter(Boolean).join(" | "), status: "Reported"
      });
    });

    payload.contradictions = list(report.materialConflicts).map(function (item, index) {
      return recordWithCase(caseId, {
        id: sourceId("CON", index), claimA: text(item.sourceA), claimB: text(item.sourceB), explanation: text(item.issue),
        materiality: text(item.significance), significance: text(item.significance), status: "Disputed"
      });
    });

    payload.discoveryGaps = list(report.verificationItems).map(function (item, index) {
      return recordWithCase(caseId, {
        id: sourceId("GAP", index), expected: text(item.requiredSource || item.item), basis: text(item.reason), produced: "",
        missing: text(item.item), significance: text(item.reason), followUp: text(item.requiredSource), status: "Unverified"
      });
    });

    payload.unresolved = list(report.verificationItems).map(function (item, index) {
      return recordWithCase(caseId, {
        id: sourceId("WARN", index), type: "Verification", issue: text(item.item), materiality: text(item.reason),
        required: text(item.requiredSource), links: "", status: "Unverified"
      });
    });

    payload.defenseAssessment.supportive = list(report.findingsSections).map(function (item) { return joinText(item.paragraphs, " "); }).filter(Boolean).join("\n\n");
    payload.defenseAssessment.adverse = list(report.materialConflicts).map(function (item) { return text(item.significance); }).filter(Boolean).join("\n");
    payload.defenseAssessment.unresolved = list(report.verificationItems).map(function (item) { return text(item.item) + ": " + text(item.reason); }).filter(Boolean).join("\n");

    payload.legalIssues = list(report.charges).map(function (item) {
      return recordWithCase(caseId, {
        charge: text(item.offense), element: text(item.statute), prosecutionEvidence: "", defenseEvidence: "", contested: text(item.dispositionOrStatus),
        sources: text(item.source), assessment: ""
      });
    });

    reports.filter(function (item) { return /legal/i.test([item.title, item.reportType, item.source].map(function (value) { return text(value); }).join(" ")); }).forEach(function (item, index) {
      payload.legalResearch.push(recordWithCase(caseId, {
        id: text(item.id) || sourceId("AUTH", index), jurisdiction: text(caseItem.court), authority: text(item.title), citation: "",
        issue: text(item.reportType), holding: "", application: text(item.text || stripHtml(item.html)), sourceLink: "", status: "Verified"
      }));
    });

    const selectedPictures = await selectedMedia(caseId, options.media);
    const assetPictures = await pictureAssets(caseId, assets, selectedPictures.length);
    payload.photos = selectedPictures.concat(assetPictures).filter(function (item) { return item.src; });
    payload.visualExhibits = payload.photos.map(function (item) { return Object.assign({}, item); });

    assets.filter(function (asset) { return asset.type === "video"; }).forEach(function (asset) {
      payload.videos.push(recordWithCase(caseId, {
        id: text(asset.id), fileName: text(asset.file && asset.file.name || asset.title), duration: text(asset.duration),
        description: text(asset.explanation || asset.description), source: text(asset.source), status: "Verified",
        timestamps: parseTimestampRows(asset.timestamps, asset.explanation, caseId), stills: []
      }));
    });

    assets.filter(function (asset) { return asset.type === "transcript" || asset.type === "translation"; }).forEach(function (asset, index) {
      const translation = asset.type === "translation";
      payload.transcripts.push(recordWithCase(caseId, {
        id: text(asset.id) || sourceId("TR", index), title: text(asset.title), sourceMedia: text(asset.source),
        language: text(asset.originalLanguage), method: text(asset.translationMethod), translator: "", status: "Verified",
        excerpts: [recordWithCase(caseId, {
          speaker: text(asset.speakers), timestamp: text(asset.timestamps), original: text(translation ? asset.originalText : asset.bodyText),
          translation: text(translation ? asset.translatedText : ""), correction: "", citation: text(asset.citation)
        })]
      }));
    });

    assets.filter(function (asset) { return asset.type === "motion"; }).forEach(function (asset) {
      payload.fullMotions.push(recordWithCase(caseId, {
        id: text(asset.id), title: text(asset.title), body: text(asset.bodyText || asset.description), status: "Verified"
      }));
    });

    payload.sources = list(report.sourceIndex).map(function (item, index) {
      return recordWithCase(caseId, {
        id: sourceId("SRC", index), title: text(item.source), locator: "", producer: text(item.description), received: text(item.date),
        sha256: "", usedIn: "Structured ARC report", status: "Verified"
      });
    });
    reports.forEach(function (item, index) {
      payload.sources.push(recordWithCase(caseId, {
        id: "REPORT-" + String(index + 1).padStart(3, "0"), title: text(item.title), locator: text(item.id),
        producer: text(item.source), received: dateOnly(item.updatedAt || item.createdAt), sha256: "", usedIn: "Approved module report", status: "Verified"
      }));
    });
    assets.forEach(function (item, index) {
      payload.sources.push(recordWithCase(caseId, {
        id: "ASSET-" + String(index + 1).padStart(3, "0"), title: text(item.title), locator: text(item.citation),
        producer: text(item.source), received: dateOnly(item.updatedAt || item.createdAt), sha256: text(item.file && item.file.sha256), usedIn: text(item.type), status: "Verified"
      }));
    });

    payload.documents = documents.map(function (item, index) {
      return recordWithCase(caseId, {
        id: sourceId("DOC", index), title: text(item.name), category: text(item.type), date: dateOnly(item.addedAt),
        source: "Active ARC case", version: "Source material", status: "Verified", included: true, href: ""
      });
    }).concat(assets.map(function (item, index) {
      return recordWithCase(caseId, {
        id: "ASSET-" + String(index + 1).padStart(3, "0"), title: text(item.title), category: text(item.type),
        date: dateOnly(item.updatedAt), source: text(item.source), version: "Approved selection", status: "Verified", included: true, href: ""
      });
    }));

    payload.generatedFrom = {
      caseId: caseId,
      builderUpdatedAt: safeDate(caseItem.updatedAt),
      approvedReportIds: reports.map(function (item) { return text(item.id); }),
      approvedAssetIds: assets.map(function (item) { return text(item.id); })
    };
    return payload;
  }

  function savePayload(payload) {
    if (!payload || !payload.meta || !text(payload.meta.caseId)) throw new Error("The final report payload does not contain a case ID.");
    localStorage.setItem(PAYLOAD_KEY, JSON.stringify(payload));
    return payload;
  }

  async function openReport(caseItem, options) {
    const target = window.open("about:blank", "_blank");
    if (target) {
      target.document.write("<!doctype html><title>Preparing ARC report</title><body style='font:16px system-ui;padding:32px'>Preparing the case-scoped attorney report...</body>");
      target.document.close();
    }
    try {
      const payload = savePayload(await buildPayload(caseItem, options));
      const deliverPayload = function (event) {
        if (event.source !== target || event.data && event.data.type !== "ARC_FINAL_REPORT_READY") return;
        if (text(event.data && event.data.caseId) !== text(payload.meta.caseId)) return;
        target.postMessage({ type: "ARC_FINAL_REPORT_PAYLOAD", payload: payload }, "*");
        window.removeEventListener("message", deliverPayload);
      };
      if (target) {
        window.addEventListener("message", deliverPayload);
        setTimeout(function () { window.removeEventListener("message", deliverPayload); }, 30000);
      }
      const url = TEMPLATE_URL + "?caseId=" + encodeURIComponent(payload.meta.caseId) + "&revision=" + encodeURIComponent(payload.meta.revision || 1);
      if (target) target.location.replace(url);
      else location.href = url;
      return payload;
    } catch (error) {
      if (target) target.close();
      throw error;
    }
  }

  window.ARCFinalReport = {
    PAYLOAD_KEY: PAYLOAD_KEY,
    TEMPLATE_URL: TEMPLATE_URL,
    buildPayload: buildPayload,
    savePayload: savePayload,
    open: openReport
  };
})();
