/*!
 * arc_final_report_writer.js - Claude drafts the final investigation report.
 *
 * This is the second of the two places ARC lets a model write a document a human
 * will file or send. It runs on Claude through the gateway; nothing here holds a
 * key and nothing here can choose a different provider.
 *
 * The rule that makes this safe is the same one the Motion module uses: the model
 * writes ONLY from approved, source-cited material, and every sentence it writes
 * carries the source tag it came from. It cannot add a fact. If the approved set
 * is empty, it refuses rather than producing plausible narrative.
 *
 * The output is a DRAFT. The investigator edits it, then locks it, and the PDF,
 * attorney HTML, and offline ZIP all render from the locked text. Nothing is
 * regenerated per output format.
 */
(function (global) {
  "use strict";

  /* Section order for a Massachusetts defense investigation report. Each entry
     states what the section may contain, which becomes part of the instruction
     so the model does not drift between sections. */
  var SECTIONS = [
    ["summary", "Executive Summary",
     "What the investigation was asked to determine and what the approved record shows. No conclusions the sources do not support."],
    ["assignment", "Assignment and Scope",
     "Who assigned the investigation, what was requested, and what was excluded."],
    ["background", "Case Background",
     "The charge, the date, and the procedural posture. Facts only."],
    ["investigation", "Investigative Activity",
     "What was done, in order, with dates. Interviews, site visits, records requests, forensic review."],
    ["evidence", "Evidence Reviewed",
     "Each item examined and what it showed. Neutral description, not argument."],
    ["findings", "Findings",
     "Approved findings only, each tied to its source. A finding not in the approved set may not appear."],
    ["discrepancies", "Discrepancies and Open Questions",
     "Conflicts between sources and what remains unresolved. State them plainly without resolving them."],
    ["conclusion", "Conclusion",
     "A restrained close. No advocacy, no prediction of outcome, no legal conclusion."]
  ];

  var SYSTEM = [
    "You are drafting a criminal defense investigation report for a Massachusetts",
    "CPCS-registered investigator. The report will be read by defense counsel and may",
    "be produced in litigation.",
    "",
    "Absolute rules:",
    "1. Write only from the APPROVED RECORD supplied below. You may not add a fact,",
    "   a date, a name, a quantity, or an inference that is not in it.",
    "2. Every sentence that states a fact must end with a source tag. Use [FACT:id] for",
    "   approved facts/findings and [CASE:key] for verified case metadata supplied in",
    "   the CASE block. A factual sentence you cannot tag does not belong in the report.",
    "3. You are not an advocate. Describe what the record shows. Do not argue, do not",
    "   characterize the Commonwealth's case, and do not predict any outcome.",
    "4. Do not state legal conclusions. Whether something violates a statute or a",
    "   regulation is counsel's judgment, not yours.",
    "5. If the approved record does not support a section, write exactly:",
    "   'The approved record does not contain material for this section.'",
    "   Do not fill it with generalities.",
    "6. Never describe a finding as proving, establishing, or confirming anything.",
    "   Say what the record shows.",
    "",
    "Return JSON only, no prose around it, no markdown fences:",
    '{"sections":{"<key>":"<text>"},"unsupported":["<key>"],"notes":"<what the record could not support>"}'
  ].join("\n");

  function text(v) { return String(v == null ? "" : v).trim(); }

  /** The approved record, rendered for the model. Nothing untagged gets in. */
  function buildRecord(facts, findings, caseCtx) {
    var lines = [];
    var c = caseCtx || {};

    lines.push("CASE (verified case metadata)");
    ["caseName", "matter", "clientName", "docket", "court", "county", "charges", "incidentDate", "investigator", "attorney"]
      .forEach(function (k) { if (text(c[k])) lines.push("  [CASE:" + k + "] " + k + ": " + text(c[k])); });

    lines.push("", "APPROVED FACTS");
    if (!facts.length) {
      lines.push("  (none)");
    } else {
      facts.forEach(function (f) {
        lines.push("  [FACT:" + f.id + "] " + text(f.text));
        lines.push("      source: " + text(f.source));
        if (text(f.approvedBy)) lines.push("      approved by: " + text(f.approvedBy));
      });
    }

    lines.push("", "APPROVED FINDINGS");
    if (!findings.length) {
      lines.push("  (none)");
    } else {
      findings.forEach(function (f) {
        lines.push("  [FACT:" + f.id + "] " + text(f.text));
        lines.push("      source: " + text(f.source));
      });
    }
    return lines.join("\n");
  }

  function buildPrompt(record, sectionKeys) {
    var wanted = SECTIONS.filter(function (s) {
      return !sectionKeys || sectionKeys.indexOf(s[0]) !== -1;
    });
    var spec = wanted.map(function (s) {
      return '  "' + s[0] + '"  ' + s[1] + ": " + s[2];
    }).join("\n");

    return [
      "APPROVED RECORD",
      "===============",
      record,
      "",
      "SECTIONS TO WRITE",
      "=================",
      spec,
      "",
      "Write each section from the approved record above. Tag every factual sentence",
      "with its [FACT:id] or [CASE:key]. List in `unsupported` any section key the record could not",
      "support. Return the JSON object described in your instructions."
    ].join("\n");
  }

  /** Every source tag the model emitted must exist in the approved record. */
  function findInventedTags(sections, approvedIds, caseKeys) {
    var bad = {};
    var allowedCase = caseKeys || [];
    Object.keys(sections).forEach(function (key) {
      var body = String(sections[key] || ""), m;
      var re = /\[FACT:([^\]]+)\]/g;
      while ((m = re.exec(body)) !== null) if (approvedIds.indexOf(m[1]) === -1) bad["FACT:" + m[1]] = true;
      re = /\[CASE:([^\]]+)\]/g;
      while ((m = re.exec(body)) !== null) if (allowedCase.indexOf(m[1]) === -1) bad["CASE:" + m[1]] = true;
    });
    return Object.keys(bad);
  }

  /* Deterministic support sanity check. A real source ID is not enough if the
     sentence changes a number/date or introduces a new proper name. This check
     does not decide truth; it flags high-risk mismatches for human review. */
  function findSupportWarnings(sections, sourceMap, caseCtx) {
    var out = [], c = caseCtx || {};
    var common = {The:1,A:1,An:1,This:1,That:1,According:1,Case:1,Court:1,Commonwealth:1,Defendant:1,Investigation:1,Report:1,Officer:1,Police:1,Approved:1,Record:1};
    function nums(v){ return String(v||"").match(/\b\d+(?:[.:/-]\d+)*\b/g) || []; }
    function names(v){ return (String(v||"").match(/\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})*\b/g) || []).filter(function(x){ return !common[x]; }); }
    Object.keys(sections).forEach(function(k){
      String(sections[k]||"").split(/(?<=[.!?])\s+/).forEach(function(sentence){
        var tags=[].concat(Array.from(sentence.matchAll(/\[FACT:([^\]]+)\]/g))).map(function(m){return m[1]});
        tags.forEach(function(fid){
          var src=sourceMap[fid]; if(!src)return;
          var clean=sentence.replace(/\[(?:FACT|CASE):[^\]]+\]/g,"");
          nums(clean).forEach(function(n){ if(String(src).indexOf(n)===-1) out.push(k+': number/date "'+n+'" is not present in [FACT:'+fid+']'); });
          names(clean).forEach(function(n){ if(String(src).toLowerCase().indexOf(n.toLowerCase())===-1) out.push(k+': name/term "'+n+'" is not present in [FACT:'+fid+']'); });
        });
        Array.from(sentence.matchAll(/\[CASE:([^\]]+)\]/g)).forEach(function(m){ var key=m[1], val=text(c[key]); if(!val)return; nums(sentence).forEach(function(n){if(val.indexOf(n)===-1 && /\d/.test(val)) out.push(k+': case metadata number "'+n+'" does not match [CASE:'+key+']');}); });
      });
    });
    return Array.from(new Set(out)).slice(0,40);
  }

  /** Factual paragraphs with no tag at all. The refusal line is exempt. */
  function findUntaggedParagraphs(sections) {
    var out = [];
    var REFUSAL = "The approved record does not contain material for this section.";
    Object.keys(sections).forEach(function (key) {
      String(sections[key] || "").split(/\n{2,}/).forEach(function (para, i) {
        var p = para.trim();
        if (!p || p === REFUSAL) return;
        if (p.length < 40) return;                  // headings and short labels
        if (p.indexOf("[FACT:") === -1 && p.indexOf("[CASE:") === -1) out.push(key + " paragraph " + (i + 1));
      });
    });
    return out;
  }

  /**
   * draft({ caseId, caseContext, sections })
   * Resolves to { sections, unsupported, notes, warnings }.
   * Rejects when there is nothing approved to write from.
   */
  function draft(options) {
    var opts = options || {};
    var caseId = text(opts.caseId) || (global.ARCLink && global.ARCLink.activeCaseId());
    if (!caseId) return Promise.reject(new Error("No active ARC case. Open a case before drafting the report."));

    var bridge = global.ARCBridge;
    if (!bridge) return Promise.reject(new Error("The ARC case bridge is not loaded. Load arc_case_link.js first."));

    var facts = bridge.getApprovedFacts(caseId) || [];
    var findings = bridge.getApprovedFindings(caseId) || [];

    if (!facts.length && !findings.length) {
      return Promise.reject(new Error(
        "Nothing in this case has been approved yet. Approve findings and source-cited records before drafting the report, " +
        "because the writer is only permitted to use approved material."
      ));
    }

    var caseCtx = opts.caseContext ||
      (global.ARCLink ? global.ARCLink.get(caseId) : null) ||
      bridge.getActiveCase() || {};

    var record = buildRecord(facts, findings, caseCtx);
    var approvedIds = facts.map(function (f) { return String(f.id); })
                           .concat(findings.map(function (f) { return String(f.id); }));
    var caseKeys = ["caseName","matter","clientName","docket","court","county","charges","incidentDate","investigator","attorney"].filter(function(k){return text(caseCtx[k]);});
    var sourceMap = {}; facts.concat(findings).forEach(function(f){ sourceMap[String(f.id)] = text(f.text); });

    return global.ARCAI.run("report.final.draft", {
      system: SYSTEM,
      prompt: buildPrompt(record, opts.sections || null),
      maxTokens: 12000,
      caseId: caseId
    }, { caseId: caseId, signal: opts.signal }).then(function (raw) {
      var parsed;
      try {
        parsed = JSON.parse(String(raw).replace(/^```(?:json)?|```$/g, "").trim());
      } catch (e) {
        throw new Error("The report writer returned malformed output. Nothing was staged. Rerun the draft.");
      }
      var sections = parsed.sections || {};
      var warnings = [];

      var invented = findInventedTags(sections, approvedIds, caseKeys);
      if (invented.length) {
        /* A tag pointing at nothing means the model reached outside the record.
           The whole draft is discarded; a partial one is more dangerous than none. */
        throw new Error(
          "The draft cited material that is not in the approved record (" + invented.join(", ") + "). " +
          "It was discarded. Rerun the draft."
        );
      }

      var supportWarnings = findSupportWarnings(sections, sourceMap, caseCtx);
      if (supportWarnings.length) warnings.push("Source-support review required: " + supportWarnings.join(" | "));

      var untagged = findUntaggedParagraphs(sections);
      if (untagged.length) {
        warnings.push(untagged.length + " paragraph(s) carry no source tag and need review before locking: " + untagged.join(", "));
      }
      if ((parsed.unsupported || []).length) {
        warnings.push("The approved record could not support: " + parsed.unsupported.join(", "));
      }

      return {
        caseId: caseId,
        sections: sections,
        unsupported: parsed.unsupported || [],
        notes: text(parsed.notes),
        warnings: warnings,
        approvedFactCount: facts.length,
        approvedFindingCount: findings.length,
        generatedAt: new Date().toISOString(),
        provider: "claude"
      };
    });
  }

  /** Rewrite one section against the same approved record. Same rules apply. */
  function revise(options) {
    var opts = options || {};
    var key = text(opts.section);
    var def = SECTIONS.filter(function (s) { return s[0] === key; })[0];
    if (!def) return Promise.reject(new Error('Unknown report section "' + key + '".'));
    if (!text(opts.instruction)) return Promise.reject(new Error("Say what to change about this section."));

    var caseId = text(opts.caseId) || (global.ARCLink && global.ARCLink.activeCaseId());
    var facts = global.ARCBridge.getApprovedFacts(caseId) || [];
    var findings = global.ARCBridge.getApprovedFindings(caseId) || [];
    var caseCtx = global.ARCLink ? global.ARCLink.get(caseId) : {};
    var record = buildRecord(facts, findings, caseCtx);
    var approvedIds = facts.concat(findings).map(function (f) { return String(f.id); });
    var caseKeys = ["caseName","matter","clientName","docket","court","county","charges","incidentDate","investigator","attorney"].filter(function(k){return text(caseCtx[k]);});

    var prompt = [
      "APPROVED RECORD", "===============", record, "",
      "CURRENT SECTION (" + def[1] + ")", "================",
      text(opts.current) || "(empty)", "",
      "REQUESTED CHANGE", "================", text(opts.instruction), "",
      "Rewrite this section only. " + def[2],
      'Return JSON only: {"sections":{"' + key + '":"<text>"},"unsupported":[],"notes":""}'
    ].join("\n");

    return global.ARCAI.run("report.final.revise", {
      system: SYSTEM, prompt: prompt, maxTokens: 4000, caseId: caseId
    }, { caseId: caseId, signal: opts.signal }).then(function (raw) {
      var parsed;
      try { parsed = JSON.parse(String(raw).replace(/^```(?:json)?|```$/g, "").trim()); }
      catch (e) { throw new Error("The revision returned malformed output. The section was left unchanged."); }

      var sections = parsed.sections || {};
      var invented = findInventedTags(sections, approvedIds, caseKeys);
      if (invented.length) {
        throw new Error("The revision cited material outside the approved record (" + invented.join(", ") + "). The section was left unchanged.");
      }
      return { section: key, text: text(sections[key]), notes: text(parsed.notes) };
    });
  }

  global.ARCFinalReport = {
    draft: draft,
    revise: revise,
    sections: SECTIONS.map(function (s) { return { key: s[0], label: s[1], scope: s[2] }; }),
    _buildRecord: buildRecord,
    _findInventedTags: findInventedTags,
    _findUntaggedParagraphs: findUntaggedParagraphs,
    _findSupportWarnings: findSupportWarnings
  };

})(typeof window !== "undefined" ? window : globalThis);
