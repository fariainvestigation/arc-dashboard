// ARC MOTION automated tests. Run with: npm test
// Uses an isolated temp database and data directory; never touches real case data.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import os from 'os';
import path from 'path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-test-'));
process.env.ARC_DATA_DIR = tmp;
process.env.ARC_DB_PATH = path.join(tmp, 'test.sqlite');
process.env.ARC_NO_LISTEN = '1';

const { app } = await import('../server/server.mjs');
const { db } = await import('../server/db.mjs');
const { findPlaceholders, loadMotionBundle, motionHtml, packetChecks, exhibitLabel } = await import('../server/services/export.mjs');
const { recommend, MOTION_BANK } = await import('../server/services/recommend.mjs');

// tiny in-process HTTP harness (top-level await so every test sees a live server)
import http from 'http';
const server = http.createServer(app);
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
process.on('beforeExit', () => server.close());
const req = async (method, url, body) => {
  const r = await fetch(base + url, {
    method, headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const ct = r.headers.get('content-type') || '';
  return { status: r.status, data: ct.includes('json') ? await r.json() : await r.text() };
};

let caseA, caseB;

test('case creation', async () => {
  caseA = (await req('POST', '/api/cases', { client_name: 'Test Client A', docket_number: '1111CR1111', county: 'Suffolk', court_department: 'Superior Court', charges: [{ charge: 'Test charge', statute: 'G.L. c. 0' }] })).data;
  caseB = (await req('POST', '/api/cases', { client_name: 'Test Client B', docket_number: '2222CR2222' })).data;
  assert.ok(caseA.id && caseB.id && caseA.id !== caseB.id);
  assert.match(caseA.arc_case_id, /^ARC-\d{4}-\d{4}$/);
});

test('fact creation with page-level source and verification audit', async () => {
  const f = (await req('POST', `/api/cases/${caseA.id}/facts`, { statement: 'Officer stopped the vehicle without observing any violation.', category: 'stop', page: '3', asserted_by: 'Client', verification: 'unverified' })).data;
  assert.equal(f.page, '3');
  const v = (await req('PUT', `/api/facts/${f.id}`, { verification: 'verified' })).data;
  assert.equal(v.verification, 'verified');
  const audit = db.prepare("SELECT * FROM audit_log WHERE action='fact.verify' AND record_id=?").get(f.id);
  assert.ok(audit, 'verification is audited');
});

test('CASE ISOLATION: facts from Case A never appear in Case B', async () => {
  await req('POST', `/api/cases/${caseB.id}/facts`, { statement: 'Case B only fact.', category: 'other' });
  const factsA = (await req('GET', `/api/cases/${caseA.id}/facts`)).data;
  const factsB = (await req('GET', `/api/cases/${caseB.id}/facts`)).data;
  assert.ok(factsA.every(f => !f.statement.includes('Case B')));
  assert.ok(factsB.every(f => !f.statement.includes('Officer stopped')));
  assert.ok(factsA.every(f => f.case_id === caseA.id) && factsB.every(f => f.case_id === caseB.id));
});

test('conflict handling never auto-resolves', async () => {
  const f1 = (await req('POST', `/api/cases/${caseA.id}/facts`, { statement: 'Report states stop at 22:10.', category: 'timeline', asserted_by: 'Officer' })).data;
  const f2 = (await req('POST', `/api/cases/${caseA.id}/facts`, { statement: 'BWC shows stop at 22:41.', category: 'timeline', asserted_by: 'BWC' })).data;
  const c = (await req('POST', `/api/cases/${caseA.id}/conflicts`, { fact_a: f1.id, fact_b: f2.id, conflict_type: 'times' })).data;
  assert.equal(c.status, 'unresolved');
  const upd = (await req('PUT', `/api/conflicts/${c.id}`, { status: 'material' })).data;
  assert.equal(upd.status, 'material');
});

test('motion recommendation engine classifies from facts', async () => {
  const facts = db.prepare('SELECT * FROM facts WHERE case_id=?').all(caseA.id);
  const recs = recommend(caseA, facts);
  const stop = recs.find(r => r.title === 'Motion to Suppress Stop');
  assert.ok(stop, 'stop-category fact triggers suppression motion');
  assert.equal(stop.status, 'Draft Now', 'verified stop fact -> Draft Now');
  assert.ok(recs.find(r => r.title === 'Motion to Compel Discovery' && r.status === 'Draft Now'), 'baseline discovery motion present');
  assert.ok(MOTION_BANK.length === 154, 'full 154-entry bank loaded');
  const r = (await req('POST', `/api/cases/${caseA.id}/recommend`)).data;
  assert.ok(r.created > 0);
});

let motionA;
test('motion generation, IRAC creation, IRAC -> argument', async () => {
  motionA = db.prepare("SELECT * FROM motions WHERE case_id=? AND title='Motion to Suppress Stop'").get(caseA.id);
  assert.ok(motionA);
  const irac = (await req('POST', `/api/cases/${caseA.id}/irac`, {
    motion_id: motionA.id, label: 'Unlawful stop',
    issue: 'Whether the stop was supported by reasonable suspicion.',
    rule_constitutional: 'Article 14; Fourth Amendment',
    app_defense_facts: 'The officer observed no traffic violation before the stop.',
    concl_result: 'All fruits of the stop must be suppressed.',
  })).data;
  const arg = (await req('POST', `/api/irac/${irac.id}/to-argument`)).data;
  assert.match(arg.body, /Issue\./);
  assert.match(arg.body, /AUTHORITY REQUIRES VERIFICATION/, 'unverified authorities are flagged, never silently accepted');
  const sec = (await req('POST', `/api/motions/${motionA.id}/sections`, { section_type: 'irac', heading: arg.heading, body: arg.body, irac_id: irac.id })).data;
  assert.ok(sec.id);
});

test('placeholder detection', () => {
  const found = findPlaceholders('Now comes [CLIENT NAME] before [COURT] on [DATE]. No placeholder here.');
  assert.deepEqual(found.sort(), ['[CLIENT NAME]', '[COURT]', '[DATE]'].sort());
  assert.equal(findPlaceholders('clean text').length, 0);
});

test('TEMPLATE CONTAMINATION: no sample client info in a new case', async () => {
  const fresh = (await req('POST', '/api/cases', { client_name: 'Fresh Client' })).data;
  const motions = (await req('GET', `/api/cases/${fresh.id}/motions`)).data;
  assert.equal(motions.length, 0);
  const m = (await req('POST', `/api/cases/${fresh.id}/motions`, { title: 'Motion to Compel Discovery' })).data;
  const bundle = loadMotionBundle(m.id);
  const html = motionHtml(bundle);
  assert.ok(!/Hernandez/i.test(html), 'no hard-coded sample caption');
  assert.ok(!/Jordan Sample|Test Client A/.test(html), 'no other client leaks into a new case document');
  assert.match(html, /FRESH CLIENT/, 'caption uses this case only');
});

test('authority verification warnings + civil Rule 9A guard', async () => {
  const a = (await req('POST', `/api/cases/${caseA.id}/authorities`, { name: 'Superior Court Rule 9A', citation: 'Mass. Super. Ct. R. 9A', level: 'secondary' })).data;
  assert.ok(a.warnings.some(w => /9A/.test(w)), 'Rule 9A civil material warns');
  assert.ok(a.warnings.some(w => /pinpoint/i.test(w)));
  // 9A reference inside a criminal motion triggers a packet warning
  await req('POST', `/api/motions/${motionA.id}/sections`, { section_type: 'argument', heading: 'TEST', body: 'Pursuant to Rule 9A the parties conferred.' });
  const checks = packetChecks(loadMotionBundle(motionA.id));
  assert.ok(checks.some(c => /Rule 9A/.test(c.msg)), 'civil 9A is never silently applied to a criminal motion');
});

test('approval requires explicit attorney action', async () => {
  const r1 = await req('PUT', `/api/motions/${motionA.id}`, { status: 'Approved for Filing' });
  assert.equal(r1.status, 400, 'approval without attorney name is rejected');
  const r2 = await req('PUT', `/api/motions/${motionA.id}`, { status: 'Approved for Filing', approved_by: 'Test Attorney' });
  assert.equal(r2.status, 200);
  assert.equal(r2.data.status, 'Approved for Filing');
});

test('exhibit numbering + renumbering updates motion references', async () => {
  const e1 = (await req('POST', `/api/cases/${caseA.id}/exhibits`, { motion_id: motionA.id, title: 'BWC still frame' })).data;
  const e2 = (await req('POST', `/api/cases/${caseA.id}/exhibits`, { motion_id: motionA.id, title: 'CAD log excerpt' })).data;
  assert.equal(e1.number_value, 1); assert.equal(e2.number_value, 2);
  const sec = (await req('POST', `/api/motions/${motionA.id}/sections`, { section_type: 'argument', heading: 'EXH REF', body: 'See Exhibit 1 (BWC) and Exhibit 2 (CAD).' })).data;
  // reverse the order
  const upd = (await req('POST', `/api/motions/${motionA.id}/renumber-exhibits`, { order: [e2.id, e1.id] })).data;
  assert.equal(upd.find(x => x.id === e2.id).number_value, 1);
  assert.equal(upd.find(x => x.id === e1.id).number_value, 2);
  const after = db.prepare('SELECT body FROM motion_sections WHERE id=?').get(sec.id).body;
  assert.equal(after, 'See Exhibit 2 (BWC) and Exhibit 1 (CAD).', 'cross-references swapped with the renumbering');
});

test('exports: HTML, DOCX, PDF, filing ZIP', async () => {
  const html = await req('GET', `/api/motions/${motionA.id}/export/html`);
  assert.equal(html.status, 200);
  assert.match(html.data, /COMMONWEALTH OF MASSACHUSETTS/);
  for (const fmt of ['docx', 'pdf', 'zip']) {
    const r = await fetch(base + `/api/motions/${motionA.id}/export/${fmt}`);
    assert.equal(r.status, 200, fmt + ' export succeeds');
    const buf = Buffer.from(await r.arrayBuffer());
    assert.ok(buf.length > 1000, fmt + ' export is non-trivial');
    if (fmt === 'pdf') assert.equal(buf.subarray(0, 4).toString(), '%PDF');
    if (fmt !== 'pdf') assert.equal(buf.subarray(0, 2).toString(), 'PK', fmt + ' is a valid zip container');
  }
});

test('filing export contains no API keys and no attorney-only notes', async () => {
  process.env.ARC_AI_KEY = 'sk-TESTSECRET-not-real';
  await req('PUT', `/api/exhibits/${db.prepare('SELECT id FROM exhibits WHERE case_id=? LIMIT 1').get(caseA.id).id}`, { attorney_notes: 'PRIVILEGED-NOTE-DO-NOT-EXPORT' });
  const r = await fetch(base + `/api/motions/${motionA.id}/export/html`);
  const text = await r.text();
  assert.ok(!text.includes('sk-TESTSECRET'), 'no API key in export');
  assert.ok(!text.includes('PRIVILEGED-NOTE-DO-NOT-EXPORT'), 'attorney-only notes never exported');
  delete process.env.ARC_AI_KEY;
});

test('no API key appears in browser source', () => {
  const files = ['app/index.html', 'app/assets/app.js', 'app/assets/styles.css'];
  for (const f of files) {
    const src = fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    assert.ok(!/sk-[A-Za-z0-9]{8,}|api[_-]?key\s*[:=]\s*['"][A-Za-z0-9]/i.test(src), f + ' contains no API key');
  }
});

test('path traversal is blocked on knowledge files', async () => {
  const r = await req('GET', '/api/knowledge/file?path=..%2F.env');
  assert.equal(r.status, 404);
});

test('backup and restore data round-trip', async () => {
  const r = (await req('POST', `/api/cases/${caseA.id}/backup`)).data;
  assert.ok(fs.existsSync(r.path), 'backup zip written');
  assert.ok(fs.statSync(r.path).size > 500);
});

test('exhibit label schemes', () => {
  assert.equal(exhibitLabel({ number_value: 2, numbering_scheme: 'numeric' }), 'Exhibit 2');
  assert.equal(exhibitLabel({ number_value: 2, numbering_scheme: 'alpha' }), 'Exhibit B');
  assert.equal(exhibitLabel({ number_value: 1, numbering_scheme: 'defendant_alpha' }), "Defendant's Exhibit A");
  assert.equal(exhibitLabel({ number_value: 3, numbering_scheme: 'numeric', label: 'Affidavit Exhibit A' }), 'Affidavit Exhibit A');
});
