// Authority store: status vocabulary, weight rules, and warning generation.
// Single source of truth for what an authority means in ARC. No network calls.
(function () {
'use strict';

var STATUSES = ['Imported', 'Located', 'Pinpoint Needed', 'Verified', 'Persuasive', 'Controlling', 'Superseded', 'Do Not Use'];
// Statuses at which an authority may be cited in a draft.
var USABLE = ['Verified', 'Persuasive', 'Controlling'];
// Only these ARC roles may mark an authority Controlling.
var CONTROLLING_ROLES = ['attorney', 'supervisor', 'administrator'];
var MA_COURTS = ['mass', 'massappct', 'massdistct', 'masssuperct', 'massland', 'massjuvct'];
// A concurrence or dissent is not the holding of the court.
var NON_HOLDING = ['concurrence', 'dissent', 'concurrence in part'];

function badgeClass(status) {
  if (status === 'Controlling') return 'b-gold';
  if (status === 'Verified' || status === 'Persuasive') return 'b-ok';
  if (status === 'Superseded' || status === 'Do Not Use') return 'b-bad';
  if (status === 'Pinpoint Needed' || status === 'Located') return 'b-warn';
  return 'b-mut';
}

function canMarkControlling(authority, role) {
  if (CONTROLLING_ROLES.indexOf(role) === -1) {
    return { ok: false, reason: 'Only an attorney or authorized legal reviewer may mark an authority as Controlling.' };
  }
  var court = String(authority.cl_court_id || '');
  if (MA_COURTS.indexOf(court) === -1 && court !== 'scotus') {
    return { ok: false, reason: 'This court does not control in a Massachusetts criminal matter. Use Persuasive.' };
  }
  if (NON_HOLDING.indexOf(String(authority.opinion_type || '')) !== -1) {
    return { ok: false, reason: 'A ' + authority.opinion_type + ' is not the holding of the court.' };
  }
  if (!authority.pinpoint) return { ok: false, reason: 'A pinpoint citation is required first.' };
  return { ok: true };
}

/** Warnings surfaced next to any authority in the UI. */
function warnings(a) {
  var w = [];
  if (USABLE.indexOf(a.verification_status) === -1) w.push('Not yet usable in a draft (status: ' + a.verification_status + ').');
  if (!a.pinpoint) w.push('Missing pinpoint citation.');
  if (!a.quoted_language) w.push('No quoted passage retained.');
  if (a.verification_status === 'Superseded') w.push('Superseded: do not rely on this authority.');
  if (a.verification_status === 'Do Not Use') w.push('Flagged Do Not Use.');
  if (NON_HOLDING.indexOf(String(a.opinion_type || '')) !== -1) {
    w.push('This is a ' + a.opinion_type + ', not the holding of the court.');
  }
  if (a.date_verified && (Date.now() - Date.parse(a.date_verified)) > 180 * 86400000) {
    w.push('Not re-checked in over 180 days.');
  }
  if (a.verification_status === 'Controlling') {
    var court = String(a.cl_court_id || '');
    if (MA_COURTS.indexOf(court) === -1 && court !== 'scotus') w.push('Marked Controlling but the court may not control here.');
  }
  if (/9A/.test(String(a.citation || '')) || /rule 9a/i.test(String(a.case_name || ''))) {
    w.push('Civil Rule 9A material: not for automatic use in a criminal motion.');
  }
  return w;
}

/** Display label that never overstates weight. */
function weightLabel(a) {
  if (a.verification_status === 'Controlling') return 'Controlling';
  if (a.verification_status === 'Persuasive') return 'Persuasive';
  if (a.verification_status === 'Verified') return 'Verified (weight not yet assigned)';
  return a.verification_status;
}

window.ARCAuthorityStore = {
  STATUSES: STATUSES,
  USABLE: USABLE,
  CONTROLLING_ROLES: CONTROLLING_ROLES,
  MA_COURTS: MA_COURTS,
  NON_HOLDING: NON_HOLDING,
  badgeClass: badgeClass,
  canMarkControlling: canMarkControlling,
  warnings: warnings,
  weightLabel: weightLabel,
  isUsable: function (a) { return USABLE.indexOf(a.verification_status) !== -1; }
};
})();
