// ARC Motion & Legal Worker. Cloudflare Access identity required on every route.
// Bindings: DB (D1), FILES (R2). Secrets: COURTLISTENER_API_KEY, ANTHROPIC_API_KEY.
// Vars: ACCESS_TEAM_DOMAIN, ACCESS_AUD, ALLOWED_ORIGINS (comma-separated).
import { now, uuid, safeName, json, buildZip, buildDocx, hashStream, verifyAccessJwt, findPlaceholders } from './lib.mjs';
import { draftMotion, reviseSection, verifyDraft, USABLE_STATUSES } from './providers.mjs';
import { renderMotionHtml } from './arc_motion_render.mjs';
import { clSearch, clCourts, clDocket, clCluster, clOpinion, clClusterFull, MA_COURTS } from './arc_courtlistener_client.mjs';

const MOTION_STATUSES = ['Issue Identified', 'Researching', 'Ready to Draft', 'Draft', 'Attorney Review',
  'Revision Required', 'Approved for Filing', 'Filed', 'Withdrawn', 'Archived'];
const AUTH_STATUSES = ['Imported', 'Located', 'Pinpoint Needed', 'Verified', 'Persuasive', 'Controlling', 'Superseded', 'Do Not Use'];
// Only an attorney or authorized legal reviewer may mark an authority Controlling.
const CONTROLLING_ROLES = ['attorney', 'supervisor', 'administrator'];
const APPROVER_ROLES = ['attorney', 'supervisor', 'administrator'];
const MAX_UPLOAD = 250 * 1024 * 1024;
const MAX_JSON = 2 * 1024 * 1024;
const ALLOWED_EXT = ['.pdf', '.docx', '.txt', '.html', '.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff', '.csv', '.json'];

// simple per-identity rate limit (per isolate; production hardening note in docs)
const rlBuckets = new Map();
function rateLimit(email, limit = 120, windowMs = 60e3) {
  const nowMs = Date.now();
  const b = rlBuckets.get(email) || { start: nowMs, n: 0 };
  if (nowMs - b.start > windowMs) { b.start = nowMs; b.n = 0; }
  b.n++;
  rlBuckets.set(email, b);
  if (b.n > limit) throw Object.assign(new Error('Rate limit exceeded'), { status: 429 });
}

function corsHeaders(env, origin) {
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const ok = allowed.includes(origin);
  return ok ? {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'content-type, cf-access-jwt-assertion',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
  } : {};
}

async function audit(env, actor, action, { caseId = '', recordType = '', recordId = '', summary = '' } = {}) {
  await env.DB.prepare('INSERT INTO legal_audit (id, at, actor, action, case_id, record_type, record_id, summary) VALUES (?,?,?,?,?,?,?,?)')
    .bind(uuid(), now(), actor, action, caseId, recordType, recordId, String(summary).slice(0, 500)).run();
}

/** Identity + role. Unknown users are REJECTED into pending (never auto-created as investigators). */
async function requireUser(request, env) {
  const token = request.headers.get('Cf-Access-Jwt-Assertion') || '';
  const identity = await verifyAccessJwt(token, env);
  const email = identity.email;
  rateLimit(email);
  let user = await env.DB.prepare('SELECT * FROM legal_users WHERE email=?').bind(email).first();
  if (!user) {
    await env.DB.prepare('INSERT INTO legal_users (email, role, status, created_at, updated_at) VALUES (?,?,?,?,?)')
      .bind(email, 'pending', 'pending', now(), now()).run();
    throw Object.assign(new Error('Account pending: an administrator must assign your role before you can use the legal module.'), { status: 403 });
  }
  if (user.status !== 'active' || user.role === 'pending') {
    throw Object.assign(new Error('Account pending or disabled. Contact an administrator.'), { status: 403 });
  }
  return user;
}

/** Every case-scoped read and write requires an assignment (admins/supervisors see all). */
async function requireCaseAccess(env, user, caseId) {
  if (!caseId) throw Object.assign(new Error('No active ARC case selected.'), { status: 400 });
  if (['administrator', 'supervisor'].includes(user.role)) return true;
  const a = await env.DB.prepare('SELECT 1 x FROM case_members WHERE case_id=? AND user_id=?').bind(caseId, user.email).first();
  if (!a) throw Object.assign(new Error('You are not assigned to this case.'), { status: 403 });
  return true;
}

async function readJson(request) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > MAX_JSON) throw Object.assign(new Error('Request body too large'), { status: 413 });
  try { return await request.json(); }
  catch { throw Object.assign(new Error('Invalid JSON body'), { status: 400 }); }
}

const getMotion = async (env, id) => env.DB.prepare('SELECT * FROM motions WHERE id=?').bind(id).first();

// ---- filing review (deterministic; blocks approval on critical failures) ----
export async function filingReview(env, motion, expectedCase) {
  const errors = [], warnings = [];
  const sections = JSON.parse(motion.sections || '[]');
  /* Structured caption and signature data lives in `meta`, not `body`. It must
     be scanned too, or the docket and client checks below silently pass over a
     motion whose caption is structured. */
  const metaText = s => (s && s.meta) ? Object.values(s.meta).filter(v => typeof v === 'string').join('\n') : '';
  const text = sections.map(s => `${s.heading}\n${s.body}\n${metaText(s)}`).join('\n') + '\n' + (motion.proposed_order || '') + '\n' + (motion.certificate_of_service || '');
  const ec = expectedCase || {};
  if (ec.caseId && ec.caseId !== motion.case_id) errors.push('Active ARC case does not match this motion.');
  if (ec.client && !text.toUpperCase().includes(String(ec.client).toUpperCase())) errors.push('Client name from the ARC case does not appear in the motion.');
  if (ec.docket && !text.includes(ec.docket)) errors.push('Docket number from the ARC case does not appear in the motion.');
  if (ec.court && !text.toUpperCase().includes(String(ec.court).toUpperCase())) warnings.push('Court name from the ARC case does not appear in the motion.');
  if (!motion.title) errors.push('Motion has no title.');
  const ph = findPlaceholders(text);
  if (ph.length) errors.push('Unresolved placeholders: ' + ph.join(', '));
  const v = await verifyDraft(env, 'system', motion, {});
  if (v.fabricated.length) errors.push('Citations outside the verified authority set: ' + v.fabricated.join('; '));
  if (v.unverifiedUsed.length) errors.push('Authorities cited without reaching Verified/Persuasive/Controlling: ' + v.unverifiedUsed.join('; '));
  if (v.supersededUsed?.length) errors.push('Superseded or Do-Not-Use authority cited: ' + v.supersededUsed.join('; '));
  if (v.wrongJurisdiction?.length) warnings.push('Authority marked Controlling from a court that may not control here: ' + v.wrongJurisdiction.join('; '));
  if (v.missingPinpoint.length) errors.push('Cited authorities missing pinpoint citations: ' + v.missingPinpoint.join('; '));
  // outdated authority: verified long ago
  const stale = await env.DB.prepare("SELECT case_name, date_verified FROM authorities WHERE case_id=? AND date_verified!='' ").bind(motion.case_id).all();
  const old = (stale.results || []).filter(a => Date.now() - Date.parse(a.date_verified) > 180 * 86400e3).map(a => a.case_name);
  if (old.length) warnings.push('Authority not re-checked in over 180 days: ' + old.join('; '));
  if (v.unsupportedParagraphs.length) errors.push(v.unsupportedParagraphs.length + ' factual/argument paragraph(s) lack [FACT:id] source tags.');
  if (/Rule 9A/i.test(text)) warnings.push('Motion references civil Rule 9A; confirm intentional. Rule 9A civil procedure does not govern criminal motions.');
  // cross-case material: any [FACT:] or [AUTH:] tag must belong to this case's selections/authorities
  const authRows = await env.DB.prepare('SELECT id FROM authorities WHERE case_id=?').bind(motion.case_id).all();
  const caseAuthIds = new Set((authRows.results || []).map(r => r.id));
  for (const m of text.matchAll(/\[AUTH:([^\]]+)\]/g)) {
    if (!caseAuthIds.has(m[1])) errors.push('Cross-case or unknown authority reference: ' + m[1]);
  }
  const selectedFacts = new Set(JSON.parse(motion.selected_fact_ids || '[]'));
  for (const m of text.matchAll(/\[FACT:([^\]]+)\]/g)) {
    if (!selectedFacts.has(m[1])) errors.push('Fact tag not in this motion\'s approved selection (possible cross-case material): ' + m[1]);
  }
  // exhibits
  const exIds = JSON.parse(motion.selected_exhibit_ids || '[]');
  const nums = [];
  for (const id of exIds) {
    const f = await env.DB.prepare('SELECT * FROM legal_files WHERE id=? ').bind(id).first();
    if (!f) { errors.push('Selected exhibit record missing: ' + id); continue; }
    if (f.case_id !== motion.case_id) errors.push('Exhibit belongs to a different case: ' + (f.exhibit_title || f.original_filename));
    nums.push(f.exhibit_number | 0);
    if (f.exhibit_number && !text.includes('Exhibit ' + f.exhibit_number)) warnings.push(`Exhibit ${f.exhibit_number} (${f.exhibit_title || f.original_filename}) is attached but never referenced.`);
  }
  const sorted = [...nums].sort((a, b) => a - b);
  if (nums.length && (sorted[0] !== 1 || sorted.some((n, i) => n !== i + 1))) errors.push('Exhibit numbering is not sequential from 1.');
  for (const m of text.matchAll(/Exhibit\s+(\d{1,2})\b/g)) {
    if (!nums.includes(Number(m[1]))) warnings.push('Motion references Exhibit ' + m[1] + ' but no such exhibit is attached.');
  }
  if (/suppress|dismiss|compel|exclude/i.test(motion.title) && !String(motion.proposed_order || '').trim()) warnings.push('No proposed order included; typically required for this motion type.');
  if (!String(motion.certificate_of_service || '').trim()) errors.push('Certificate of service is not completed.');
  return { errors, warnings, ok: errors.length === 0 };
}

// ---- export compilation -----------------------------------------------------
function compileBlocks(motion) {
  const sections = JSON.parse(motion.sections || '[]');
  const blocks = sections.map(s => ({ heading: s.heading || '', body: s.body || '', type: s.type || 'argument', meta: s.meta || null }));
  if (String(motion.certificate_of_service || '').trim()) blocks.push({ heading: 'CERTIFICATE OF SERVICE', body: motion.certificate_of_service, type: 'certificate' });
  if (String(motion.proposed_order || '').trim()) blocks.push({ heading: 'PROPOSED ORDER', body: motion.proposed_order, type: 'proposed_order', pageBreak: true });
  return blocks;
}
const escHtml = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export function attorneyHtml(motion) {
  return renderMotionHtml(motion, compileBlocks(motion));
}

/* Internal source tags come out of a filed document, but an [AUTH:id] tag is a
   citation, not an annotation. Deleting it leaves "See , at 682." on a document
   going to a judge, so it resolves to the case name and reporter cite instead.
   FACT and FINDING tags are internal provenance and are removed outright. */
function stripTags(text, authorityMap) {
  // `[ \t]*` not `\s*`: consuming newlines here merges paragraphs in the filed copy.
  let out = String(text).replace(/\[(FACT|FINDING):[^\]]+\][ \t]*/g, '');
  out = out.replace(/\[AUTH:([^\]]+)\]/g, (whole, id) => {
    const a = authorityMap && authorityMap.get(id);
    if (!a) return '';
    const name = String(a.case_name || '').trim();
    const cite = String(a.citation || '').trim();
    return [name, cite].filter(Boolean).join(', ');
  });
  return out.replace(/[ \t]{2,}/g, ' ').replace(/ +([,.;])/g, '$1');
}

/* Authorities for this motion, keyed by id, for citation resolution above. */
async function authorityMapFor(env, motion) {
  const rows = await env.DB.prepare('SELECT id, case_name, citation FROM authorities WHERE case_id=?')
    .bind(motion.case_id).all();
  return new Map((rows.results || []).map(r => [r.id, r]));
}

async function buildFilingZip(env, motion) {
  const authMap = await authorityMapFor(env, motion);
  const clean = { ...motion, sections: JSON.stringify(JSON.parse(motion.sections || '[]').map(s => ({ ...s, body: stripTags(s.body, authMap) }))) };
  const html = attorneyHtml(clean);
  const docx = buildDocx(compileBlocks(clean));
  const exIds = JSON.parse(motion.selected_exhibit_ids || '[]');
  const entries = [
    { name: 'motion.html', data: html },
    { name: 'motion.docx', data: docx },
  ];
  const manifest = {
    motionId: motion.id, caseId: motion.case_id, title: motion.title,
    version: motion.version, approvedBy: motion.approved_by, approvedAt: motion.approved_at,
    contents: ['motion.html', 'motion.docx'], exhibits: [], generatedAt: now(),
  };
  if (String(motion.proposed_order || '').trim()) { entries.push({ name: 'proposed_order.txt', data: motion.proposed_order }); manifest.contents.push('proposed_order.txt'); }
  if (String(motion.certificate_of_service || '').trim()) { entries.push({ name: 'certificate_of_service.txt', data: motion.certificate_of_service }); manifest.contents.push('certificate_of_service.txt'); }
  for (const id of exIds) {
    const f = await env.DB.prepare('SELECT * FROM legal_files WHERE id=? AND case_id=?').bind(id, motion.case_id).first();
    if (!f) continue;
    const obj = await env.FILES.get(f.stored_key);
    if (!obj) continue;
    const data = new Uint8Array(await obj.arrayBuffer());
    const name = `exhibits/Exhibit_${f.exhibit_number || 0}_${safeName(f.exhibit_title || f.original_filename)}`;
    entries.push({ name, data });
    manifest.exhibits.push({ number: f.exhibit_number, title: f.exhibit_title, file: name, sha256: f.sha256 });
  }
  entries.push({ name: 'filing_manifest.json', data: JSON.stringify(manifest, null, 1) });
  return buildZip(entries);
}

// ---- router -----------------------------------------------------------------
export async function handleRequest(request, env) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin') || '';
  const cors = corsHeaders(env, origin);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (!url.pathname.startsWith('/legal-api/')) return json({ error: 'Not found' }, 404, cors);
  if (origin && !cors['Access-Control-Allow-Origin']) return json({ error: 'Origin not allowed' }, 403);

  let user;
  try { user = await requireUser(request, env); }
  catch (e) { return json({ error: e.message }, e.status || 401, cors); }

  const path = url.pathname.replace('/legal-api/', '');
  const seg = path.split('/');
  try {
    // ---- users (admin) ----
    if (path === 'me') return json({ email: user.email, role: user.role, name: user.name }, 200, cors);
    if (path === 'provider-status' && request.method === 'GET') return json({ courtlistenerConfigured: !!env.COURTLISTENER_API_KEY, claudeConfigured: !!env.ANTHROPIC_API_KEY, d1: !!env.DB, r2: !!env.FILES }, 200, cors);
    if (path === 'users' && request.method === 'POST') {
      if (user.role !== 'administrator') throw Object.assign(new Error('Administrator role required'), { status: 403 });
      const b = await readJson(request);
      await env.DB.prepare(`INSERT INTO legal_users (email, name, role, bbo, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?)
        ON CONFLICT(email) DO UPDATE SET name=excluded.name, role=excluded.role, bbo=excluded.bbo, status=excluded.status, updated_at=excluded.updated_at`)
        .bind(String(b.email).toLowerCase(), b.name || '', b.role || 'pending', b.bbo || '', b.status || 'active', now(), now()).run();
      await audit(env, user.email, 'user.upsert', { summary: b.email + ' -> ' + b.role });
      return json({ ok: true }, 200, cors);
    }
    if (path === 'assignments' && request.method === 'POST') {
      if (!['administrator', 'supervisor'].includes(user.role)) throw Object.assign(new Error('Supervisor role required'), { status: 403 });
      const b = await readJson(request);
      const memberEmail = String(b.email || '').toLowerCase().trim();
      if (!memberEmail) throw Object.assign(new Error('Member email required'), { status: 400 });
      const requested = String(b.role || 'editor').toLowerCase();
      const memberRole = ['owner','editor','reviewer','reader'].includes(requested)
        ? requested
        : (requested === 'readonly' ? 'reader' : requested === 'attorney' ? 'reviewer' : 'editor');
      await env.DB.prepare(`INSERT INTO case_members (case_id, user_id, role, granted_by, granted_at)
        VALUES (?,?,?,?,?) ON CONFLICT(case_id,user_id) DO UPDATE SET role=excluded.role, granted_by=excluded.granted_by, granted_at=excluded.granted_at`)
        .bind(b.caseId, memberEmail, memberRole, user.email, now()).run();
      // Legacy mirror retained only for older admin screens; authorization reads case_members exclusively.
      await env.DB.prepare('INSERT OR REPLACE INTO case_assignments (case_id, email, assigned_role, assigned_at) VALUES (?,?,?,?)')
        .bind(b.caseId, memberEmail, memberRole, now()).run();
      await audit(env, user.email, 'assignment.set', { caseId: b.caseId, summary: memberEmail + ' -> ' + memberRole });
      return json({ ok: true }, 200, cors);
    }

    // ---- CourtListener (hierarchy: Court -> Docket -> Cluster -> Opinion) ----
    if (path === 'courts' && request.method === 'GET') {
      return json(await clCourts(env, user.email), 200, cors);
    }
    if (path === 'search' && (request.method === 'POST' || request.method === 'GET')) {
      const b = request.method === 'POST' ? await readJson(request) : Object.fromEntries(url.searchParams);
      await requireCaseAccess(env, user, b.caseId);
      return json(await clSearch(env, user.email, b), 200, cors);
    }
    if (seg[0] === 'dockets' && seg[1] && request.method === 'GET') {
      return json(await clDocket(env, user.email, seg[1]), 200, cors);
    }
    if (seg[0] === 'clusters' && seg[1] && request.method === 'GET') {
      // Opinion-page URLs use the CLUSTER id, so this is the import entry point.
      const full = url.searchParams.get('full') === '1';
      return json(full ? await clClusterFull(env, user.email, seg[1]) : await clCluster(env, user.email, seg[1]), 200, cors);
    }
    if (seg[0] === 'opinions' && seg[1] && request.method === 'GET') {
      return json(await clOpinion(env, user.email, seg[1]), 200, cors);
    }
    if (path === 'import-authority' && request.method === 'POST') {
      const b = await readJson(request);
      await requireCaseAccess(env, user, b.caseId);
      // Duplicate detection across the CourtListener hierarchy for THIS case:
      // same opinion, or same cluster when no opinion specified, or same citation.
      const dupChecks = [
        b.clOpinionId ? ['cl_opinion_id', String(b.clOpinionId)] : null,
        !b.clOpinionId && b.clClusterId ? ['cl_cluster_id', String(b.clClusterId)] : null,
        b.citation ? ['citation', b.citation] : null,
      ].filter(Boolean);
      for (const [col, val] of dupChecks) {
        const dup = await env.DB.prepare(`SELECT id, case_name, opinion_type FROM authorities WHERE case_id=? AND ${col}=? AND ${col}!=''`).bind(b.caseId, val).first();
        if (dup) {
          return json({ duplicate: true, existingId: dup.id, matchedOn: col,
            message: `Already in this case's authority library: ${dup.case_name}${dup.opinion_type ? ' (' + dup.opinion_type + ')' : ''}` }, 409, cors);
        }
      }
      const id = uuid();
      // Importing never confers weight. Everything lands as Imported (or Pinpoint Needed).
      const status = b.pinpoint ? 'Located' : 'Imported';
      await env.DB.prepare(`INSERT INTO authorities (id, case_id, cl_court_id, cl_docket_id, cl_cluster_id, cl_opinion_id,
        case_name, citation, court, decided_date, opinion_type, courtlistener_url, quoted_language, pinpoint,
        retained_text_ref, verification_status, jurisdiction, imported_by, imported_at, related_issue_ids,
        related_motion_ids, notes, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(id, b.caseId, String(b.clCourtId || ''), String(b.clDocketId || ''), String(b.clClusterId || ''),
          String(b.clOpinionId || ''), b.caseName || '[CASE NAME]', b.citation || '', b.court || '', b.date || '',
          b.opinionType || '', b.url || '', b.quotedLanguage || '', b.pinpoint || '',
          String(b.clOpinionId || ''), status, b.jurisdiction || '', user.email, now(),
          JSON.stringify(b.relatedIssueIds || []), JSON.stringify(b.relatedMotionIds || []), b.notes || '', now(), now()).run();
      await audit(env, user.email, 'authority.import', { caseId: b.caseId, recordType: 'authority', recordId: id,
        summary: `${b.caseName || ''} ${b.opinionType ? '(' + b.opinionType + ')' : ''} -> ${status}` });
      return json(await env.DB.prepare('SELECT * FROM authorities WHERE id=?').bind(id).first(), 200, cors);
    }
    if (path === 'verify-authority' && request.method === 'POST') {
      const b = await readJson(request);
      const a = await env.DB.prepare('SELECT * FROM authorities WHERE id=?').bind(b.id).first();
      if (!a) throw Object.assign(new Error('Authority not found'), { status: 404 });
      await requireCaseAccess(env, user, a.case_id);
      if (!AUTH_STATUSES.includes(b.status)) throw Object.assign(new Error('Invalid verification status'), { status: 400 });
      const warnings = [];
      // Controlling is a legal conclusion: attorney/supervisor/admin only, and the
      // court and jurisdiction must actually support it.
      if (b.status === 'Controlling') {
        if (!CONTROLLING_ROLES.includes(user.role)) {
          throw Object.assign(new Error('Only an attorney or authorized legal reviewer may mark an authority as Controlling.'), { status: 403 });
        }
        const maCourt = MA_COURTS.includes(String(a.cl_court_id || '')) || /^mass/i.test(String(a.cl_court_id || ''));
        const scotus = String(a.cl_court_id || '') === 'scotus';
        if (!maCourt && !scotus) {
          throw Object.assign(new Error('This court does not support a Controlling designation in a Massachusetts criminal matter. Use Persuasive.'), { status: 400 });
        }
        if (['concurrence', 'dissent', 'concurrence in part'].includes(String(a.opinion_type || ''))) {
          throw Object.assign(new Error('A ' + a.opinion_type + ' is not the holding of the court and cannot be marked Controlling.'), { status: 400 });
        }
      }
      if (['Verified', 'Persuasive', 'Controlling'].includes(b.status) && !(b.pinpoint || a.pinpoint)) {
        return json({ error: 'Pinpoint citation required before this status.', warnings: ['Missing pinpoint'] }, 400, cors);
      }
      const verifiedNow = ['Verified', 'Persuasive', 'Controlling'].includes(b.status);
      await env.DB.prepare(`UPDATE authorities SET verification_status=?,
        pinpoint=COALESCE(NULLIF(?, ''), pinpoint), quoted_language=COALESCE(NULLIF(?, ''), quoted_language),
        date_verified=?, verified_by=?, controlling_marked_by=?, updated_at=? WHERE id=?`)
        .bind(b.status, b.pinpoint || '', b.quotedLanguage || '', verifiedNow ? now() : a.date_verified,
          verifiedNow ? user.email : a.verified_by, b.status === 'Controlling' ? user.email : a.controlling_marked_by,
          now(), b.id).run();
      await audit(env, user.email, 'authority.verify', { caseId: a.case_id, recordType: 'authority', recordId: a.id,
        summary: a.case_name + ' -> ' + b.status });
      const row = await env.DB.prepare('SELECT * FROM authorities WHERE id=?').bind(b.id).first();
      if (!row.quoted_language) warnings.push('No quoted passage retained for this authority.');
      return json({ ...row, warnings }, 200, cors);
    }
    if (seg[0] === 'authorities' && seg[1] && request.method === 'GET') {
      await requireCaseAccess(env, user, seg[1]);
      const r = await env.DB.prepare('SELECT * FROM authorities WHERE case_id=? ORDER BY case_name').bind(seg[1]).all();
      return json(r.results || [], 200, cors);
    }

    // ---- issues ----
    if (seg[0] === 'issues' && seg[1] && request.method === 'GET') {
      await requireCaseAccess(env, user, seg[1]);
      const r = await env.DB.prepare('SELECT * FROM legal_issues WHERE case_id=? ORDER BY created_at').bind(seg[1]).all();
      return json(r.results || [], 200, cors);
    }
    if (path === 'issues' && request.method === 'POST') {
      const b = await readJson(request);
      await requireCaseAccess(env, user, b.caseId);
      const id = uuid();
      await env.DB.prepare('INSERT INTO legal_issues (id, case_id, title, description, related_fact_ids, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)')
        .bind(id, b.caseId, b.title || 'Untitled issue', b.description || '', JSON.stringify(b.relatedFactIds || []), user.email, now(), now()).run();
      await audit(env, user.email, 'issue.create', { caseId: b.caseId, recordType: 'issue', recordId: id, summary: b.title });
      return json(await env.DB.prepare('SELECT * FROM legal_issues WHERE id=?').bind(id).first(), 200, cors);
    }

    // ---- IRAC ----
    if (seg[0] === 'irac' && seg[1] && request.method === 'GET') {
      await requireCaseAccess(env, user, seg[1]);
      const r = await env.DB.prepare('SELECT * FROM irac_blocks WHERE case_id=? ORDER BY created_at').bind(seg[1]).all();
      return json(r.results || [], 200, cors);
    }
    if (path === 'irac' && request.method === 'POST') {
      const b = await readJson(request);
      await requireCaseAccess(env, user, b.caseId);
      const id = b.id || uuid();
      const flags = [];
      if (!(b.linkedFactIds || []).length) flags.push('NO LINKED APPROVED FACTS');
      if (!(b.linkedAuthorityIds || []).length) flags.push('AUTHORITY REQUIRES VERIFICATION');
      await env.DB.prepare(`INSERT INTO irac_blocks (id, case_id, motion_id, label, issue, rule, application, conclusion,
        anticipated_commonwealth, defense_response, linked_fact_ids, linked_authority_ids, linked_exhibit_ids, flags, created_by, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET motion_id=excluded.motion_id, label=excluded.label, issue=excluded.issue, rule=excluded.rule,
        application=excluded.application, conclusion=excluded.conclusion, anticipated_commonwealth=excluded.anticipated_commonwealth,
        defense_response=excluded.defense_response, linked_fact_ids=excluded.linked_fact_ids, linked_authority_ids=excluded.linked_authority_ids,
        linked_exhibit_ids=excluded.linked_exhibit_ids, flags=excluded.flags, updated_at=excluded.updated_at`)
        .bind(id, b.caseId, b.motionId || '', b.label || '', b.issue || '', b.rule || '', b.application || '', b.conclusion || '',
          b.anticipatedCommonwealth || '', b.defenseResponse || '', JSON.stringify(b.linkedFactIds || []),
          JSON.stringify(b.linkedAuthorityIds || []), JSON.stringify(b.linkedExhibitIds || []), JSON.stringify(flags),
          user.email, now(), now()).run();
      return json(await env.DB.prepare('SELECT * FROM irac_blocks WHERE id=?').bind(id).first(), 200, cors);
    }

    // ---- motions ----
    if (seg[0] === 'motions' && seg[1] && !seg[2] && request.method === 'GET') {
      await requireCaseAccess(env, user, seg[1]);
      const r = await env.DB.prepare('SELECT * FROM motions WHERE case_id=? ORDER BY updated_at DESC').bind(seg[1]).all();
      return json(r.results || [], 200, cors);
    }
    if (path === 'motions' && request.method === 'POST') {
      const b = await readJson(request);
      await requireCaseAccess(env, user, b.caseId);
      const id = uuid();
      await env.DB.prepare(`INSERT INTO motions (id, case_id, motion_type, title, status, selected_fact_ids, selected_finding_ids,
        selected_authority_ids, selected_exhibit_ids, sections, proposed_order, certificate_of_service, created_by, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(id, b.caseId, String(b.motionType || ''), b.title || 'Untitled Motion', 'Issue Identified',
          JSON.stringify(b.selectedFactIds || []), JSON.stringify(b.selectedFindingIds || []),
          JSON.stringify(b.selectedAuthorityIds || []), JSON.stringify(b.selectedExhibitIds || []),
          JSON.stringify(b.sections || []), b.proposedOrder || '', b.certificateOfService || '', user.email, now(), now()).run();
      await audit(env, user.email, 'motion.create', { caseId: b.caseId, recordType: 'motion', recordId: id, summary: b.title });
      return json(await getMotion(env, id), 200, cors);
    }
    if (seg[0] === 'motion' && seg[1]) {
      const motion = await getMotion(env, seg[1]);
      if (!motion) throw Object.assign(new Error('Motion not found'), { status: 404 });
      await requireCaseAccess(env, user, motion.case_id);
      const sub = seg[2] || '';

      if (!sub && request.method === 'GET') return json(motion, 200, cors);

      if (!sub && request.method === 'PUT') {
        const b = await readJson(request);
        if (b.status && !MOTION_STATUSES.includes(b.status)) throw Object.assign(new Error('Invalid motion status'), { status: 400 });
        if (b.status === 'Approved for Filing') throw Object.assign(new Error('Use /legal-api/motion/:id/approve for filing approval.'), { status: 400 });
        // any content change: bump version, snapshot prior, drop existing filing approval
        const contentKeys = ['sections', 'proposedOrder', 'certificateOfService', 'selectedFactIds', 'selectedFindingIds', 'selectedAuthorityIds', 'selectedExhibitIds', 'title'];
        const contentChanged = contentKeys.some(k => b[k] !== undefined);
        let version = motion.version, approvalCleared = false;
        if (contentChanged) {
          await env.DB.prepare('INSERT INTO motion_versions (id, motion_id, version, snapshot, saved_by, created_at) VALUES (?,?,?,?,?,?)')
            .bind(uuid(), motion.id, motion.version, JSON.stringify(motion), user.email, now()).run();
          version = motion.version + 1;
          if (motion.approved_at) {
            approvalCleared = true;
            await audit(env, user.email, 'motion.approval_removed', { caseId: motion.case_id, recordType: 'motion', recordId: motion.id, summary: 'Content changed after approval; version ' + version + ' requires reapproval.' });
          }
        }
        await env.DB.prepare(`UPDATE motions SET title=COALESCE(?, title), status=COALESCE(?, status),
          selected_fact_ids=COALESCE(?, selected_fact_ids), selected_finding_ids=COALESCE(?, selected_finding_ids),
          selected_authority_ids=COALESCE(?, selected_authority_ids), selected_exhibit_ids=COALESCE(?, selected_exhibit_ids),
          sections=COALESCE(?, sections), proposed_order=COALESCE(?, proposed_order), certificate_of_service=COALESCE(?, certificate_of_service),
          version=?, approved_by=CASE WHEN ? THEN '' ELSE approved_by END, approved_by_email=CASE WHEN ? THEN '' ELSE approved_by_email END,
          approved_at=CASE WHEN ? THEN '' ELSE approved_at END, approved_version=CASE WHEN ? THEN 0 ELSE approved_version END,
          status=CASE WHEN ? AND status='Approved for Filing' THEN 'Revision Required' ELSE COALESCE(?, status) END, updated_at=?
          WHERE id=?`)
          .bind(b.title ?? null, b.status ?? null,
            b.selectedFactIds ? JSON.stringify(b.selectedFactIds) : null,
            b.selectedFindingIds ? JSON.stringify(b.selectedFindingIds) : null,
            b.selectedAuthorityIds ? JSON.stringify(b.selectedAuthorityIds) : null,
            b.selectedExhibitIds ? JSON.stringify(b.selectedExhibitIds) : null,
            b.sections ? JSON.stringify(b.sections) : null, b.proposedOrder ?? null, b.certificateOfService ?? null,
            version, approvalCleared ? 1 : 0, approvalCleared ? 1 : 0, approvalCleared ? 1 : 0, approvalCleared ? 1 : 0,
            approvalCleared ? 1 : 0, b.status ?? null, now(), motion.id).run();
        return json(await getMotion(env, motion.id), 200, cors);
      }

      if (sub === 'versions' && request.method === 'GET') {
        const r = await env.DB.prepare('SELECT id, version, saved_by, created_at FROM motion_versions WHERE motion_id=? ORDER BY version DESC').bind(motion.id).all();
        return json(r.results || [], 200, cors);
      }
      if (sub === 'review' && request.method === 'GET') {
        const ec = Object.fromEntries(url.searchParams);
        return json(await filingReview(env, motion, ec), 200, cors);
      }
      if (sub === 'approve' && request.method === 'POST') {
        if (!APPROVER_ROLES.includes(user.role)) throw Object.assign(new Error('Only an Attorney, Supervisor, or Administrator may approve a motion for filing.'), { status: 403 });
        const b = await readJson(request);
        const review = await filingReview(env, motion, b.expectedCase || {});
        if (!review.ok) return json({ error: 'Filing review failed; approval blocked.', review }, 422, cors);
        await env.DB.prepare(`UPDATE motions SET status='Approved for Filing', approved_by=?, approved_by_email=?, approved_at=?,
          approval_statement=?, approval_conditions=?, approved_version=version, filing_warnings=?, updated_at=? WHERE id=?`)
          .bind(b.attorneyName || user.name || user.email, user.email, now(),
            b.statement || 'Reviewed and approved for filing.', b.conditions || '',
            JSON.stringify(review.warnings), now(), motion.id).run();
        await audit(env, user.email, 'motion.approve', { caseId: motion.case_id, recordType: 'motion', recordId: motion.id, summary: 'v' + motion.version + ' approved by ' + (b.attorneyName || user.email) });
        return json(await getMotion(env, motion.id), 200, cors);
      }
      if (sub === 'prepare' && request.method === 'POST') {
        // "prepare-motion": outline only; complete drafting is refused until facts+authorities reviewed
        const b = await readJson(request);
        const factsOk = (JSON.parse(motion.selected_fact_ids || '[]')).length > 0 && b.factsReviewed === true;
        const authsOk = b.authoritiesReviewed === true;
        if (!factsOk || !authsOk) {
          return json({ error: 'Outline only: mark selected facts and authorities as reviewed before full drafting.', outlineOnly: true }, 428, cors);
        }
        await env.DB.prepare("UPDATE motions SET status='Ready to Draft', updated_at=? WHERE id=?").bind(now(), motion.id).run();
        return json({ ok: true, status: 'Ready to Draft' }, 200, cors);
      }
      if (sub === 'draft' && request.method === 'POST') {
        if (!['Ready to Draft', 'Draft', 'Revision Required'].includes(motion.status)) {
          throw Object.assign(new Error('Motion must be Ready to Draft (facts and authorities reviewed) before Claude drafting.'), { status: 428 });
        }
        const b = await readJson(request);
        const result = await draftMotion(env, user.email, motion, b);
        return json(result, 200, cors);
      }
      if (sub === 'revise' && request.method === 'POST') {
        const b = await readJson(request);
        return json(await reviseSection(env, user.email, motion, b), 200, cors);
      }
      if (sub === 'verify' && request.method === 'POST') {
        return json(await verifyDraft(env, user.email, motion, {}), 200, cors);
      }
      if (sub === 'export' && seg[3]) {
        const fmt = seg[3];
        const authMap = await authorityMapFor(env, motion);
  const clean = { ...motion, sections: JSON.stringify(JSON.parse(motion.sections || '[]').map(s => ({ ...s, body: stripTags(s.body, authMap) }))) };
        if (fmt === 'html') return new Response(attorneyHtml(motion), { headers: { 'content-type': 'text/html', ...cors } }); // attorney HTML keeps tags clickable
        if (fmt === 'docx') return new Response(buildDocx(compileBlocks(clean)), { headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'content-disposition': 'attachment; filename="motion.docx"', ...cors } });
        if (fmt === 'zip') {
          if (motion.status !== 'Approved for Filing' && motion.status !== 'Filed') {
            throw Object.assign(new Error('Filing ZIP is generated only from an approved motion.'), { status: 428 });
          }
          const zip = await buildFilingZip(env, motion);
          await audit(env, user.email, 'motion.export_zip', { caseId: motion.case_id, recordType: 'motion', recordId: motion.id });
          return new Response(zip, { headers: { 'content-type': 'application/zip', 'content-disposition': 'attachment; filename="filing.zip"', ...cors } });
        }
      }
      if (sub === 'finalize' && request.method === 'POST') {
        if (motion.status !== 'Approved for Filing') throw Object.assign(new Error('Approve the motion before finalizing.'), { status: 428 });
        await env.DB.prepare("UPDATE motions SET status='Filed', updated_at=? WHERE id=?").bind(now(), motion.id).run();
        await audit(env, user.email, 'motion.filed', { caseId: motion.case_id, recordType: 'motion', recordId: motion.id });
        return json({ ok: true, status: 'Filed' }, 200, cors);
      }
    }

    // ---- files (R2) ----
    if (path === 'files' && request.method === 'POST') {
      const caseId = url.searchParams.get('caseId') || '';
      await requireCaseAccess(env, user, caseId);
      const filename = url.searchParams.get('filename') || 'upload.bin';
      const ext = '.' + (filename.split('.').pop() || '').toLowerCase();
      if (!ALLOWED_EXT.includes(ext)) throw Object.assign(new Error('File type not accepted: ' + ext), { status: 415 });
      const len = Number(request.headers.get('content-length') || 0);
      if (len > MAX_UPLOAD) throw Object.assign(new Error('File exceeds 250 MB limit'), { status: 413 });
      if (!request.body) throw Object.assign(new Error('Upload body is required'), { status: 400 });
      const id = uuid();
      const key = `legal/${caseId}/${id}_${safeName(filename)}`;
      const contentType = request.headers.get('content-type') || 'application/octet-stream';
      const [r2Stream, hashInput] = request.body.tee();
      const putPromise = env.FILES.put(key, r2Stream, { httpMetadata: { contentType } });
      let hash, size;
      try {
        const measured = await hashStream(hashInput, { retain: false });
        hash = measured.hash;
        size = measured.size;
        await putPromise;
      } catch (error) {
        try { await env.FILES.delete(key); } catch (_) {}
        throw error;
      }
      if (size > MAX_UPLOAD) {
        try { await env.FILES.delete(key); } catch (_) {}
        throw Object.assign(new Error('File exceeds 250 MB limit'), { status: 413 });
      }
      try {
        await env.DB.prepare(`INSERT INTO legal_files (id, case_id, original_filename, stored_key, mime_type, size, sha256,
          uploaded_by, uploaded_at, category, confidentiality, related_motion_id, exhibit_title)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .bind(id, caseId, filename, key, contentType, size, hash, user.email, now(),
            url.searchParams.get('category') || 'exhibit', url.searchParams.get('confidentiality') || 'standard',
            url.searchParams.get('motionId') || '', url.searchParams.get('title') || '').run();
        await audit(env, user.email, 'file.upload', { caseId, recordType: 'file', recordId: id, summary: filename });
      } catch (error) {
        try { await env.FILES.delete(key); } catch (_) {}
        throw error;
      }
      return json(await env.DB.prepare('SELECT * FROM legal_files WHERE id=?').bind(id).first(), 200, cors);
    }
    if (seg[0] === 'files' && seg[1] && !seg[2] && request.method === 'GET') {
      await requireCaseAccess(env, user, seg[1]);
      const r = await env.DB.prepare('SELECT * FROM legal_files WHERE case_id=? ORDER BY exhibit_number, uploaded_at').bind(seg[1]).all();
      return json(r.results || [], 200, cors);
    }
    if (seg[0] === 'file' && seg[1]) {
      const f = await env.DB.prepare('SELECT * FROM legal_files WHERE id=?').bind(seg[1]).first();
      if (!f) throw Object.assign(new Error('File not found'), { status: 404 });
      await requireCaseAccess(env, user, f.case_id);   // R2 ownership: access only via case assignment
      if (request.method === 'PUT') {
        const b = await readJson(request);
        await env.DB.prepare('UPDATE legal_files SET exhibit_number=COALESCE(?, exhibit_number), exhibit_title=COALESCE(?, exhibit_title), category=COALESCE(?, category), confidentiality=COALESCE(?, confidentiality), related_motion_id=COALESCE(?, related_motion_id), attorney_notes=COALESCE(?, attorney_notes) WHERE id=?')
          .bind(b.exhibitNumber ?? null, b.exhibitTitle ?? null, b.category ?? null, b.confidentiality ?? null, b.relatedMotionId ?? null, b.attorneyNotes ?? null, f.id).run();
        return json(await env.DB.prepare('SELECT * FROM legal_files WHERE id=?').bind(f.id).first(), 200, cors);
      }
      const obj = await env.FILES.get(f.stored_key);
      if (!obj) throw Object.assign(new Error('Stored object missing'), { status: 404 });
      return new Response(obj.body, { headers: { 'content-type': f.mime_type || 'application/octet-stream', ...cors } });
    }

    // ---- audit ----
    if (seg[0] === 'audit' && seg[1] && request.method === 'GET') {
      await requireCaseAccess(env, user, seg[1]);
      const r = await env.DB.prepare('SELECT * FROM legal_audit WHERE case_id=? ORDER BY at DESC LIMIT 300').bind(seg[1]).all();
      return json(r.results || [], 200, cors);
    }

    return json({ error: 'Not found' }, 404, cors);
  } catch (e) {
    return json({ error: e.message, ...(e.fabricated ? { fabricated: e.fabricated } : {}) }, e.status || 500, cors);
  }
}

export default { fetch: (request, env) => handleRequest(request, env) };
