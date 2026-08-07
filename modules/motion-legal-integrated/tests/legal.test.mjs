// ARC Motion & Legal integration tests. Every test exercises the shipped Worker code.
import { test } from 'node:test';
import assert from 'node:assert';
import { makeEnv, req, jsonOf, seedUser, stubFetch } from './harness.mjs';
import { handleRequest, filingReview, attorneyHtml } from '../../../cloudflare-worker/legal/legal_worker.mjs';
import { findFabricatedCitations, USABLE_STATUSES } from '../../../cloudflare-worker/legal/providers.mjs';
import { normalizeOpinionType, pickOpinionText } from '../../../cloudflare-worker/legal/arc_courtlistener_client.mjs';

const CASE_A = 'arc-case-aaa';
const CASE_B = 'arc-case-bbb';
const IDS = {
  valid: { email: 'investigator@arc.test' },
  attorney: { email: 'attorney@arc.test' },
  outsider: { email: 'outsider@arc.test' },
  stranger: { email: 'never-seen@arc.test' },
};

async function baseEnv() {
  const env = makeEnv(IDS);
  await seedUser(env, 'investigator@arc.test', 'investigator', [CASE_A]);
  await seedUser(env, 'attorney@arc.test', 'attorney', [CASE_A, CASE_B]);
  await seedUser(env, 'outsider@arc.test', 'investigator', [CASE_B]);
  return env;
}
const call = (env, m, u, o) => req(handleRequest, env, m, u, o);

async function makeAuthority(env, caseId, over = {}) {
  const r = await call(env, 'POST', '/legal-api/import-authority', {
    token: 'attorney',
    body: {
      caseId, caseName: 'Commonwealth v. Tyree', citation: '455 Mass. 676', court: 'Massachusetts Supreme Judicial Court',
      clCourtId: 'mass', clDocketId: 'd1', clClusterId: 'c1', clOpinionId: 'o1', opinionType: 'lead',
      date: '2010-01-01', ...over,
    },
  });
  return jsonOf(r);
}
async function verify(env, id, status = 'Verified', token = 'attorney', extra = {}) {
  const r = await call(env, 'POST', '/legal-api/verify-authority', {
    token, body: { id, status, pinpoint: '682', quotedLanguage: 'sample verified passage', ...extra },
  });
  return { status: r.status, body: await jsonOf(r) };
}
async function makeMotion(env, caseId, over = {}) {
  const r = await call(env, 'POST', '/legal-api/motions', {
    token: 'attorney', body: { caseId, title: 'Motion to Suppress Search', sections: [], ...over },
  });
  return jsonOf(r);
}

// 1 ---------------------------------------------------------------------------
test('ARC active-case integration: module reads the shared case, never creates one', async () => {
  const env = await baseEnv();
  // No case-creation route exists in the module at all.
  const r = await call(env, 'POST', '/legal-api/cases', { token: 'attorney', body: { clientName: 'X' } });
  assert.equal(r.status, 404, 'the legal module exposes no case-creation endpoint');
  // Work is always scoped by the ARC case id supplied by the shared system.
  const m = await makeMotion(env, CASE_A);
  assert.equal(m.case_id, CASE_A);
});

// 2 ---------------------------------------------------------------------------
test('missing active case blocks work', async () => {
  const env = await baseEnv();
  const r = await call(env, 'POST', '/legal-api/motions', { token: 'attorney', body: { title: 'No case' } });
  assert.equal(r.status, 400);
  assert.match((await jsonOf(r)).error, /No active ARC case selected/);
});

// 3 ---------------------------------------------------------------------------
test('Cloudflare Access identity failure is rejected; unknown users go pending, never investigator', async () => {
  const env = await baseEnv();
  const bad = await call(env, 'GET', '/legal-api/me', { token: 'forged' });
  assert.equal(bad.status, 401, 'invalid Access JWT rejected');

  const none = await handleRequest(new Request('https://arcdefensereport.com/legal-api/me'), env);
  assert.equal(none.status, 401, 'missing Access assertion rejected');

  const unknown = await call(env, 'GET', '/legal-api/me', { token: 'stranger' });
  assert.equal(unknown.status, 403);
  assert.match((await jsonOf(unknown)).error, /pending/i);
  const row = await env.DB.prepare('SELECT * FROM legal_users WHERE email=?').bind('never-seen@arc.test').first();
  assert.equal(row.role, 'pending', 'unknown user is NOT auto-created as an investigator');
  assert.equal(row.status, 'pending');
});

// 4 ---------------------------------------------------------------------------
test('case assignment is enforced on every read and write', async () => {
  const env = await baseEnv();
  const m = await makeMotion(env, CASE_A);
  const read = await call(env, 'GET', '/legal-api/motions/' + CASE_A, { token: 'outsider' });
  assert.equal(read.status, 403, 'unassigned user cannot read');
  const write = await call(env, 'PUT', '/legal-api/motion/' + m.id, { token: 'outsider', body: { title: 'hijack' } });
  assert.equal(write.status, 403, 'unassigned user cannot write');
  const ok = await call(env, 'GET', '/legal-api/motions/' + CASE_A, { token: 'valid' });
  assert.equal(ok.status, 200, 'assigned user can read');
});

// 5 ---------------------------------------------------------------------------
test('cross-case fact contamination is caught by filing review', async () => {
  const env = await baseEnv();
  const m = await makeMotion(env, CASE_A, {
    selectedFactIds: ['fact-a-1'],
    sections: [{ type: 'facts', heading: 'FACTS', body: 'Approved fact one. [FACT:fact-a-1] Something from another case. [FACT:fact-b-9]' }],
    certificateOfService: 'served',
  });
  const motion = await env.DB.prepare('SELECT * FROM motions WHERE id=?').bind(m.id).first();
  const review = await filingReview(env, motion, { caseId: CASE_A });
  assert.ok(review.errors.some(e => /fact-b-9/.test(e)), 'foreign fact tag flagged as possible cross-case material');
  assert.equal(review.ok, false);
});

// 6 ---------------------------------------------------------------------------
test('cross-case authority contamination is caught', async () => {
  const env = await baseEnv();
  const authB = await makeAuthority(env, CASE_B, { clOpinionId: 'oB', clClusterId: 'cB' });
  const m = await makeMotion(env, CASE_A, {
    sections: [{ type: 'argument', heading: 'ARG', body: 'See [AUTH:' + authB.id + '] for the rule.' }],
    certificateOfService: 'served',
  });
  const motion = await env.DB.prepare('SELECT * FROM motions WHERE id=?').bind(m.id).first();
  const review = await filingReview(env, motion, { caseId: CASE_A });
  assert.ok(review.errors.some(e => /Cross-case or unknown authority/.test(e)));
});

// 7 ---------------------------------------------------------------------------
test('cross-case exhibit contamination is caught', async () => {
  const env = await baseEnv();
  const up = await call(env, 'POST', '/legal-api/files?caseId=' + CASE_B + '&filename=b.pdf&title=Case+B+exhibit',
    { token: 'attorney', raw: 'PDF-BYTES-CASE-B' });
  const fileB = await jsonOf(up);
  assert.equal(fileB.case_id, CASE_B);
  const m = await makeMotion(env, CASE_A, { selectedExhibitIds: [fileB.id], certificateOfService: 'served' });
  const motion = await env.DB.prepare('SELECT * FROM motions WHERE id=?').bind(m.id).first();
  const review = await filingReview(env, motion, { caseId: CASE_A });
  assert.ok(review.errors.some(e => /different case/.test(e)));
});

// 8 ---------------------------------------------------------------------------
test('CourtListener duplicate import is detected across the hierarchy', async () => {
  const env = await baseEnv();
  const first = await makeAuthority(env, CASE_A);
  assert.ok(first.id);
  assert.equal(first.verification_status, 'Imported', 'import never confers weight');

  const dupOpinion = await call(env, 'POST', '/legal-api/import-authority', {
    token: 'attorney', body: { caseId: CASE_A, caseName: 'Commonwealth v. Tyree', clOpinionId: 'o1', clClusterId: 'c1' },
  });
  assert.equal(dupOpinion.status, 409);
  assert.equal((await jsonOf(dupOpinion)).matchedOn, 'cl_opinion_id');

  const dupCitation = await call(env, 'POST', '/legal-api/import-authority', {
    token: 'attorney', body: { caseId: CASE_A, caseName: 'Same cite different id', citation: '455 Mass. 676', clOpinionId: 'o99' },
  });
  assert.equal(dupCitation.status, 409);

  // A different opinion in the SAME cluster (e.g. the dissent) is not a duplicate.
  const dissent = await call(env, 'POST', '/legal-api/import-authority', {
    token: 'attorney', body: { caseId: CASE_A, caseName: 'Commonwealth v. Tyree', clClusterId: 'c1', clOpinionId: 'o2', opinionType: 'dissent' },
  });
  assert.equal(dissent.status, 200, 'separate opinions are separate authority records');

  // Same authority in a different case is not a duplicate.
  const otherCase = await makeAuthority(env, CASE_B);
  assert.ok(otherCase.id);
});

// 9 ---------------------------------------------------------------------------
test('unverified authority warning: only Verified/Persuasive/Controlling are citable', async () => {
  const env = await baseEnv();
  const a = await makeAuthority(env, CASE_A);
  const m = await makeMotion(env, CASE_A, {
    selectedAuthorityIds: [a.id],
    sections: [{ type: 'argument', heading: 'ARG', body: 'The rule is stated in [AUTH:' + a.id + '].' }],
    certificateOfService: 'served',
  });
  const motion = await env.DB.prepare('SELECT * FROM motions WHERE id=?').bind(m.id).first();
  const review = await filingReview(env, motion, { caseId: CASE_A });
  assert.ok(review.errors.some(e => /without reaching Verified/.test(e)));
  assert.deepEqual(USABLE_STATUSES, ['Verified', 'Persuasive', 'Controlling']);
});

// 10 --------------------------------------------------------------------------
test('missing pinpoint blocks verification and is flagged at filing', async () => {
  const env = await baseEnv();
  const a = await makeAuthority(env, CASE_A);
  const noPin = await call(env, 'POST', '/legal-api/verify-authority', {
    token: 'attorney', body: { id: a.id, status: 'Verified' },
  });
  assert.equal(noPin.status, 400);
  assert.match((await jsonOf(noPin)).error, /Pinpoint/);

  const ok = await verify(env, a.id, 'Verified');
  assert.equal(ok.status, 200);
  assert.equal(ok.body.pinpoint, '682');
});

// 11 --------------------------------------------------------------------------
test('Controlling is attorney-only and must be supported by court and opinion type', async () => {
  const env = await baseEnv();
  const a = await makeAuthority(env, CASE_A);
  const byInvestigator = await verify(env, a.id, 'Controlling', 'valid');
  assert.equal(byInvestigator.status, 403, 'investigator cannot mark Controlling');

  const foreign = await makeAuthority(env, CASE_A, { clOpinionId: 'oNY', clClusterId: 'cNY', citation: '10 N.Y.2d 1', clCourtId: 'nyctapp' });
  const wrongCourt = await verify(env, foreign.id, 'Controlling');
  assert.equal(wrongCourt.status, 400, 'out-of-jurisdiction court cannot be Controlling');
  assert.match(wrongCourt.body.error, /Persuasive/);

  const dissent = await makeAuthority(env, CASE_A, { clOpinionId: 'oD', clClusterId: 'cD', citation: '460 Mass. 1', opinionType: 'dissent' });
  const nonHolding = await verify(env, dissent.id, 'Controlling');
  assert.equal(nonHolding.status, 400, 'a dissent is not the holding of the court');

  const good = await verify(env, a.id, 'Controlling');
  assert.equal(good.status, 200);
  assert.equal(good.body.controlling_marked_by, 'attorney@arc.test');
});

// 12 --------------------------------------------------------------------------
test('Claude citation fabrication is rejected and nothing is saved', async () => {
  const env = await baseEnv();
  const a = await makeAuthority(env, CASE_A);
  await verify(env, a.id, 'Verified');
  const m = await makeMotion(env, CASE_A, {
    selectedFactIds: ['f1'], selectedAuthorityIds: [a.id],
    sections: [{ type: 'argument', heading: 'ARGUMENT', body: '' }],
  });
  await call(env, 'POST', '/legal-api/motion/' + m.id + '/prepare', {
    token: 'attorney', body: { factsReviewed: true, authoritiesReviewed: true },
  });
  const restore = stubFetch({
    'api.anthropic.com': () => ({
      body: { content: [{ type: 'text', text: '### ARGUMENT\nThe stop was unlawful. See Commonwealth v. Fabricated, 999 Mass. 111 (2021).' }] },
    }),
  });
  const r = await call(env, 'POST', '/legal-api/motion/' + m.id + '/draft', {
    token: 'attorney', body: { approvedFacts: [{ id: 'f1', text: 'Officer observed no violation.' }], caseInfo: {} },
  });
  restore();
  assert.equal(r.status, 422);
  const body = await jsonOf(r);
  assert.ok(body.fabricated.some(c => /999 Mass\. 111/.test(c)));
  const after = await env.DB.prepare('SELECT sections FROM motions WHERE id=?').bind(m.id).first();
  assert.ok(!after.sections.includes('Fabricated'), 'rejected draft was not persisted');
  const logged = await env.DB.prepare("SELECT * FROM legal_audit WHERE action='claude.fabrication_rejected'").first();
  assert.ok(logged, 'rejection is audited');

  // A draft citing only the verified authority passes the same check.
  assert.equal(findFabricatedCitations('Per [AUTH:x] Commonwealth v. Tyree, 455 Mass. 676, the search fails.',
    [{ case_name: 'Commonwealth v. Tyree', citation: '455 Mass. 676' }]).length, 0);
});

// 13 --------------------------------------------------------------------------
test('attorney approval is removed after edits and requires reapproval', async () => {
  const env = await baseEnv();
  const a = await makeAuthority(env, CASE_A);
  await verify(env, a.id, 'Verified');
  const m = await makeMotion(env, CASE_A, {
    selectedFactIds: ['f1'], selectedAuthorityIds: [a.id],
    sections: [
      { type: 'caption', heading: '', body: 'COMMONWEALTH OF MASSACHUSETTS\nDOCKET NO. 2584CR00681\nCOMMONWEALTH\nv.\nJANE ROE' },
      { type: 'argument', heading: 'ARGUMENT', body: 'The search was unlawful. [FACT:f1] See [AUTH:' + a.id + '], at 682.' },
    ],
    certificateOfService: 'I served a copy on the Commonwealth.',
  });
  const expected = { caseId: CASE_A, client: 'JANE ROE', docket: '2584CR00681' };

  // investigator cannot approve
  const byInv = await call(env, 'POST', '/legal-api/motion/' + m.id + '/approve', { token: 'valid', body: { expectedCase: expected } });
  assert.equal(byInv.status, 403);

  const approve = await call(env, 'POST', '/legal-api/motion/' + m.id + '/approve', {
    token: 'attorney', body: { attorneyName: 'A. Attorney', statement: 'Approved.', expectedCase: expected },
  });
  const approved = await jsonOf(approve);
  assert.equal(approve.status, 200, JSON.stringify(approved));
  assert.equal(approved.status, 'Approved for Filing');
  assert.equal(approved.approved_version, approved.version);
  assert.equal(approved.approved_by_email, 'attorney@arc.test');

  // Any later edit creates a new version and removes the filing approval.
  const edited = await jsonOf(await call(env, 'PUT', '/legal-api/motion/' + m.id, {
    token: 'attorney', body: { sections: JSON.parse(approved.sections).concat([{ type: 'argument', heading: 'NEW', body: 'Added later.' }]) },
  }));
  assert.equal(edited.version, approved.version + 1, 'edit creates a new version');
  assert.equal(edited.approved_at, '', 'prior approval removed');
  assert.equal(edited.approved_by, '');
  assert.equal(edited.status, 'Revision Required');
  const auditRow = await env.DB.prepare("SELECT * FROM legal_audit WHERE action='motion.approval_removed'").first();
  assert.ok(auditRow, 'approval removal is audited');

  // Prior approved version is preserved in history, not silently replaced.
  const versions = await jsonOf(await call(env, 'GET', '/legal-api/motion/' + m.id + '/versions', { token: 'attorney' }));
  assert.ok(versions.length >= 1);
  assert.ok(versions.some(v => v.version === approved.version));
});

// 14 --------------------------------------------------------------------------
test('exports exclude API keys, internal notes, and other-case material', async () => {
  const env = await baseEnv();
  const a = await makeAuthority(env, CASE_A);
  await verify(env, a.id, 'Verified');
  const up = await jsonOf(await call(env, 'POST', '/legal-api/files?caseId=' + CASE_A + '&filename=ex1.pdf&title=BWC+still',
    { token: 'attorney', raw: 'EXHIBIT-ONE-BYTES' }));
  await call(env, 'PUT', '/legal-api/file/' + up.id, {
    token: 'attorney', body: { exhibitNumber: 1, attorneyNotes: 'PRIVILEGED-INTERNAL-NOTE-DO-NOT-EXPORT' },
  });
  const m = await makeMotion(env, CASE_A, {
    selectedFactIds: ['f1'], selectedAuthorityIds: [a.id], selectedExhibitIds: [up.id],
    sections: [
      { type: 'caption', heading: '', body: 'COMMONWEALTH\nv.\nJANE ROE\nDOCKET NO. 2584CR00681' },
      { type: 'argument', heading: 'ARGUMENT', body: 'The search failed. [FACT:f1] See [AUTH:' + a.id + '], at 682. See Exhibit 1.' },
    ],
    certificateOfService: 'Served on the Commonwealth.',
  });
  const expected = { caseId: CASE_A, client: 'JANE ROE', docket: '2584CR00681' };
  const ap = await call(env, 'POST', '/legal-api/motion/' + m.id + '/approve', { token: 'attorney', body: { attorneyName: 'A. Attorney', expectedCase: expected } });
  assert.equal(ap.status, 200, JSON.stringify(await jsonOf(ap)));

  const zipRes = await call(env, 'GET', '/legal-api/motion/' + m.id + '/export/zip', { token: 'attorney' });
  assert.equal(zipRes.status, 200);
  const zipBytes = new Uint8Array(await zipRes.arrayBuffer());
  const zipText = new TextDecoder('latin1').decode(zipBytes);
  assert.equal(zipText.slice(0, 2), 'PK', 'valid zip container');
  assert.ok(!zipText.includes('cl-test-secret'), 'no CourtListener key in export');
  assert.ok(!zipText.includes('TEST_ANTHROPIC_SECRET'), 'no Anthropic key in export');
  assert.ok(!zipText.includes('PRIVILEGED-INTERNAL-NOTE'), 'no attorney notes in export');
  assert.ok(!zipText.includes('Case B exhibit'), 'no other-case material in export');
  assert.ok(!zipText.includes('[FACT:'), 'internal source tags stripped from filing documents');
  assert.ok(zipText.includes('filing_manifest.json'), 'manifest included');
  assert.ok(zipText.includes('exhibits/Exhibit_1'), 'exhibit included');
  assert.ok(zipText.includes('EXHIBIT-ONE-BYTES'), 'exhibit bytes included');
});

// 15 --------------------------------------------------------------------------
test('R2 file ownership: files are reachable only through their own case assignment', async () => {
  const env = await baseEnv();
  const f = await jsonOf(await call(env, 'POST', '/legal-api/files?caseId=' + CASE_A + '&filename=secret.pdf',
    { token: 'attorney', raw: 'CASE-A-ONLY-BYTES' }));
  assert.match(f.stored_key, new RegExp('^legal/' + CASE_A + '/'), 'object key is namespaced by case');
  assert.equal(f.sha256.length, 64, 'sha-256 recorded at intake');

  const denied = await call(env, 'GET', '/legal-api/file/' + f.id, { token: 'outsider' });
  assert.equal(denied.status, 403, 'user assigned only to Case B cannot fetch a Case A object');
  const allowed = await call(env, 'GET', '/legal-api/file/' + f.id, { token: 'valid' });
  assert.equal(allowed.status, 200);

  const badType = await call(env, 'POST', '/legal-api/files?caseId=' + CASE_A + '&filename=payload.exe',
    { token: 'attorney', raw: 'MZ' });
  assert.equal(badType.status, 415, 'file-type allow-list enforced');

  const traversal = await jsonOf(await call(env, 'POST', '/legal-api/files?caseId=' + CASE_A + '&filename=' + encodeURIComponent('../../etc/passwd.txt'),
    { token: 'attorney', raw: 'x' }));
  assert.ok(!traversal.stored_key.includes('..'), 'filename sanitized against traversal');
});

// 16 --------------------------------------------------------------------------
test('D1 motion version history is append-only and attributed', async () => {
  const env = await baseEnv();
  const m = await makeMotion(env, CASE_A, { sections: [{ type: 'argument', heading: 'A', body: 'v1 text' }] });
  await call(env, 'PUT', '/legal-api/motion/' + m.id, { token: 'attorney', body: { sections: [{ type: 'argument', heading: 'A', body: 'v2 text' }] } });
  await call(env, 'PUT', '/legal-api/motion/' + m.id, { token: 'valid', body: { sections: [{ type: 'argument', heading: 'A', body: 'v3 text' }] } });
  const versions = await jsonOf(await call(env, 'GET', '/legal-api/motion/' + m.id + '/versions', { token: 'attorney' }));
  assert.equal(versions.length, 2, 'each content change snapshots the prior version');
  assert.equal(versions[0].version, 2);
  assert.equal(versions[0].saved_by, 'investigator@arc.test');
  const snap = await env.DB.prepare('SELECT snapshot FROM motion_versions WHERE motion_id=? AND version=1').bind(m.id).first();
  assert.ok(snap.snapshot.includes('v1 text'), 'original text preserved');
  const current = await jsonOf(await call(env, 'GET', '/legal-api/motion/' + m.id, { token: 'attorney' }));
  assert.equal(current.version, 3);
});

// 17 --------------------------------------------------------------------------
test('final filing ZIP contents and approval gate', async () => {
  const env = await baseEnv();
  const m = await makeMotion(env, CASE_A, { sections: [{ type: 'argument', heading: 'A', body: 'text' }] });
  const early = await call(env, 'GET', '/legal-api/motion/' + m.id + '/export/zip', { token: 'attorney' });
  assert.equal(early.status, 428, 'no filing ZIP before approval');
  const html = await call(env, 'GET', '/legal-api/motion/' + m.id + '/export/html', { token: 'attorney' });
  assert.equal(html.status, 200, 'attorney HTML is always available for review');
  const docx = await call(env, 'GET', '/legal-api/motion/' + m.id + '/export/docx', { token: 'attorney' });
  assert.equal(docx.status, 200);
  const docxBytes = new Uint8Array(await docx.arrayBuffer());
  assert.equal(new TextDecoder('latin1').decode(docxBytes.slice(0, 2)), 'PK', 'valid docx (zip) container');
  assert.ok(new TextDecoder('latin1').decode(docxBytes).includes('word/document.xml'));
});

// 18 --------------------------------------------------------------------------
test('CourtListener hierarchy handling: opinion types preserved, html_with_citations preferred', () => {
  assert.equal(normalizeOpinionType('020lead'), 'lead');
  assert.equal(normalizeOpinionType('030concurrence'), 'concurrence');
  assert.equal(normalizeOpinionType('040dissent'), 'dissent');
  assert.equal(normalizeOpinionType('010combined'), 'combined');
  assert.equal(normalizeOpinionType(''), 'combined');

  const both = pickOpinionText({ html_with_citations: '<p>Preferred <a>cite</a> text</p>', plain_text: 'fallback' });
  assert.equal(both.field, 'html_with_citations', 'html_with_citations wins over plain_text');
  assert.equal(both.text, 'Preferred cite text');
  const only = pickOpinionText({ plain_text: 'only plain' });
  assert.equal(only.field, 'plain_text');
});

// 19 --------------------------------------------------------------------------
test('docket-number search requires a court or jurisdiction filter', async () => {
  const env = await baseEnv();
  const r = await call(env, 'POST', '/legal-api/search', {
    token: 'attorney', body: { caseId: CASE_A, docketNumber: '23A994', jurisdiction: '' },
  });
  assert.equal(r.status, 400);
  assert.match((await jsonOf(r)).error, /not unique/);
});

// 20 --------------------------------------------------------------------------
test('provider logging records sizes only, never secrets or raw prompts', async () => {
  const env = await baseEnv();
  const restore = stubFetch({
    'courtlistener.com': () => ({ body: { count: 1, results: [{ cluster_id: 5, caseName: 'X v. Y', court_id: 'mass' }] } }),
  });
  await call(env, 'POST', '/legal-api/search', { token: 'attorney', body: { caseId: CASE_A, q: 'reasonable suspicion' } });
  restore();
  const log = await env.DB.prepare("SELECT * FROM provider_log WHERE provider='courtlistener'").first();
  assert.ok(log, 'provider call logged');
  assert.ok(log.request_chars > 0);
  const all = JSON.stringify(log);
  assert.ok(!all.includes('cl-test-secret'), 'no key in the provider log');
  assert.ok(!all.includes('reasonable suspicion'), 'no raw query text stored');
});

// 21 --------------------------------------------------------------------------
test('CORS allowlist and no key exposure in frontend files', async () => {
  const env = await baseEnv();
  const bad = await handleRequest(new Request('https://evil.example.com/legal-api/me', {
    headers: { 'Cf-Access-Jwt-Assertion': 'valid', Origin: 'https://evil.example.com' },
  }), env);
  assert.equal(bad.status, 403, 'disallowed origin rejected');
  const good = await handleRequest(new Request('https://arcdefensereport.com/legal-api/me', {
    headers: { 'Cf-Access-Jwt-Assertion': 'valid', Origin: 'https://arcdefensereport.com' },
  }), env);
  assert.equal(good.headers.get('Access-Control-Allow-Origin'), 'https://arcdefensereport.com');

  const fs = await import('fs');
  const root = new URL('../../../', import.meta.url);
  const frontendFiles = [
    '23_Motion_and_Legal.html', 'arc_motion_legal.css', 'arc_motion_legal.js',
    'arc_courtlistener_client.js', 'arc_motion_templates.js', 'arc_legal_authority_store.js'
  ];
  for (const f of frontendFiles) {
    const src = fs.readFileSync(new URL(f, root), 'utf8');
    assert.ok(!/sk-ant-[A-Za-z0-9]/.test(src), f + ' has no Anthropic key');
    assert.ok(!/Authorization:\s*['"`]Token /.test(src), f + ' never sends a CourtListener token');
    assert.ok(!/COURTLISTENER_API_KEY|ANTHROPIC_API_KEY/.test(src), f + ' does not reference provider secrets');
    assert.ok(!/127\.0\.0\.1|localhost:\d/.test(src), f + ' has no localhost dependency');
  }
});

// 22 --------------------------------------------------------------------------
test('filing review catches placeholders, missing certificate, exhibit numbering, and Rule 9A', async () => {
  const env = await baseEnv();
  const m = await makeMotion(env, CASE_A, {
    sections: [{ type: 'facts', heading: 'FACTS', body: 'On [DATE] the officer stopped [CLIENT NAME]. Pursuant to Rule 9A the parties conferred.' }],
  });
  const motion = await env.DB.prepare('SELECT * FROM motions WHERE id=?').bind(m.id).first();
  const review = await filingReview(env, motion, { caseId: CASE_A });
  assert.ok(review.errors.some(e => /Unresolved placeholders/.test(e)));
  assert.ok(review.errors.some(e => /Certificate of service/.test(e)));
  assert.ok(review.warnings.some(w => /Rule 9A/.test(w)), 'civil Rule 9A never silently applied to a criminal motion');
  assert.equal(review.ok, false);
});
