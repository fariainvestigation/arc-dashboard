/* ARC Timeline Discrepancy Visualizer, autofill adapter v1
   Reads the ARC case store on the same origin and returns a
   canonical arc.timeline.discrepancy object.

   Same origin is the requirement. Once index.html, modules/ and
   tools/ are all served from arcdefensereport.com, this tool reads
   the active case directly and no file handoff is needed. The JSON
   import path stays as a fallback for offline use.

   Conventions kept: IIFE, no globals beyond ARC_TDV, no hardcoded
   keys, no network calls, additive only.
*/
(function (root) {
  'use strict';

  var STORE_PREFIX = 'ARC_REPORT_';
  var ACTIVE_CASE_KEY = 'ARC_ACTIVE_CASE';
  var CASE_INDEX_KEY = 'ARC_CASE_INDEX_V1';

  /* Default uncertainty in seconds by how the time was produced.
     These are assumptions, not measurements, and every one of them
     is surfaced in the report so nothing is hidden from opposing
     counsel or from counsel. Override per source in the case store. */
  var DEFAULT_UNCERTAINTY = {
    machineExact: 2,
    machineMetadata: 30,
    machineTimecode: 120,
    dispatchLog: 60,
    recalled: 300,
    unknown: 300
  };

  function readJson(key, fallback) {
    try {
      var raw = root.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (err) {
      return fallback;
    }
  }

  function objectValue(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function listValue(value) {
    return Array.isArray(value) ? value.filter(function (item) {
      return item && typeof item === 'object' && !Array.isArray(item);
    }) : [];
  }

  function activeCaseId() {
    try {
      var explicit = root.localStorage.getItem(ACTIVE_CASE_KEY) || '';
      if (explicit) return explicit;
      var index = readJson(CASE_INDEX_KEY, []);
      if (!Array.isArray(index) || !index.length) return '';
      index = index.filter(function (row) { return row && row.caseId && !row.closed; });
      index.sort(function (a, b) {
        return String(b.updated || '').localeCompare(String(a.updated || ''));
      });
      return (index[0] && index[0].caseId) || '';
    } catch (err) {
      return '';
    }
  }

  /* Wall clock string to minutes since midnight. Accepts HH:MM and
     HH:MM:SS. Returns null on anything else rather than guessing,
     because a silently wrong time is worse than a visible gap. */
  function toMinutes(t) {
    if (typeof t !== 'string') return null;
    var m = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!m) return null;
    var h = parseInt(m[1], 10);
    var min = parseInt(m[2], 10);
    var s = m[3] ? parseInt(m[3], 10) : 0;
    if (h > 23 || min > 59 || s > 59) return null;
    return h * 60 + min + s / 60;
  }

  function classifyOrigin(origin) {
    var o = String(origin || '').toLowerCase();
    if (o.indexOf('timecode') !== -1) return 'machineTimecode';
    if (o.indexOf('metadata') !== -1) return 'machineMetadata';
    if (o.indexOf('printout') !== -1 || o.indexOf('instrument') !== -1) return 'machineExact';
    if (o.indexOf('cad') !== -1 || o.indexOf('dispatch') !== -1) return 'dispatchLog';
    if (o.indexOf('after shift') !== -1 || o.indexOf('narrative') !== -1 || o.indexOf('report') !== -1) return 'recalled';
    return 'unknown';
  }

  function buildSource(raw) {
    raw = objectValue(raw);
    var bucket = classifyOrigin(raw.timeOrigin || raw.origin);
    var kind = bucket === 'recalled' || bucket === 'unknown' ? 'recalled' : 'machine';
    return {
      id: raw.id,
      label: raw.label || raw.name || raw.id,
      kind: kind,
      timeOrigin: raw.timeOrigin || raw.origin || 'Unspecified',
      clock: {
        driftKnown: !!raw.driftKnown,
        driftSeconds: Number(raw.driftSeconds) || 0,
        uncertaintySeconds: Number(raw.uncertaintySeconds) || DEFAULT_UNCERTAINTY[bucket],
        uncertaintyBasis: raw.uncertaintyBasis ||
          (raw.driftKnown
            ? 'Drift measured against a reference.'
            : 'Clock not verified against a reference. Band is an assumption, not a measurement.'),
        syncRecordRequested: !!raw.syncRecordRequested,
        syncRecordReceived: !!raw.syncRecordReceived
      },
      document: {
        title: (raw.document && raw.document.title) || raw.label || '',
        bates: (raw.document && raw.document.bates) || raw.bates || '',
        sha256: (raw.document && raw.document.sha256) || raw.sha256 || '',
        custodian: (raw.document && raw.document.custodian) || raw.custodian || ''
      },
      limits: raw.limits || ''
    };
  }

  function buildEvent(raw) {
    raw = objectValue(raw);
    var precision = raw.precision;
    if (!precision) {
      precision = /^\d{1,2}:\d{2}:\d{2}$/.test(raw.time || '') ? 'exact' : 'approximate';
    }
    return {
      id: raw.id,
      sourceId: raw.sourceId || raw.source,
      time: raw.time,
      minutes: toMinutes(raw.time),
      precision: precision,
      statedAs: raw.statedAs || raw.time,
      what: raw.what || raw.description || '',
      quote: raw.quote || '',
      locator: {
        document: (raw.locator && raw.locator.document) || '',
        bates: (raw.locator && raw.locator.bates) || '',
        page: (raw.locator && raw.locator.page) || null,
        line: (raw.locator && raw.locator.line) || null,
        mediaOffset: (raw.locator && raw.locator.mediaOffset) || null
      },
      verifiable: raw.verifiable !== false,
      tags: raw.tags || []
    };
  }

  /* A gap between two events is only as solid as the two clocks that
     produced them. Combined uncertainty is added, not averaged, since
     the errors can run in opposite directions. */
  function assessGap(evA, evB, srcMap) {
    var a = evA.minutes;
    var b = evB.minutes;
    if (a === null || b === null) return null;
    var nominal = Math.abs(b - a);
    var uA = ((srcMap[evA.sourceId] || {}).clock || {}).uncertaintySeconds || 0;
    var uB = ((srcMap[evB.sourceId] || {}).clock || {}).uncertaintySeconds || 0;
    var band = (uA + uB) / 60;
    var worst = Math.max(0, nominal - band);
    return {
      nominalMinutes: Math.round(nominal * 10) / 10,
      worstCaseMinutes: Math.round(worst * 10) / 10,
      bestCaseMinutes: Math.round((nominal + band) * 10) / 10,
      survivesUncertainty: worst > 0,
      survivesNote: worst > 0
        ? 'The gap holds even at the outer edge of the stated clock uncertainty.'
        : 'At the stated uncertainty bands the gap could close. It holds only if clock synchronization is established.'
    };
  }

  function load(caseId) {
    var id = caseId || activeCaseId();
    if (!id) return null;
    var store = readJson(STORE_PREFIX + id, null);
    if (!store) return null;

    store = objectValue(store);
    var sources = listValue(store.sources || store.timelineSources).map(buildSource);
    var srcMap = {};
    sources.forEach(function (s) { srcMap[s.id] = s; });

    var events = listValue(store.timeline || store.masterTimeline || store.events)
      .map(buildEvent)
      .filter(function (e) { return e.minutes !== null && e.sourceId; })
      .sort(function (x, y) { return x.minutes - y.minutes; });

    var conflicts = listValue(store.conflicts).map(function (c) {
      var pair = (c.eventIds || []).map(function (eid) {
        return events.filter(function (e) { return e.id === eid; })[0];
      }).filter(Boolean);
      var out = {
        id: c.id,
        label: c.label || '',
        plain: c.plain || '',
        eventIds: c.eventIds || [],
        unrecorded: !!c.unrecorded,
        gap: null
      };
      if (pair.length === 2) out.gap = assessGap(pair[0], pair[1], srcMap);
      return out;
    });

    return {
      _schema: 'arc.timeline.discrepancy',
      _version: 1,
      case: objectValue(store.caseHeader || store.meta),
      sources: sources,
      events: events,
      conflicts: conflicts,
      intervals: listValue(store.intervals),
      findings: listValue(store.findings),
      motions: listValue(store.motions),
      motionsRejected: listValue(store.motionsRejected),
      crossExam: listValue(store.crossExam),
      integrity: {
        generatedAt: new Date().toISOString(),
        toolVersion: '1.0',
        inputHashes: sources.map(function (s) {
          return { source: s.id, sha256: s.document.sha256 };
        }),
        chainNote: 'Hashes carried forward from the Report Builder chain of custody.'
      }
    };
  }

  /* What the case store is missing, stated plainly. The tool renders
     this rather than filling gaps with plausible looking defaults. */
  function audit(model) {
    var missing = [];
    if (!model || typeof model !== 'object') return ['No active case found in the store.'];
    listValue(model.sources).forEach(function (s) {
      if (!s.document.bates) missing.push('No Bates number for ' + s.label);
      if (!s.document.sha256) missing.push('No file hash for ' + s.label);
      if (s.kind === 'machine' && !s.clock.driftKnown) {
        missing.push('Clock drift unverified for ' + s.label);
      }
    });
    listValue(model.events).forEach(function (e) {
      if (!e.locator.document) missing.push('No document locator for event ' + e.id);
    });
    return missing;
  }

  root.ARC_TDV = { load: load, audit: audit, toMinutes: toMinutes, DEFAULT_UNCERTAINTY: DEFAULT_UNCERTAINTY };
})(window);
