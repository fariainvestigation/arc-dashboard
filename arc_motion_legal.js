/* ARC Motion & Legal module.
   Reads the active case from the shared ARC case system. Creates no cases of its own.
   All privileged operations go through /legal-api/* behind Cloudflare Access. */
(function () {
'use strict';

var API = window.ARCCourtListener.api;
var STORE = window.ARCAuthorityStore;

var S = {
  activeCase: null,   // from ARC shared case system
  user: null,         // { email, role } from Access identity
  tab: 'dashboard',
  motion: null,
  cache: {},
};

// ---------- utilities --------------------------------------------------------
function $(sel) { return document.querySelector(sel); }
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function badge(text, cls) { return '<span class="ml-badge ' + (cls || 'b-mut') + '">' + esc(text) + '</span>'; }
function note(text, kind) { return '<div class="ml-note n-' + (kind || 'info') + '">' + esc(text) + '</div>'; }
function toast(msg, kind) {
  var t = document.createElement('div');
  t.className = 'ml-note n-' + (kind || 'info');
  t.style.cssText = 'position:fixed;bottom:18px;right:18px;z-index:80;max-width:440px;box-shadow:0 6px 20px rgba(0,0,0,.5)';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(function () { t.remove(); }, 5200);
}
function modal(html) { $('#mlModalCard').innerHTML = html; $('#mlModal').hidden = false; }
function closeModal() { $('#mlModal').hidden = true; $('#mlModalCard').innerHTML = ''; }
$('#mlModal').addEventListener('click', function (e) { if (e.target.id === 'mlModal') closeModal(); });
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });
window.mlCloseModal = closeModal;

function field(name, label, val, type) {
  if (type === 'textarea') return '<label class="ml-f"><span>' + esc(label) + '</span><textarea name="' + name + '">' + esc(val) + '</textarea></label>';
  return '<label class="ml-f"><span>' + esc(label) + '</span><input name="' + name + '" type="' + (type || 'text') + '" value="' + esc(val) + '"></label>';
}
function select(name, label, val, opts) {
  return '<label class="ml-f"><span>' + esc(label) + '</span><select name="' + name + '">' +
    opts.map(function (o) { return '<option value="' + esc(o) + '"' + (o === val ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') +
    '</select></label>';
}
function formData(form) {
  var out = {};
  new FormData(form).forEach(function (v, k) { out[k] = v; });
  return out;
}

// ---------- ARC active case binding -----------------------------------------
/* The module never creates or stores cases. It asks the ARC shared case system,
   in order of availability: the unified bridge, a global ARC case object, or the
   ?caseId= parameter resolved through the bridge. No hard-coded default. */
function readActiveCase() {
  var c = null;
  if (window.ARCBridge && typeof window.ARCBridge.getActiveCase === 'function') {
    c = window.ARCBridge.getActiveCase();
  } else if (window.ARC && typeof window.ARC.getActiveCase === 'function') {
    c = window.ARC.getActiveCase();
  } else if (window.ARC_ACTIVE_CASE) {
    c = window.ARC_ACTIVE_CASE;
  }
  if (!c) return null;
  var id = c.caseId || c.id || '';
  if (!id) return null;
  return {
    caseId: id,
    caseName: c.caseName || c.name || '',
    client: c.clientName || c.defendantName || c.client || '',
    docket: c.docketNumber || c.docket || '',
    court: c.court || c.courtName || '',
    county: c.county || '',
    charges: c.charges || [],
    attorney: c.assignedAttorney || c.attorney || '',
    investigator: c.assignedInvestigator || c.investigator || '',
  };
}

function renderCaseBar() {
  var c = S.activeCase;
  $('#caseNone').hidden = !!c;
  $('#caseInfo').hidden = !c;
  if (!c) return;
  $('#cbClient').textContent = c.client || '[client name missing from ARC case]';
  $('#cbCaseName').textContent = c.caseName ? '· ' + c.caseName : '';
  $('#cbDocket').textContent = c.docket || '-';
  $('#cbCourt').textContent = [c.court, c.county].filter(Boolean).join(', ') || '-';
  $('#cbCharges').textContent = (Array.isArray(c.charges) ? c.charges.map(function (x) { return x.charge || x; }).join('; ') : c.charges) || '-';
  $('#cbAttorney').textContent = c.attorney || '-';
  $('#cbInvestigator').textContent = c.investigator || '-';
  $('#cbUser').textContent = S.user ? S.user.email + ' (' + S.user.role + ')' : '-';
}

/* Approved ARC data only. Rejected, draft, superseded, unverified, and
   not-approved-for-legal-use records are filtered out before they reach here. */
function approvedFacts() {
  if (window.ARCBridge && typeof window.ARCBridge.getApprovedFacts === 'function') {
    return window.ARCBridge.getApprovedFacts(S.activeCase.caseId) || [];
  }
  return [];
}
function approvedFindings() {
  if (window.ARCBridge && typeof window.ARCBridge.getApprovedFindings === 'function') {
    return window.ARCBridge.getApprovedFindings(S.activeCase.caseId) || [];
  }
  return [];
}

// ---------- tab routing ------------------------------------------------------
var TABS = {};
function setTab(name) {
  S.tab = name;
  Array.prototype.forEach.call(document.querySelectorAll('#mlTabs button'), function (b) {
    b.classList.toggle('active', b.dataset.tab === name);
  });
  render();
}
document.getElementById('mlTabs').addEventListener('click', function (e) {
  var b = e.target.closest('button[data-tab]');
  if (b) setTab(b.dataset.tab);
});

async function render() {
  var view = $('#mlView');
  if (!S.activeCase) {
    // No research, drafting, uploads, or exports without a valid ARC case.
    view.innerHTML = '<div class="ml-panel">' +
      note('No active ARC case selected.', 'warn') +
      '<p class="ml-muted">Select a case in the ARC case system, then return to this module. ' +
      'Research, drafting, uploads, and exports stay disabled until a case is active.</p></div>';
    return;
  }
  view.innerHTML = '<p class="ml-muted">Loading…</p>';
  try {
    var fn = TABS[S.tab] || TABS.dashboard;
    view.innerHTML = await fn();
    if (TABS[S.tab + ':bind']) TABS[S.tab + ':bind']();
  } catch (e) {
    view.innerHTML = note(e.message, 'bad');
  }
}

// ---------- Legal Dashboard --------------------------------------------------
TABS.dashboard = async function () {
  var cid = S.activeCase.caseId;
  var res = await Promise.all([
    API('/motions/' + cid), API('/authorities/' + cid), API('/issues/' + cid), API('/files/' + cid),
  ]);
  var motions = res[0], auths = res[1], issues = res[2], files = res[3];
  S.cache.motions = motions; S.cache.authorities = auths;
  var usable = auths.filter(STORE.isUsable).length;
  var byStatus = {};
  motions.forEach(function (m) { byStatus[m.status] = (byStatus[m.status] || 0) + 1; });
  var stat = function (n, label) { return '<div class="ml-stat"><b>' + n + '</b><span>' + esc(label) + '</span></div>'; };
  return '<div class="ml-stats">' +
      stat(issues.length, 'Legal issues') +
      stat(motions.length, 'Motions') +
      stat(byStatus['Approved for Filing'] || 0, 'Approved for filing') +
      stat(auths.length, 'Authorities') +
      stat(usable, 'Citable authorities') +
      stat(auths.length - usable, 'Awaiting verification') +
      stat(files.length, 'Legal files') +
    '</div>' +
    note('Motion recommendations in this module are potential motions for attorney review. They are not legally required and are not guaranteed to succeed.', 'info') +
    '<div class="ml-panel"><h2>Motions</h2><table class="ml-table"><tr><th>Motion</th><th>Status</th><th>Version</th><th>Approved</th><th></th></tr>' +
      (motions.map(function (m) {
        return '<tr><td><strong>' + esc(m.title) + '</strong></td><td>' + badge(m.status, statusClass(m.status)) + '</td>' +
          '<td class="ml-mono">v' + m.version + '</td>' +
          '<td>' + (m.approved_at ? badge('v' + m.approved_version + ' by ' + esc(m.approved_by), 'b-ok') : badge('not approved', 'b-mut')) + '</td>' +
          '<td><button class="ml-btn link" data-openmotion="' + m.id + '">Open</button></td></tr>';
      }).join('') || '<tr><td colspan="5" class="ml-muted">No motions yet. Start from Issues or Motion Recommendations.</td></tr>') +
    '</table></div>';
};
TABS['dashboard:bind'] = function () {
  document.querySelectorAll('[data-openmotion]').forEach(function (b) {
    b.onclick = function () { S.motion = b.dataset.openmotion; setTab('builder'); };
  });
};
function statusClass(s) {
  if (s === 'Approved for Filing' || s === 'Filed') return 'b-ok';
  if (s === 'Revision Required') return 'b-bad';
  if (s === 'Attorney Review' || s === 'Ready to Draft') return 'b-warn';
  return 'b-mut';
}

// ---------- Issues -----------------------------------------------------------
TABS.issues = async function () {
  var issues = await API('/issues/' + S.activeCase.caseId);
  var facts = approvedFacts();
  return '<div class="ml-panel"><h2>Legal issues</h2>' +
    '<p class="ml-muted">Issues anchor research, IRAC blocks, and motions. Link only approved ARC facts.</p>' +
    '<button class="ml-btn gold" id="newIssue">New issue</button></div>' +
    (facts.length ? '' : note('No approved ARC facts are available for this case yet. Facts must be approved in the ARC case record before they can support a motion.', 'warn')) +
    '<div class="ml-panel"><table class="ml-table"><tr><th>Issue</th><th>Description</th><th>Linked facts</th><th>Status</th></tr>' +
      (issues.map(function (i) {
        var ids = JSON.parse(i.related_fact_ids || '[]');
        return '<tr><td><strong>' + esc(i.title) + '</strong></td><td>' + esc(i.description) + '</td>' +
          '<td>' + (ids.length ? ids.map(function (x) { return '<span class="ml-mono">' + esc(x) + '</span>'; }).join(', ') : '<span class="ml-muted">none</span>') + '</td>' +
          '<td>' + badge(i.status, 'b-info') + '</td></tr>';
      }).join('') || '<tr><td colspan="4" class="ml-muted">No issues yet.</td></tr>') +
    '</table></div>';
};
TABS['issues:bind'] = function () {
  $('#newIssue').onclick = function () {
    var facts = approvedFacts();
    modal('<h2>New legal issue</h2><form id="issueForm">' +
      field('title', 'Issue title', '') + field('description', 'Description', '', 'textarea') +
      '<label class="ml-f"><span>Approved ARC facts supporting this issue</span><select name="factIds" multiple size="6">' +
      facts.map(function (f) { return '<option value="' + esc(f.id) + '">' + esc(String(f.text).slice(0, 110)) + '</option>'; }).join('') +
      '</select></label>' +
      '<div class="ml-row"><button class="ml-btn gold">Create issue</button>' +
      '<button type="button" class="ml-btn" onclick="mlCloseModal()">Cancel</button></div></form>');
    $('#issueForm').onsubmit = async function (e) {
      e.preventDefault();
      var sel = Array.prototype.map.call(e.target.factIds.selectedOptions, function (o) { return o.value; });
      await API('/issues', { method: 'POST', body: { caseId: S.activeCase.caseId, title: e.target.title.value, description: e.target.description.value, relatedFactIds: sel } });
      closeModal(); render(); toast('Issue created', 'ok');
    };
  };
};

// ---------- CourtListener Research ------------------------------------------
TABS.research = async function () {
  return '<div class="ml-panel"><h2>CourtListener research</h2>' +
    '<p class="ml-muted">Massachusetts authority first. Searches run through the secure ARC service; no API key exists in this page.</p>' +
    '<form id="clForm"><div class="ml-grid3">' +
      field('q', 'Search terms', '') + field('caseName', 'Case name', '') + field('citation', 'Citation', '') +
    '</div><div class="ml-grid3">' +
      field('docketNumber', 'Docket number', '') +
      select('jurisdiction', 'Jurisdiction', 'massachusetts-first', ['massachusetts-first', 'massachusetts', 'federal', 'all']) +
      field('court', 'Court ID (optional, e.g. mass)', '') +
    '</div><div class="ml-grid3">' +
      field('dateAfter', 'Filed after', '', 'date') + field('dateBefore', 'Filed before', '', 'date') +
      '<label class="ml-f"><span>&nbsp;</span><button class="ml-btn gold" style="width:100%">Search CourtListener</button></label>' +
    '</div></form>' +
    note('Docket numbers are not unique. A docket-number search always carries a court or jurisdiction filter.', 'info') +
    '</div><div id="clResults"></div>' +
    '<div class="ml-panel"><h2>Import by CourtListener URL</h2>' +
    '<p class="ml-muted">Opinion-page URLs carry the cluster ID. Paste the URL and ARC resolves the full hierarchy.</p>' +
    '<form id="urlForm" class="ml-row"><input name="url" placeholder="https://www.courtlistener.com/opinion/2812209/..." class="ml-grow">' +
    '<button class="ml-btn">Resolve</button></form></div>';
};
TABS['research:bind'] = function () {
  $('#clForm').onsubmit = async function (e) {
    e.preventDefault();
    var body = formData(e.target);
    body.caseId = S.activeCase.caseId;
    $('#clResults').innerHTML = '<p class="ml-muted">Searching…</p>';
    try {
      var r = await window.ARCCourtListener.search(body);
      $('#clResults').innerHTML = '<div class="ml-panel"><h2>' + r.count + ' result(s)</h2>' +
        '<p class="ml-muted">Filter: ' + esc(r.jurisdictionFilter) + '</p><table class="ml-table">' +
        '<tr><th>Case</th><th>Citation</th><th>Court</th><th>Filed</th><th></th></tr>' +
        r.results.map(function (x) {
          return '<tr><td><strong>' + esc(x.caseName) + '</strong><br><small class="ml-muted">' + esc(x.snippet) + '</small></td>' +
            '<td class="ml-mono">' + esc(x.citation) + '</td><td>' + esc(x.court) + '</td><td>' + esc(x.dateFiled) + '</td>' +
            '<td><button class="ml-btn link" data-cluster="' + esc(x.clusterId) + '">Open &amp; import</button></td></tr>';
        }).join('') + '</table></div>';
      bindClusterButtons();
    } catch (err) { $('#clResults').innerHTML = note(err.message, 'bad'); }
  };
  $('#urlForm').onsubmit = function (e) {
    e.preventDefault();
    var id = window.ARCCourtListener.clusterIdFromUrl(e.target.url.value);
    if (!id) return toast('That does not look like a CourtListener opinion URL.', 'warn');
    openCluster(id);
  };
};
function bindClusterButtons() {
  document.querySelectorAll('[data-cluster]').forEach(function (b) {
    b.onclick = function () { openCluster(b.dataset.cluster); };
  });
}
async function openCluster(clusterId) {
  modal('<p class="ml-muted">Retrieving the full CourtListener record…</p>');
  try {
    var full = await window.ARCCourtListener.cluster(clusterId, true);
    var c = full.cluster, d = full.docket, court = full.court;
    modal('<h2>' + esc(c.case_name) + '</h2>' +
      '<p class="ml-mono ml-muted">Court ' + esc(court ? court.cl_court_id : (d ? d.cl_court_id : '?')) +
      ' · Docket ' + esc(d ? d.cl_docket_id : '?') + ' · Cluster ' + esc(c.cl_cluster_id) + '</p>' +
      '<p>' + esc((c.citations || []).join('; ')) + ' · filed ' + esc(c.date_filed) + (c.judges ? ' · ' + esc(c.judges) : '') + '</p>' +
      note('Importing does not make an authority valid or controlling. Every import lands as Imported and must be verified.', 'info') +
      '<h2>Opinions in this cluster</h2>' +
      '<p class="ml-muted">Separate opinions are imported as separate authority records; types are never merged.</p>' +
      full.opinions.map(function (o) {
        var nonHolding = STORE.NON_HOLDING.indexOf(o.opinion_type) !== -1;
        return '<div class="ml-panel"><div class="ml-row"><strong>' + esc(o.opinion_type.toUpperCase()) + '</strong>' +
          (o.author ? badge(o.author, 'b-mut') : '') +
          (nonHolding ? badge('not the holding of the court', 'b-warn') : '') +
          '<span class="ml-grow"></span><span class="ml-mono ml-muted">text from ' + esc(o.text_source_field || 'n/a') + '</span></div>' +
          '<div class="ml-doc" style="max-height:150px;overflow:auto">' + esc(String(o.opinion_text).slice(0, 1200)) + '…</div>' +
          '<div class="ml-row" style="margin-top:8px"><button class="ml-btn gold" data-import="' + esc(o.cl_opinion_id) + '">Import this opinion as authority</button></div></div>';
      }).join('') +
      '<div class="ml-row"><button class="ml-btn" onclick="mlCloseModal()">Close</button></div>');
    window.__clFull = full;
    document.querySelectorAll('[data-import]').forEach(function (b) {
      b.onclick = function () { importOpinion(full, b.dataset.import); };
    });
  } catch (e) { modal(note(e.message, 'bad') + '<button class="ml-btn" onclick="mlCloseModal()">Close</button>'); }
}
async function importOpinion(full, opinionId) {
  var op = full.opinions.filter(function (o) { return o.cl_opinion_id === opinionId; })[0];
  var c = full.cluster, d = full.docket, court = full.court;
  var payload = {
    caseId: S.activeCase.caseId,
    clCourtId: court ? court.cl_court_id : (d ? d.cl_court_id : ''),
    clDocketId: d ? d.cl_docket_id : '',
    clClusterId: c.cl_cluster_id,
    clOpinionId: op.cl_opinion_id,
    caseName: c.case_name,
    citation: (c.citations || []).join('; '),
    court: court ? court.name : (d ? d.cl_court_id : ''),
    date: c.date_filed,
    opinionType: op.opinion_type,
    url: c.absolute_url,
    jurisdiction: court ? court.jurisdiction : '',
  };
  var r = await window.ARCCourtListener.importAuthority(payload);
  if (r.duplicate) return toast(r.message + ' (matched on ' + r.matchedOn + ')', 'warn');
  closeModal();
  toast('Imported as "' + r.verification_status + '". Add a pinpoint and verify before citing.', 'ok');
  setTab('authorities');
}

// ---------- Authorities ------------------------------------------------------
TABS.authorities = async function () {
  var auths = await API('/authorities/' + S.activeCase.caseId);
  S.cache.authorities = auths;
  return '<div class="ml-panel"><h2>Authority library</h2>' +
    '<p class="ml-muted">One library for this case. Only Verified, Persuasive, or Controlling authorities may be cited in a draft.</p></div>' +
    '<div class="ml-panel"><table class="ml-table">' +
    '<tr><th>Authority</th><th>Citation / pinpoint</th><th>Opinion</th><th>Weight</th><th>Warnings</th><th></th></tr>' +
    (auths.map(function (a) {
      var w = STORE.warnings(a);
      return '<tr><td><strong>' + esc(a.case_name) + '</strong><br><small class="ml-muted">' + esc(a.court) + ' ' + esc(String(a.decided_date).slice(0, 4)) + '</small></td>' +
        '<td class="ml-mono">' + esc(a.citation) + (a.pinpoint ? ', at ' + esc(a.pinpoint) : '<br>' + badge('no pinpoint', 'b-warn')) + '</td>' +
        '<td>' + badge(a.opinion_type || 'unknown', STORE.NON_HOLDING.indexOf(a.opinion_type) !== -1 ? 'b-warn' : 'b-mut') + '</td>' +
        '<td>' + badge(STORE.weightLabel(a), STORE.badgeClass(a.verification_status)) + '</td>' +
        '<td>' + (w.length ? w.map(function (x) { return '<div class="ml-muted" style="font-size:11.5px">• ' + esc(x) + '</div>'; }).join('') : badge('clear', 'b-ok')) + '</td>' +
        '<td><button class="ml-btn link" data-verify="' + a.id + '">Verify</button>' +
        (a.courtlistener_url ? '<a class="ml-btn link" href="' + esc(a.courtlistener_url) + '" target="_blank" rel="noopener">Source</a>' : '') + '</td></tr>';
    }).join('') || '<tr><td colspan="6" class="ml-muted">No authorities yet. Import from CourtListener Research.</td></tr>') +
    '</table></div>';
};
TABS['authorities:bind'] = function () {
  document.querySelectorAll('[data-verify]').forEach(function (b) {
    b.onclick = function () {
      var a = S.cache.authorities.filter(function (x) { return x.id === b.dataset.verify; })[0];
      var ctrl = STORE.canMarkControlling(a, S.user.role);
      modal('<h2>Verify authority</h2><p><strong>' + esc(a.case_name) + '</strong> · ' + esc(a.citation) + '</p>' +
        (STORE.NON_HOLDING.indexOf(a.opinion_type) !== -1 ? note('This is a ' + a.opinion_type + '. It is not the holding of the court and cannot be marked Controlling.', 'warn') : '') +
        (ctrl.ok ? '' : note('Controlling is unavailable: ' + ctrl.reason, 'info')) +
        '<form id="vForm">' +
        field('pinpoint', 'Pinpoint citation (required before any citable status)', a.pinpoint || '') +
        field('quotedLanguage', 'Relevant quoted passage', a.quoted_language || '', 'textarea') +
        select('status', 'Verification status', a.verification_status,
          STORE.STATUSES.filter(function (s) { return s !== 'Controlling' || ctrl.ok; })) +
        '<div class="ml-row"><button class="ml-btn gold">Save</button>' +
        '<button type="button" class="ml-btn" onclick="mlCloseModal()">Cancel</button></div></form>');
      $('#vForm').onsubmit = async function (e) {
        e.preventDefault();
        var d = formData(e.target);
        d.id = a.id;
        try {
          var r = await window.ARCCourtListener.verifyAuthority(d);
          closeModal(); render();
          (r.warnings || []).forEach(function (w) { toast(w, 'warn'); });
          toast('Authority saved as ' + d.status, 'ok');
        } catch (err) { toast(err.message, 'bad'); }
      };
    };
  });
};

// ---------- Motion Recommendations ------------------------------------------
TABS.recommendations = async function () {
  var facts = approvedFacts();
  var bank = window.ARC_MOTION_BANK || [];
  var recs = recommend(facts, bank);
  S.cache.recs = recs;
  return note('Potential motion for attorney review. Recommendations are derived from approved ARC facts and the ARC motion bank. They are not legally required and are not guaranteed to succeed.', 'warn') +
    '<div class="ml-panel"><h2>Recommendations (' + recs.length + ')</h2>' +
    '<p class="ml-muted">Motion bank: ' + (window.ARC_MOTION_BANK_META || {}).count + ' entries - ' + esc((window.ARC_MOTION_BANK_META || {}).kind || '') + '</p>' +
    '<table class="ml-table"><tr><th>Motion</th><th>Category</th><th>Support</th><th>Basis</th><th></th></tr>' +
    (recs.map(function (r, i) {
      return '<tr><td><strong>' + esc(r.title) + '</strong></td><td>' + esc(r.category) + '</td>' +
        '<td>' + badge(r.support, r.support === 'Supported by approved facts' ? 'b-ok' : 'b-warn') + '</td>' +
        '<td><small class="ml-muted">' + esc(r.basis) + '</small></td>' +
        '<td><button class="ml-btn link" data-startmotion="' + i + '">Start motion</button></td></tr>';
    }).join('') || '<tr><td colspan="5" class="ml-muted">No approved facts yet, so no recommendations. Approve facts in the ARC case record first.</td></tr>') +
    '</table></div>';
};
/* Deterministic: approved ARC fact categories map to motion bank entries. */
var TRIGGERS = [
  { cats: ['stop'], titles: ['Motion to Suppress Stop', 'Motion to Challenge Probable Cause'] },
  { cats: ['frisk'], titles: ['Motion to Suppress Frisk'] },
  { cats: ['search'], titles: ['Motion to Suppress Search'] },
  { cats: ['seizure'], titles: ['Motion to Suppress Seizure'] },
  { cats: ['warrant'], titles: ['Motion to Suppress Warrant Evidence', 'Motion for Franks/Amral Hearing'] },
  { cats: ['statement', 'miranda'], titles: ['Motion to Suppress Statements - Miranda'] },
  { cats: ['voluntariness'], titles: ['Motion to Suppress Involuntary Statements', 'Motion for Humane Practice Hearing'] },
  { cats: ['identification'], titles: ['Motion to Suppress Out-of-Court Identification', 'Motion to Preclude In-Court Identification'] },
  { cats: ['digital evidence', 'phone evidence'], titles: ['Motion to Suppress Cell Phone Search', 'Motion to Preserve and Produce Cellebrite Extraction Data'] },
  { cats: ['location data'], titles: ['Motion to Suppress CSLI, GPS, and Location Data'] },
  { cats: ['brady', 'impeachment'], titles: ['Motion for Brady and Impeachment Material', 'Motion for Disclosure of Giglio Material'] },
  { cats: ['missing discovery'], titles: ['Motion to Compel Discovery', 'Motion for Sanctions for Discovery Noncompliance'] },
  { cats: ['prior bad acts'], titles: ['Motion in Limine to Exclude Prior Bad Acts'] },
  { cats: ['gang reference'], titles: ['Motion to Exclude Gang References'] },
  { cats: ['immigration reference'], titles: ['Motion to Exclude Immigration Status'] },
  { cats: ['alibi'], titles: ['Notice of Alibi'] },
];
var BASELINE = ['Motion to Compel Discovery', 'Motion to Preserve Evidence', 'Motion for Brady and Impeachment Material'];
function recommend(facts, bank) {
  var byTitle = {};
  bank.forEach(function (b) { byTitle[b.title.toLowerCase()] = b; });
  var out = {};
  function push(title, basisFacts, baseline) {
    var b = byTitle[title.toLowerCase()];
    if (!b || out[b.title]) {
      if (out[b && b.title]) out[b.title].facts = out[b.title].facts.concat(basisFacts);
      return;
    }
    out[b.title] = { bank: b, facts: basisFacts.slice(), baseline: !!baseline };
  }
  BASELINE.forEach(function (t) { push(t, [], true); });
  TRIGGERS.forEach(function (trig) {
    var matched = facts.filter(function (f) { return trig.cats.indexOf(String(f.category || '').toLowerCase()) !== -1; });
    if (matched.length) trig.titles.forEach(function (t) { push(t, matched); });
  });
  return Object.keys(out).map(function (k) {
    var r = out[k];
    return {
      title: r.bank.title, category: r.bank.category, bankId: r.bank.id,
      theory: r.bank.theory, relief: r.bank.relief, authorities: r.bank.authorities,
      support: r.facts.length ? 'Supported by approved facts' : (r.baseline ? 'Baseline practice' : 'No approved facts yet'),
      basis: r.facts.length ? r.facts.map(function (f) { return String(f.text).slice(0, 90); }).join(' | ') : 'Baseline discovery and preservation practice.',
      factIds: r.facts.map(function (f) { return f.id; }),
    };
  });
}
TABS['recommendations:bind'] = function () {
  document.querySelectorAll('[data-startmotion]').forEach(function (b) {
    b.onclick = async function () {
      var r = S.cache.recs[Number(b.dataset.startmotion)];
      var bankEntry = (window.ARC_MOTION_BANK || []).filter(function (x) { return x.id === r.bankId; })[0];
      var sections = window.ARC_MOTION_SCAFFOLD(bankEntry, S.activeCase).map(function (s) {
        return { type: s.type, heading: s.heading, body: s.body };
      });
      var m = await API('/motions', { method: 'POST', body: {
        caseId: S.activeCase.caseId, motionType: String(r.bankId), title: r.title,
        selectedFactIds: r.factIds, sections: sections,
        certificateOfService: 'I, [ATTORNEY NAME], hereby certify that on [DATE] I served a true copy of the foregoing on the Commonwealth by [METHOD OF SERVICE].\n\n/s/ [ATTORNEY NAME]',
      } });
      S.motion = m.id; toast('Motion started: ' + m.title, 'ok'); setTab('builder');
    };
  });
};

// ---------- IRAC Builder -----------------------------------------------------
TABS.irac = async function () {
  var res = await Promise.all([API('/irac/' + S.activeCase.caseId), API('/motions/' + S.activeCase.caseId), API('/authorities/' + S.activeCase.caseId)]);
  var blocks = res[0]; S.cache.irac = blocks; S.cache.motions = res[1]; S.cache.authorities = res[2];
  return '<div class="ml-panel"><h2>IRAC builder</h2>' +
    '<p class="ml-muted">Each block links approved facts and citable authorities. Missing links are flagged before the block can become argument text.</p>' +
    '<button class="ml-btn gold" id="newIrac">New IRAC block</button></div>' +
    blocks.map(function (b) {
      var flags = JSON.parse(b.flags || '[]');
      return '<div class="ml-panel"><div class="ml-row"><h2 class="ml-grow" style="margin:0">' + esc(b.label || 'Untitled block') + '</h2>' +
        flags.map(function (f) { return badge(f, 'b-warn'); }).join(' ') + '</div>' +
        '<p class="ml-muted">' + esc(String(b.issue).slice(0, 240)) + '</p>' +
        '<div class="ml-row"><button class="ml-btn link" data-editirac="' + b.id + '">Edit</button>' +
        '<button class="ml-btn link" data-toarg="' + b.id + '">Convert to argument section</button></div></div>';
    }).join('') || '<div class="ml-panel"><p class="ml-muted">No IRAC blocks yet.</p></div>';
};
TABS['irac:bind'] = function () {
  function open(b) {
    b = b || {};
    var facts = approvedFacts(), auths = S.cache.authorities.filter(STORE.isUsable);
    var linkedF = JSON.parse(b.linked_fact_ids || '[]'), linkedA = JSON.parse(b.linked_authority_ids || '[]');
    modal('<h2>' + (b.id ? 'Edit' : 'New') + ' IRAC block</h2><form id="iracForm" style="max-height:70vh;overflow:auto">' +
      '<div class="ml-grid2">' + field('label', 'Label', b.label || '') +
      '<label class="ml-f"><span>Attach to motion</span><select name="motionId"><option value="">- none -</option>' +
      S.cache.motions.map(function (m) { return '<option value="' + m.id + '"' + (m.id === b.motion_id ? ' selected' : '') + '>' + esc(m.title) + '</option>'; }).join('') +
      '</select></label></div>' +
      field('issue', 'Issue', b.issue || '', 'textarea') +
      field('rule', 'Rule', b.rule || '', 'textarea') +
      field('application', 'Application', b.application || '', 'textarea') +
      field('conclusion', 'Conclusion', b.conclusion || '', 'textarea') +
      '<div class="ml-grid2">' + field('anticipatedCommonwealth', 'Anticipated Commonwealth argument', b.anticipated_commonwealth || '', 'textarea') +
      field('defenseResponse', 'Defense response', b.defense_response || '', 'textarea') + '</div>' +
      '<div class="ml-grid2">' +
      '<label class="ml-f"><span>Approved facts</span><select name="factIds" multiple size="6">' +
      facts.map(function (f) { return '<option value="' + esc(f.id) + '"' + (linkedF.indexOf(f.id) !== -1 ? ' selected' : '') + '>' + esc(String(f.text).slice(0, 90)) + '</option>'; }).join('') +
      '</select></label>' +
      '<label class="ml-f"><span>Citable authorities (Verified / Persuasive / Controlling only)</span><select name="authIds" multiple size="6">' +
      (auths.map(function (a) { return '<option value="' + a.id + '"' + (linkedA.indexOf(a.id) !== -1 ? ' selected' : '') + '>' + esc(a.case_name) + ' (' + esc(a.verification_status) + ')</option>'; }).join('') || '<option disabled>No citable authorities yet</option>') +
      '</select></label></div>' +
      '<div class="ml-row"><button class="ml-btn gold">Save block</button>' +
      '<button type="button" class="ml-btn" onclick="mlCloseModal()">Cancel</button></div></form>');
    $('#iracForm').onsubmit = async function (e) {
      e.preventDefault();
      var d = formData(e.target);
      await API('/irac', { method: 'POST', body: {
        id: b.id, caseId: S.activeCase.caseId, motionId: d.motionId, label: d.label,
        issue: d.issue, rule: d.rule, application: d.application, conclusion: d.conclusion,
        anticipatedCommonwealth: d.anticipatedCommonwealth, defenseResponse: d.defenseResponse,
        linkedFactIds: Array.prototype.map.call(e.target.factIds.selectedOptions, function (o) { return o.value; }),
        linkedAuthorityIds: Array.prototype.map.call(e.target.authIds.selectedOptions, function (o) { return o.value; }),
      } });
      closeModal(); render(); toast('IRAC block saved', 'ok');
    };
  }
  $('#newIrac').onclick = function () { open(); };
  document.querySelectorAll('[data-editirac]').forEach(function (b) {
    b.onclick = function () { open(S.cache.irac.filter(function (x) { return x.id === b.dataset.editirac; })[0]); };
  });
  document.querySelectorAll('[data-toarg]').forEach(function (b) {
    b.onclick = async function () {
      var blk = S.cache.irac.filter(function (x) { return x.id === b.dataset.toarg; })[0];
      if (!blk.motion_id) return toast('Attach this block to a motion first.', 'warn');
      var body = iracToArgument(blk);
      var m = await API('/motion/' + blk.motion_id);
      var sections = JSON.parse(m.sections || '[]');
      sections.push({ type: 'irac', heading: blk.label || 'ARGUMENT', body: body });
      await API('/motion/' + blk.motion_id, { method: 'PUT', body: { sections: sections } });
      S.motion = blk.motion_id; toast('Argument section added to the motion', 'ok'); setTab('builder');
    };
  });
};
/* Deterministic conversion. Fact and authority tags are preserved so every
   proposition stays traceable to its ARC source record. */
function iracToArgument(b) {
  var factTags = JSON.parse(b.linked_fact_ids || '[]').map(function (id) { return '[FACT:' + id + ']'; }).join(' ');
  var authTags = JSON.parse(b.linked_authority_ids || '[]').map(function (id) { return '[AUTH:' + id + ']'; }).join(' ');
  var p = [];
  if (b.issue) p.push('Issue. ' + b.issue);
  if (b.rule) p.push('Rule. ' + b.rule + (authTags ? ' ' + authTags : ' [AUTHORITY REQUIRES VERIFICATION]'));
  if (b.application) p.push('Application. ' + b.application + (factTags ? ' ' + factTags : ' [FACTUAL SUPPORT REQUIRED]'));
  if (b.anticipated_commonwealth) p.push('The Commonwealth may argue that ' + b.anticipated_commonwealth + (b.defense_response ? ' That argument fails because ' + b.defense_response : ''));
  if (b.conclusion) p.push('Conclusion. ' + b.conclusion);
  return p.join('\n\n');
}

// ---------- Motion Builder ---------------------------------------------------
TABS.builder = async function () {
  var motions = await API('/motions/' + S.activeCase.caseId);
  S.cache.motions = motions;
  if (!S.motion) {
    return '<div class="ml-panel"><h2>Motions</h2><table class="ml-table"><tr><th>Motion</th><th>Status</th><th>Version</th><th></th></tr>' +
      (motions.map(function (m) {
        return '<tr><td>' + esc(m.title) + '</td><td>' + badge(m.status, statusClass(m.status)) + '</td><td class="ml-mono">v' + m.version + '</td>' +
          '<td><button class="ml-btn link" data-openmotion="' + m.id + '">Open</button></td></tr>';
      }).join('') || '<tr><td colspan="4" class="ml-muted">No motions yet.</td></tr>') + '</table></div>';
  }
  var m = await API('/motion/' + S.motion);
  var auths = S.cache.authorities || await API('/authorities/' + S.activeCase.caseId);
  S.cache.authorities = auths;
  var sections = JSON.parse(m.sections || '[]');
  var factIds = JSON.parse(m.selected_fact_ids || '[]');
  var authIds = JSON.parse(m.selected_authority_ids || '[]');
  var citable = auths.filter(function (a) { return authIds.indexOf(a.id) !== -1 && STORE.isUsable(a); });
  var readyToDraft = ['Ready to Draft', 'Draft', 'Revision Required'].indexOf(m.status) !== -1;
  return '<div class="ml-panel"><div class="ml-row"><h2 class="ml-grow" style="margin:0">' + esc(m.title) + '</h2>' +
      badge(m.status, statusClass(m.status)) + badge('v' + m.version, 'b-mut') +
      '<button class="ml-btn link" id="backList">All motions</button></div>' +
      (m.approved_at ? note('Approved for filing at version ' + m.approved_version + ' by ' + m.approved_by + '. Any edit creates a new version and removes that approval until reapproved.', 'ok') : '') +
    '</div>' +
    '<div class="ml-panel"><h2>Drafting sequence</h2>' +
    '<ol class="ml-muted" style="margin:0 0 10px 18px"><li>Facts selected: ' + factIds.length + '</li>' +
    '<li>Authorities selected: ' + authIds.length + ' (citable: ' + citable.length + ')</li>' +
    '<li>Outline sections: ' + sections.length + '</li></ol>' +
    '<div class="ml-row"><button class="ml-btn" id="selectFacts">Select approved facts</button>' +
    '<button class="ml-btn" id="selectAuths">Select authorities</button>' +
    '<button class="ml-btn" id="markReviewed">Mark facts &amp; authorities reviewed</button>' +
    '<button class="ml-btn gold" id="draftBtn"' + (readyToDraft ? '' : ' disabled') + '>Draft with Claude</button></div>' +
    (readyToDraft ? '' : note('Complete drafting is unavailable until the selected facts and authorities are reviewed. Claude drafts only from reviewed, approved sources.', 'info')) +
    '</div>' +
    '<div class="ml-panel"><div class="ml-row"><h2 class="ml-grow" style="margin:0">Sections</h2>' +
    '<button class="ml-btn" id="addSection">Add section</button></div>' +
    sections.map(function (s, i) {
      return '<div class="ml-panel" style="background:var(--ml-panel-2)"><div class="ml-row"><strong>' + esc(s.heading || s.type) + '</strong>' +
        badge(s.type, 'b-mut') + '<span class="ml-grow"></span>' +
        '<button class="ml-btn link" data-editsec="' + i + '">Edit</button>' +
        '<button class="ml-btn link" data-revise="' + i + '">Revise with Claude</button>' +
        '<button class="ml-btn link" data-delsec="' + i + '">Delete</button></div>' +
        '<div class="ml-doc">' + linkifyCitations(s.body) + '</div></div>';
    }).join('') +
    '</div>' +
    '<div class="ml-panel"><h2>Proposed order &amp; certificate of service</h2><form id="extrasForm">' +
    field('proposedOrder', 'Proposed order', m.proposed_order || '', 'textarea') +
    field('certificateOfService', 'Certificate of service', m.certificate_of_service || '', 'textarea') +
    '<button class="ml-btn">Save</button></form></div>';
};
/* Citation traceability: [FACT:id] and [AUTH:id] render as clickable chips that
   open the underlying ARC source record. */
function linkifyCitations(text) {
  return esc(text)
    .replace(/\[FACT:([^\]]+)\]/g, function (_, id) { return '<span class="ml-cite" data-fact="' + id + '">[fact ' + String(id).slice(0, 8) + ']</span>'; })
    .replace(/\[AUTH:([^\]]+)\]/g, function (_, id) { return '<span class="ml-cite" data-auth="' + id + '">[authority]</span>'; })
    .replace(/\n/g, '<br>');
}
TABS['builder:bind'] = function () {
  document.querySelectorAll('[data-openmotion]').forEach(function (b) {
    b.onclick = function () { S.motion = b.dataset.openmotion; render(); };
  });
  var back = $('#backList');
  if (back) back.onclick = function () { S.motion = null; render(); };
  if (!S.motion) return;

  document.querySelectorAll('[data-fact]').forEach(function (el) {
    el.onclick = function () {
      var f = approvedFacts().filter(function (x) { return x.id === el.dataset.fact; })[0];
      modal('<h2>Source fact</h2>' + (f
        ? '<p>' + esc(f.text) + '</p><p class="ml-mono ml-muted">ARC fact ID ' + esc(f.id) + ' · source ' + esc(f.sourceId || f.source || 'on file') +
          (f.document ? ' · ' + esc(f.document) : '') + (f.page ? ' · p. ' + esc(f.page) : '') + (f.timestamp ? ' · ' + esc(f.timestamp) : '') +
          '</p><p>' + badge(f.verification || 'approved', 'b-ok') + '</p>'
        : note('This fact is not in the approved set for the active case. It may belong to another case or have been withdrawn.', 'bad')) +
        '<button class="ml-btn" onclick="mlCloseModal()">Close</button>');
    };
  });
  document.querySelectorAll('[data-auth]').forEach(function (el) {
    el.onclick = function () {
      var a = (S.cache.authorities || []).filter(function (x) { return x.id === el.dataset.auth; })[0];
      modal('<h2>Authority</h2>' + (a
        ? '<p><strong>' + esc(a.case_name) + '</strong>, ' + esc(a.citation) + (a.pinpoint ? ', at ' + esc(a.pinpoint) : '') + '</p>' +
          '<p>' + esc(a.court) + ' · ' + esc(a.decided_date) + ' · ' + badge(a.opinion_type || 'unknown', 'b-mut') + ' ' + badge(STORE.weightLabel(a), STORE.badgeClass(a.verification_status)) + '</p>' +
          (a.quoted_language ? '<blockquote class="ml-doc">' + esc(a.quoted_language) + '</blockquote>' : note('No quoted passage retained.', 'warn')) +
          (a.courtlistener_url ? '<p><a href="' + esc(a.courtlistener_url) + '" target="_blank" rel="noopener">Open on CourtListener</a></p>' : '')
        : note('Authority not found in this case library (possible cross-case reference).', 'bad')) +
        '<button class="ml-btn" onclick="mlCloseModal()">Close</button>');
    };
  });

  $('#selectFacts').onclick = async function () {
    var m = await API('/motion/' + S.motion);
    var sel = JSON.parse(m.selected_fact_ids || '[]');
    var facts = approvedFacts();
    modal('<h2>Select approved facts</h2>' +
      (facts.length ? '' : note('No approved ARC facts for this case.', 'warn')) +
      '<form id="fSel"><select name="ids" multiple size="12" style="width:100%">' +
      facts.map(function (f) { return '<option value="' + esc(f.id) + '"' + (sel.indexOf(f.id) !== -1 ? ' selected' : '') + '>' + esc(String(f.text).slice(0, 120)) + '</option>'; }).join('') +
      '</select><div class="ml-row" style="margin-top:10px"><button class="ml-btn gold">Save selection</button></div></form>');
    $('#fSel').onsubmit = async function (e) {
      e.preventDefault();
      await API('/motion/' + S.motion, { method: 'PUT', body: { selectedFactIds: Array.prototype.map.call(e.target.ids.selectedOptions, function (o) { return o.value; }) } });
      closeModal(); render();
    };
  };
  $('#selectAuths').onclick = async function () {
    var m = await API('/motion/' + S.motion);
    var sel = JSON.parse(m.selected_authority_ids || '[]');
    var auths = S.cache.authorities || [];
    modal('<h2>Select authorities</h2>' +
      note('Only Verified, Persuasive, or Controlling authorities may be cited. Others are listed but cannot be used in a draft.', 'info') +
      '<form id="aSel"><select name="ids" multiple size="12" style="width:100%">' +
      auths.map(function (a) {
        return '<option value="' + a.id + '"' + (sel.indexOf(a.id) !== -1 ? ' selected' : '') + (STORE.isUsable(a) ? '' : ' disabled') + '>' +
          esc(a.case_name) + ' - ' + esc(a.verification_status) + (a.pinpoint ? '' : ' (no pinpoint)') + '</option>';
      }).join('') +
      '</select><div class="ml-row" style="margin-top:10px"><button class="ml-btn gold">Save selection</button></div></form>');
    $('#aSel').onsubmit = async function (e) {
      e.preventDefault();
      await API('/motion/' + S.motion, { method: 'PUT', body: { selectedAuthorityIds: Array.prototype.map.call(e.target.ids.selectedOptions, function (o) { return o.value; }) } });
      closeModal(); render();
    };
  };
  $('#markReviewed').onclick = async function () {
    try {
      await API('/motion/' + S.motion + '/prepare', { method: 'POST', body: { factsReviewed: true, authoritiesReviewed: true } });
      toast('Facts and authorities reviewed. Drafting unlocked.', 'ok'); render();
    } catch (e) { toast(e.message, 'warn'); }
  };
  $('#draftBtn').onclick = async function () {
    var m = await API('/motion/' + S.motion);
    modal('<h2>Draft with Claude</h2><p class="ml-muted">Claude drafts only from the approved facts, verified authorities, and template you selected. Any citation outside that set is rejected automatically.</p>' +
      '<form id="dForm">' + field('attorneyInstructions', 'Attorney instructions', '', 'textarea') +
      '<div class="ml-row"><button class="ml-btn gold">Generate draft proposal</button>' +
      '<button type="button" class="ml-btn" onclick="mlCloseModal()">Cancel</button></div></form><div id="dOut"></div>');
    $('#dForm').onsubmit = async function (e) {
      e.preventDefault();
      $('#dOut').innerHTML = '<p class="ml-muted">Drafting…</p>';
      try {
        var r = await API('/motion/' + S.motion + '/draft', { method: 'POST', body: {
          attorneyInstructions: e.target.attorneyInstructions.value,
          caseInfo: S.activeCase,
          approvedFacts: approvedFacts().filter(function (f) { return JSON.parse(m.selected_fact_ids || '[]').indexOf(f.id) !== -1; }),
          approvedFindings: approvedFindings(),
        } });
        $('#dOut').innerHTML = note(r.note, 'warn') +
          r.sections.map(function (s) { return '<div class="ml-panel"><strong>' + esc(s.heading) + '</strong><div class="ml-doc">' + linkifyCitations(s.body) + '</div></div>'; }).join('') +
          '<button class="ml-btn gold" id="acceptDraft">Accept into motion (still requires attorney review)</button>';
        $('#acceptDraft').onclick = async function () {
          var cur = JSON.parse((await API('/motion/' + S.motion)).sections || '[]');
          r.sections.forEach(function (s) { cur.push({ type: 'argument', heading: s.heading, body: s.body }); });
          await API('/motion/' + S.motion, { method: 'PUT', body: { sections: cur, status: 'Attorney Review' } });
          closeModal(); render(); toast('Draft added. Status set to Attorney Review.', 'ok');
        };
      } catch (err) {
        $('#dOut').innerHTML = note(err.message, 'bad') +
          (err.payload && err.payload.fabricated ? note('Rejected citations: ' + err.payload.fabricated.join('; '), 'bad') : '');
      }
    };
  };
  document.querySelectorAll('[data-editsec]').forEach(function (b) {
    b.onclick = async function () {
      var m = await API('/motion/' + S.motion);
      var sections = JSON.parse(m.sections || '[]');
      var i = Number(b.dataset.editsec), s = sections[i];
      modal('<h2>Edit section</h2><form id="secForm">' + field('heading', 'Heading', s.heading || '') +
        '<label class="ml-f"><span>Body (keep [FACT:id] and [AUTH:id] tags so every proposition stays traceable)</span>' +
        '<textarea name="body" style="min-height:300px">' + esc(s.body) + '</textarea></label>' +
        '<div class="ml-row"><button class="ml-btn gold">Save section</button></div></form>');
      $('#secForm').onsubmit = async function (e) {
        e.preventDefault();
        sections[i] = { type: s.type, heading: e.target.heading.value, body: e.target.body.value };
        await API('/motion/' + S.motion, { method: 'PUT', body: { sections: sections } });
        closeModal(); render(); toast('Section saved. Motion version incremented.', 'ok');
      };
    };
  });
  document.querySelectorAll('[data-delsec]').forEach(function (b) {
    b.onclick = async function () {
      var m = await API('/motion/' + S.motion);
      var sections = JSON.parse(m.sections || '[]');
      sections.splice(Number(b.dataset.delsec), 1);
      await API('/motion/' + S.motion, { method: 'PUT', body: { sections: sections } });
      render();
    };
  });
  document.querySelectorAll('[data-revise]').forEach(function (b) {
    b.onclick = async function () {
      var m = await API('/motion/' + S.motion);
      var sections = JSON.parse(m.sections || '[]');
      var i = Number(b.dataset.revise), s = sections[i];
      modal('<h2>Revise section with Claude</h2><form id="rForm">' +
        field('instruction', 'What should change?', '', 'textarea') +
        '<div class="ml-row"><button class="ml-btn gold">Revise</button></div></form><div id="rOut"></div>');
      $('#rForm').onsubmit = async function (e) {
        e.preventDefault();
        $('#rOut').innerHTML = '<p class="ml-muted">Revising…</p>';
        try {
          var r = await API('/motion/' + S.motion + '/revise', { method: 'POST', body: {
            section: s, instruction: e.target.instruction.value,
            approvedFacts: approvedFacts(), approvedFindings: approvedFindings(),
          } });
          $('#rOut').innerHTML = '<div class="ml-doc ml-panel">' + linkifyCitations(r.body) + '</div>' +
            '<button class="ml-btn gold" id="acceptRev">Accept revision</button>';
          $('#acceptRev').onclick = async function () {
            sections[i] = { type: s.type, heading: s.heading, body: r.body };
            await API('/motion/' + S.motion, { method: 'PUT', body: { sections: sections } });
            closeModal(); render();
          };
        } catch (err) { $('#rOut').innerHTML = note(err.message, 'bad'); }
      };
    };
  });
  $('#addSection').onclick = async function () {
    var m = await API('/motion/' + S.motion);
    var sections = JSON.parse(m.sections || '[]');
    modal('<h2>Add section</h2><form id="newSec">' +
      select('type', 'Type', 'argument', ['caption', 'title', 'introduction', 'procedural_history', 'facts', 'legal_standard', 'argument', 'irac', 'relief', 'conclusion', 'signature']) +
      field('heading', 'Heading', '') + field('body', 'Body', '', 'textarea') +
      '<div class="ml-row"><button class="ml-btn gold">Add</button></div></form>');
    $('#newSec').onsubmit = async function (e) {
      e.preventDefault();
      var d = formData(e.target);
      sections.push({ type: d.type, heading: d.heading, body: d.body });
      await API('/motion/' + S.motion, { method: 'PUT', body: { sections: sections } });
      closeModal(); render();
    };
  };
  $('#extrasForm').onsubmit = async function (e) {
    e.preventDefault();
    var d = formData(e.target);
    await API('/motion/' + S.motion, { method: 'PUT', body: { proposedOrder: d.proposedOrder, certificateOfService: d.certificateOfService } });
    toast('Saved', 'ok'); render();
  };
};

// ---------- Exhibits ---------------------------------------------------------
TABS.exhibits = async function () {
  var files = await API('/files/' + S.activeCase.caseId);
  S.cache.files = files;
  return '<div class="ml-panel"><h2>Exhibits</h2>' +
    '<p class="ml-muted">Files are stored in ARC secure storage, scoped to this case. Uploads are hashed on intake.</p>' +
    '<form id="upForm" class="ml-row"><input type="file" id="upFile" style="max-width:320px">' +
    '<input id="upTitle" placeholder="Exhibit title" class="ml-grow"><button class="ml-btn gold">Upload</button></form></div>' +
    '<div class="ml-panel"><table class="ml-table"><tr><th>#</th><th>Title / file</th><th>Size</th><th>SHA-256</th><th>Uploaded</th><th></th></tr>' +
    (files.map(function (f) {
      return '<tr><td>' + (f.exhibit_number ? badge('Exhibit ' + f.exhibit_number, 'b-gold') : badge('unnumbered', 'b-warn')) + '</td>' +
        '<td><strong>' + esc(f.exhibit_title || '') + '</strong><br><small class="ml-muted">' + esc(f.original_filename) + '</small></td>' +
        '<td>' + Math.round(f.size / 1024) + ' KB</td><td class="ml-mono">' + esc(String(f.sha256).slice(0, 12)) + '…</td>' +
        '<td><small>' + esc(String(f.uploaded_by)) + '<br>' + esc(String(f.uploaded_at).slice(0, 10)) + '</small></td>' +
        '<td><button class="ml-btn link" data-editfile="' + f.id + '">Edit</button></td></tr>';
    }).join('') || '<tr><td colspan="6" class="ml-muted">No files yet.</td></tr>') + '</table></div>';
};
TABS['exhibits:bind'] = function () {
  $('#upForm').onsubmit = async function (e) {
    e.preventDefault();
    var f = $('#upFile').files[0];
    if (!f) return toast('Choose a file', 'warn');
    var qs = '?caseId=' + encodeURIComponent(S.activeCase.caseId) + '&filename=' + encodeURIComponent(f.name) +
      '&title=' + encodeURIComponent($('#upTitle').value || '');
    var r = await fetch((window.ARC_LEGAL_API_BASE || '/legal-api') + '/files' + qs, {
      method: 'POST', credentials: 'include', headers: { 'content-type': f.type || 'application/octet-stream' }, body: f,
    });
    if (!r.ok) { var j = await r.json().catch(function () { return {}; }); return toast(j.error || 'Upload failed', 'bad'); }
    toast('Uploaded', 'ok'); render();
  };
  document.querySelectorAll('[data-editfile]').forEach(function (b) {
    b.onclick = function () {
      var f = S.cache.files.filter(function (x) { return x.id === b.dataset.editfile; })[0];
      modal('<h2>Exhibit details</h2><form id="fForm">' +
        '<div class="ml-grid2">' + field('exhibitNumber', 'Exhibit number', f.exhibit_number || '', 'number') +
        field('exhibitTitle', 'Exhibit title', f.exhibit_title || '') + '</div>' +
        select('confidentiality', 'Confidentiality', f.confidentiality || 'standard', ['standard', 'confidential', 'sealed']) +
        field('attorneyNotes', 'Attorney notes (never exported in a filing)', f.attorney_notes || '', 'textarea') +
        '<div class="ml-row"><button class="ml-btn gold">Save</button></div></form>');
      $('#fForm').onsubmit = async function (e) {
        e.preventDefault();
        var d = formData(e.target);
        d.exhibitNumber = d.exhibitNumber ? Number(d.exhibitNumber) : null;
        await API('/file/' + f.id, { method: 'PUT', body: d });
        closeModal(); render();
      };
    };
  });
};

// ---------- Filing Review ----------------------------------------------------
TABS.review = async function () {
  var motions = S.cache.motions || await API('/motions/' + S.activeCase.caseId);
  S.cache.motions = motions;
  return '<div class="ml-panel"><h2>Filing review</h2>' +
    '<label class="ml-f"><span>Motion</span><select id="revMotion">' +
    motions.map(function (m) { return '<option value="' + m.id + '"' + (m.id === S.motion ? ' selected' : '') + '>' + esc(m.title) + ' - ' + esc(m.status) + '</option>'; }).join('') +
    '</select></label><button class="ml-btn gold" id="runReview">Run filing review</button></div><div id="revOut"></div>';
};
TABS['review:bind'] = function () {
  $('#runReview').onclick = async function () {
    var id = $('#revMotion').value;
    var c = S.activeCase;
    var qs = '?caseId=' + encodeURIComponent(c.caseId) + '&client=' + encodeURIComponent(c.client) +
      '&docket=' + encodeURIComponent(c.docket) + '&court=' + encodeURIComponent(c.court);
    var r = await API('/motion/' + id + '/review' + qs);
    $('#revOut').innerHTML = '<div class="ml-panel">' +
      (r.errors.length ? r.errors.map(function (x) { return note('BLOCKING: ' + x, 'bad'); }).join('') : note('No blocking issues.', 'ok')) +
      r.warnings.map(function (x) { return note('Warning: ' + x, 'warn'); }).join('') +
      (r.ok ? '<button class="ml-btn gold" id="approveBtn">Approve for filing</button>' +
        (STORE.CONTROLLING_ROLES.indexOf(S.user.role) === -1 ? note('Your role (' + S.user.role + ') cannot approve a motion for filing.', 'info') : '')
        : note('Approval is blocked until every blocking issue is resolved.', 'info')) +
      '</div>';
    var ap = $('#approveBtn');
    if (ap) ap.onclick = function () {
      modal('<h2>Attorney approval</h2>' +
        note('Approval records your identity, the motion version, and your statement. Any later edit removes this approval and requires reapproval.', 'info') +
        '<form id="apForm">' + field('attorneyName', 'Attorney name', S.activeCase.attorney || '') +
        field('statement', 'Approval statement', 'Reviewed and approved for filing.', 'textarea') +
        field('conditions', 'Conditions or notes', '', 'textarea') +
        '<div class="ml-row"><button class="ml-btn gold">Record approval</button>' +
        '<button type="button" class="ml-btn" onclick="mlCloseModal()">Cancel</button></div></form>');
      $('#apForm').onsubmit = async function (e) {
        e.preventDefault();
        var d = formData(e.target);
        d.expectedCase = { caseId: S.activeCase.caseId, client: S.activeCase.client, docket: S.activeCase.docket, court: S.activeCase.court };
        try {
          await API('/motion/' + id + '/approve', { method: 'POST', body: d });
          closeModal(); toast('Approved for filing', 'ok'); setTab('export');
        } catch (err) { toast(err.message, 'bad'); }
      };
    };
  };
};

// ---------- Export & Versions ------------------------------------------------
TABS.export = async function () {
  var motions = S.cache.motions || await API('/motions/' + S.activeCase.caseId);
  var id = S.motion || (motions[0] && motions[0].id);
  if (!id) return '<div class="ml-panel"><p class="ml-muted">No motions to export.</p></div>';
  var m = await API('/motion/' + id);
  var versions = await API('/motion/' + id + '/versions');
  var base = (window.ARC_LEGAL_API_BASE || '/legal-api') + '/motion/' + id + '/export/';
  var approved = m.status === 'Approved for Filing' || m.status === 'Filed';
  return '<div class="ml-panel"><h2>' + esc(m.title) + '</h2>' +
    '<p>' + badge(m.status, statusClass(m.status)) + ' ' + badge('v' + m.version, 'b-mut') + '</p>' +
    '<div class="ml-row"><a class="ml-btn" href="' + base + 'html" target="_blank">Attorney HTML</a>' +
    '<a class="ml-btn" href="' + base + 'docx">DOCX</a>' +
    (approved ? '<a class="ml-btn gold" href="' + base + 'zip">Filing ZIP</a>' : '<button class="ml-btn" disabled>Filing ZIP</button>') +
    '</div>' +
    (approved ? '' : note('The filing ZIP is generated only from an approved motion.', 'info')) +
    note('Filing exports exclude attorney notes, rejected findings, research notes, AI prompts, other-case material, and all system configuration.', 'info') +
    '</div>' +
    '<div class="ml-panel"><h2>Version history</h2><table class="ml-table"><tr><th>Version</th><th>Saved by</th><th>When</th></tr>' +
    (versions.map(function (v) {
      return '<tr><td class="ml-mono">v' + v.version + (v.version === m.approved_version ? ' ' + badge('approved', 'b-ok') : '') + '</td>' +
        '<td>' + esc(v.saved_by) + '</td><td class="ml-mono">' + esc(String(v.created_at).slice(0, 19).replace('T', ' ')) + '</td></tr>';
    }).join('') || '<tr><td colspan="3" class="ml-muted">No prior versions.</td></tr>') + '</table></div>';
};

// ---------- boot -------------------------------------------------------------
async function boot() {
  S.activeCase = readActiveCase();
  try { S.user = await API('/me'); }
  catch (e) {
    S.user = null;
    document.getElementById('mlView').innerHTML = note(e.message, 'bad');
    renderCaseBar();
    return;
  }
  renderCaseBar();
  render();
}
// React to ARC case changes broadcast by the shared bridge.
window.addEventListener('arc:case-updated', function () { S.activeCase = readActiveCase(); S.motion = null; renderCaseBar(); render(); });
document.addEventListener('DOMContentLoaded', boot);
if (document.readyState !== 'loading') boot();

window.ARCMotionLegal = { state: S, recommend: recommend, iracToArgument: iracToArgument, readActiveCase: readActiveCase, linkifyCitations: linkifyCitations };
})();
