/* Reference implementation for the ARC parent shell side of the Discovery Review bridge.
   Adapt names to the actual repository before use. No credentials belong in this file. */
(function () {
  'use strict';
  var ALLOWED_ORIGIN = window.location.origin; /* set strictly for HTTPS deployment */
  var appliedTransferIds = {};

  window.addEventListener('message', function (ev) {
    if (ev.origin !== ALLOWED_ORIGIN && ev.origin.indexOf('http') === 0) { return; }
    var d = ev.data;
    if (!d || typeof d !== 'object') { return; }

    if (d.type === 'ARC_REQUEST_ACTIVE_CASE') {
      var c = window.arcGetActiveCase ? window.arcGetActiveCase() : null; /* use real shell function */
      if (c) {
        ev.source.postMessage({
          type: 'ARC_ACTIVE_CASE',
          caseId: c.caseId, caseName: c.caseName, docket: c.docket || '', court: c.court || ''
        }, ev.origin === 'null' ? '*' : ev.origin);
      }
      return;
    }

    if (d.type === 'ARC_SEND_DISCOVERY_GAP_REPORT') {
      function ack(success, message) {
        ev.source.postMessage({
          type: 'ARC_DISCOVERY_GAP_REPORT_ACK',
          transferId: d.transferId, success: success, message: message
        }, ev.origin === 'null' ? '*' : ev.origin);
      }
      if (d.version !== 1 || d.sourceModule !== 'discovery-review' || typeof d.reportHtml !== 'string' || !d.transferId) {
        ack(false, 'Transfer blocked: invalid payload.');
        return;
      }
      if (appliedTransferIds[d.transferId]) {
        ack(false, 'This Discovery Gap Report was already added.');
        return;
      }
      var active = window.arcGetActiveCase ? window.arcGetActiveCase() : null;
      if (!active || active.caseId !== d.caseId) {
        ack(false, 'Transfer blocked: the Discovery Gap Report and Main Report belong to different cases.');
        return;
      }
      /* Insert after Defense Issues / Discovery Gaps, else before Final Defense Assessment,
         else append. NEVER replace existing editor content. Use the repo's real editor state. */
      var inserted = window.arcInsertIntoEditReport
        ? window.arcInsertIntoEditReport(d.title, d.reportHtml, d.reportText)
        : false;
      if (inserted) {
        appliedTransferIds[d.transferId] = true;
        ack(true, 'Discovery Gap Report added to Edit Report.');
      } else {
        ack(false, 'Transfer was not confirmed. Open Main Report and retry.');
      }
    }
  });
})();
