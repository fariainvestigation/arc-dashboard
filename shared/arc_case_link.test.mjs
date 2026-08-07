import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

const SRC = fs.readFileSync(new URL('./arc_case_link.js', import.meta.url), 'utf8');

/** Minimal browser surface: localStorage, document event bus, CustomEvent. */
function makeWindow() {
  const store = new Map();
  const docHandlers = {}, winHandlers = {};
  const win = {
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k),
    },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    document: {
      addEventListener: (t, fn) => { (docHandlers[t] = docHandlers[t] || []).push(fn); },
      dispatchEvent: e => { (docHandlers[e.type] || []).forEach(fn => fn(e)); return true; },
      querySelectorAll: () => [],
    },
    addEventListener: (t, fn) => { (winHandlers[t] = winHandlers[t] || []).push(fn); },
    console,
  };
  win.window = win;
  win.__seen = docHandlers;
  return win;
}

function boot(unified) {
  const win = makeWindow();
  if (unified) win.ARCUnified = unified;
  vm.createContext(win);
  vm.runInContext(SRC, win);
  return win;
}

const CASE = 'case_2584CR00681';

test('a blank field is filled by the first module that learns it', () => {
  const win = boot();
  win.ARCLink.contribute(CASE, { clientName: 'Jane Roe' }, { source: 'intake', tier: 'entered' });
  win.ARCLink.contribute(CASE, { court: 'Suffolk Superior Court', county: 'Suffolk' },
    { source: 'discovery-extraction', tier: 'extracted' });

  const m = win.ARCLink.get(CASE);
  assert.equal(m.clientName, 'Jane Roe');
  assert.equal(m.court, 'Suffolk Superior Court');
  assert.equal(m.county, 'Suffolk');
});

test('an existing value is never silently overwritten by a weaker source', () => {
  const win = boot();
  win.ARCLink.contribute(CASE, { docket: '2584CR00681' }, { source: 'investigator', tier: 'entered' });
  win.ARCLink.contribute(CASE, { docket: '2584CR00618' }, { source: 'ai-extraction', tier: 'extracted' });

  assert.equal(win.ARCLink.get(CASE).docket, '2584CR00681', 'held value stands');
  const c = win.ARCLink.conflicts(CASE);
  assert.equal(c.length, 1);
  assert.equal(c[0].field, 'docket');
  assert.equal(c[0].proposed, '2584CR00618');
  assert.match(c[0].note, /Identity field disagreement/);
});

test('a higher-authority source corrects, and the old value is kept on the record', () => {
  const win = boot();
  win.ARCLink.contribute(CASE, { court: 'Suffolk District' }, { source: 'ai-extraction', tier: 'extracted' });
  win.ARCLink.contribute(CASE, { court: 'Suffolk Superior Court' }, { source: 'case-dashboard', tier: 'registry' });

  assert.equal(win.ARCLink.get(CASE).court, 'Suffolk Superior Court');
  const all = win.ARCLink.conflicts(CASE, true);
  assert.equal(all[0].superseded, 'Suffolk District');
  assert.equal(all[0].resolved, true);
});

test('formatting differences corroborate instead of conflicting', () => {
  const win = boot();
  win.ARCLink.contribute(CASE, { docket: '2584CR00681' }, { source: 'intake', tier: 'entered' });
  win.ARCLink.contribute(CASE, { docket: '2584-CR-00681' }, { source: 'court-printout', tier: 'entered' });

  assert.equal(win.ARCLink.conflicts(CASE).length, 0, 'no conflict on punctuation');
  const p = win.ARCLink.provenance(CASE, 'docket');
  // Arrays cross the vm boundary with a different prototype, so compare structurally.
  assert.deepEqual(Array.from(p.corroboratedBy), ['court-printout']);
});

test('aliases from every module normalize to one field', () => {
  const win = boot();
  win.ARCLink.contribute(CASE, { docketNumber: '2584CR00681' }, { source: 'motion', tier: 'entered' });
  win.ARCLink.contribute(CASE, { defendantName: 'Jane Roe' }, { source: 'oui-app', tier: 'entered' });
  const m = win.ARCLink.get(CASE);
  assert.equal(m.docket, '2584CR00681');
  assert.equal(m.clientName, 'Jane Roe');
  assert.equal(m.docketNumber, '2584CR00681', 'alias exposed back out for consumers');
});

test('new information rebroadcasts so other modules autofill', () => {
  const win = boot();
  const seen = [];
  win.document.addEventListener('arc:case-context', e => seen.push(e.detail));

  win.ARCLink.contribute(CASE, { clientName: 'Jane Roe' }, { source: 'intake', tier: 'entered' });
  win.ARCLink.contribute(CASE, { attorney: 'F. Napolitano' }, { source: 'assignment', tier: 'entered' });

  assert.equal(seen.length, 2, 'one broadcast per material change');
  assert.equal(seen[1].attorney, 'F. Napolitano');
  assert.equal(seen[1].clientName, 'Jane Roe', 'broadcast carries the full merged record');
});

test('a corroboration does not rebroadcast', () => {
  const win = boot();
  const seen = [];
  win.ARCLink.contribute(CASE, { court: 'Suffolk Superior' }, { source: 'a', tier: 'entered' });
  win.document.addEventListener('arc:case-context', e => seen.push(e.detail));
  win.ARCLink.contribute(CASE, { court: 'Suffolk Superior' }, { source: 'b', tier: 'entered' });
  assert.equal(seen.length, 0, 'nothing changed, so nothing is republished');
});

test('an inbound broadcast is absorbed without echoing back', () => {
  const win = boot();
  let depth = 0, max = 0;
  win.document.addEventListener('arc:case-context', () => {
    depth++; max = Math.max(max, depth); depth--;
  });
  win.document.dispatchEvent(new win.CustomEvent('arc:case-context', {
    detail: { caseId: CASE, matter: 'Commonwealth v. Roe', docket: '2584CR00681' },
  }));
  assert.ok(max <= 1, 'no broadcast loop');
  assert.equal(win.ARCLink.get(CASE).matter, 'Commonwealth v. Roe');
});

test('missing() reports what the case still needs', () => {
  const win = boot();
  win.ARCLink.contribute(CASE, { clientName: 'Jane Roe', docket: '2584CR00681' },
    { source: 'intake', tier: 'entered' });
  const gaps = win.ARCLink.missing(CASE);
  assert.ok(gaps.includes('court'));
  assert.ok(gaps.includes('attorney'));
  assert.ok(!gaps.includes('clientName'));
});

test('resolving a conflict sets the value and republishes', () => {
  const win = boot();
  win.ARCLink.contribute(CASE, { docket: '2584CR00681' }, { source: 'a', tier: 'entered' });
  win.ARCLink.contribute(CASE, { docket: '2584CR00618' }, { source: 'b', tier: 'entered' });
  const seen = [];
  win.document.addEventListener('arc:case-context', e => seen.push(e.detail));

  const ok = win.ARCLink.resolveConflict(CASE, 0, '2584CR00618', 'raf@arc.test');
  assert.equal(ok, true);
  assert.equal(win.ARCLink.get(CASE).docket, '2584CR00618');
  assert.equal(win.ARCLink.conflicts(CASE).length, 0);
  assert.equal(seen.length, 1);
});

// ---- ARCBridge shim ---------------------------------------------------------

test('ARCBridge.getActiveCase answers in the shape Motion & Legal expects', () => {
  const win = boot({ getCase: () => ({ caseId: CASE }) });
  win.ARCLink.contribute(CASE, {
    matter: 'Commonwealth v. Roe', clientName: 'Jane Roe', docket: '2584CR00681',
    court: 'Suffolk Superior Court', county: 'Suffolk', attorney: 'F. Napolitano',
    investigator: 'R. Faria', charges: ['OUI liquor, second offense'],
  }, { source: 'case-dashboard', tier: 'registry' });

  const c = win.ARCBridge.getActiveCase();
  assert.equal(c.caseId, CASE);
  assert.equal(c.clientName, 'Jane Roe');
  assert.equal(c.docket, '2584CR00681');
  assert.equal(c.county, 'Suffolk', 'county now reaches the motion; it was dropped before');
  assert.equal(c.attorney, 'F. Napolitano');
  assert.equal(c.charges, 'OUI liquor, second offense');
});

test('only approved findings cross into Motion & Legal', () => {
  const win = boot({
    getCase: () => ({ caseId: CASE }),
    getFindings: () => ([
      { id: 'f1', text: 'Single-channel sample terminated as REFUSAL.', source: 'OAT record p.4', reviewStatus: 'approved', reviewedBy: 'R. Faria' },
      { id: 'f2', text: 'Officer may have miscounted the observation period.', source: 'BWC 12:03', reviewStatus: 'suggested' },
      { id: 'f3', text: 'Rejected theory.', source: 'x', reviewStatus: 'rejected' },
    ]),
  });
  const f = win.ARCBridge.getApprovedFindings(CASE);
  assert.equal(f.length, 1);
  assert.equal(f[0].id, 'f1');
  assert.equal(f[0].approvedBy, 'R. Faria');
});

test('approved facts require a source and are deduplicated across record types', () => {
  const win = boot({
    getCase: () => ({ caseId: CASE }),
    getFindings: () => ([
      { id: 'f1', text: 'Sequential test shows a REFUSAL.', source: 'OAT p.4', reviewStatus: 'approved' },
      { id: 'f2', text: 'Unsourced conclusion.', reviewStatus: 'approved' },
    ]),
    getEvidenceRecords: () => ([
      { id: 'e1', description: 'Sequential test shows a REFUSAL.', citation: 'Exhibit 1', status: 'verified' },
      { id: 'e2', description: 'Draft note.', citation: 'Exhibit 2', status: 'draft' },
    ]),
  });
  const facts = win.ARCBridge.getApprovedFacts(CASE);
  assert.equal(facts.length, 1, 'unsourced dropped, unapproved dropped, duplicate merged');
  assert.equal(facts[0].source, 'OAT p.4');
});

test('the bridge degrades safely when ARCUnified is absent', () => {
  const win = boot();
  assert.equal(win.ARCBridge.getActiveCase(), null);
  assert.equal(Array.from(win.ARCBridge.getApprovedFacts(CASE)).length, 0);
  assert.equal(Array.from(win.ARCBridge.getApprovedFindings(CASE)).length, 0);
});

test('a real ARCBridge, if one ever ships, is not overwritten', () => {
  const win = makeWindow();
  win.ARCBridge = { getActiveCase: () => ({ caseId: 'real' }) };
  vm.createContext(win);
  vm.runInContext(SRC, win);
  assert.equal(win.ARCBridge.getActiveCase().caseId, 'real');
  assert.equal(typeof win.ARCBridge.getApprovedFacts, 'function', 'missing methods still filled in');
});

test('enrichment survives a reload from the ledger', () => {
  const win = boot();
  win.ARCLink.contribute(CASE, { court: 'Suffolk Superior Court' }, { source: 'a', tier: 'entered' });
  const saved = win.localStorage.getItem('arc_case_field_ledger_v1');

  const win2 = makeWindow();
  win2.localStorage.setItem('arc_case_field_ledger_v1', saved);
  vm.createContext(win2);
  vm.runInContext(SRC, win2);
  assert.equal(win2.ARCLink.get(CASE).court, 'Suffolk Superior Court');
});
