// ARC MOTION local server. Localhost only by default. Server-side API keys only.
import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { db, uuid, now, audit, updateRow, ROOT, CASES_DIR, BACKUP_DIR, EXPORT_DIR } from './db.mjs';
import { recommend, MOTION_BANK } from './services/recommend.mjs';
import * as X from './services/export.mjs';

const app = express();
const PORT = parseInt(process.env.ARC_PORT || '8790', 10);
const HOST = process.env.ARC_HOST || '127.0.0.1';

app.use(express.json({ limit: '5mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'");
  next();
});
app.use(express.static(path.join(ROOT, 'app')));

// ---- upload handling --------------------------------------------------------
const ALLOWED_EXT = new Set(['.pdf', '.docx', '.txt', '.html', '.htm', '.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff', '.csv', '.json', '.mp3', '.wav', '.mp4', '.mov']);
const safeName = s => s.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '_').slice(0, 180);
const storage = multer.diskStorage({
  destination(req, file, cb) {
    const caseId = req.params.caseId;
    if (!db.prepare('SELECT id FROM cases WHERE id=?').get(caseId)) return cb(new Error('Unknown case'));
    const dir = path.join(CASES_DIR, caseId, 'originals');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) { cb(null, `${Date.now()}_${safeName(file.originalname)}`); },
});
const upload = multer({
  storage, limits: { fileSize: 250 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(ALLOWED_EXT.has(ext) ? null : new Error(`File type ${ext} is not accepted`), ALLOWED_EXT.has(ext));
  },
});
const insideCases = p => path.resolve(p).startsWith(path.resolve(CASES_DIR) + path.sep);

const list = (t, caseId, order = 'created_at') =>
  db.prepare(`SELECT * FROM ${t} WHERE case_id=? ORDER BY ${order}`).all(caseId);
const asBool = v => (v === true || v === 1 || v === '1' ? 1 : 0);

// ---- settings & first launch ------------------------------------------------
app.get('/api/state', (req, res) => {
  const settings = Object.fromEntries(db.prepare('SELECT key,value FROM settings').all().map(r => [r.key, r.value]));
  const profiles = db.prepare('SELECT * FROM attorney_profiles ORDER BY is_default DESC, name').all();
  res.json({ settings, profiles, firstLaunch: !settings.setup_complete, aiConfigured: Boolean(process.env.ARC_AI_KEY) });
});
app.post('/api/settings', (req, res) => {
  const put = db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  for (const [k, v] of Object.entries(req.body || {})) put.run(String(k), String(v));
  res.json({ ok: true });
});

// ---- attorney profiles ------------------------------------------------------
const PROFILE_COLS = ['name', 'bbo', 'firm', 'address', 'city', 'state', 'zip', 'phone', 'email', 'signature_block',
  'cert_service_language', 'default_court', 'default_exhibit_numbering', 'default_font', 'default_margins', 'is_default'];
app.get('/api/profiles', (req, res) => res.json(db.prepare('SELECT * FROM attorney_profiles ORDER BY is_default DESC, name').all()));
app.post('/api/profiles', (req, res) => {
  const id = uuid();
  const b = req.body;
  if (!b.name) return res.status(400).json({ error: 'Attorney name is required' });
  if (asBool(b.is_default)) db.prepare('UPDATE attorney_profiles SET is_default=0').run();
  db.prepare(`INSERT INTO attorney_profiles (id,name,bbo,firm,address,city,state,zip,phone,email,signature_block,cert_service_language,default_court,default_exhibit_numbering,default_font,default_margins,is_default,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, b.name, b.bbo || '', b.firm || '', b.address || '', b.city || '', b.state || 'MA', b.zip || '', b.phone || '', b.email || '',
      b.signature_block || '', b.cert_service_language || '', b.default_court || '', b.default_exhibit_numbering || 'numeric',
      b.default_font || 'Times New Roman', b.default_margins || '1in', asBool(b.is_default), now(), now());
  audit('profile.create', { recordType: 'attorney_profile', recordId: id, summary: b.name });
  res.json(db.prepare('SELECT * FROM attorney_profiles WHERE id=?').get(id));
});
app.put('/api/profiles/:id', (req, res) => {
  if (asBool(req.body.is_default)) db.prepare('UPDATE attorney_profiles SET is_default=0').run();
  res.json(updateRow('attorney_profiles', req.params.id, { ...req.body, is_default: asBool(req.body.is_default) }, PROFILE_COLS));
});

// ---- cases ------------------------------------------------------------------
const CASE_COLS = ['client_name', 'client_pronouns', 'docket_number', 'court_department', 'court_division', 'county',
  'attorney_profile_id', 'custody_status', 'bail_status', 'next_court_date', 'procedural_posture', 'arrest_date',
  'incident_date', 'discovery_due', 'motion_deadline', 'trial_date', 'judge', 'prosecutor', 'police_department',
  'notes', 'tags', 'archived'];
app.get('/api/cases', (req, res) => res.json(db.prepare('SELECT * FROM cases ORDER BY archived, updated_at DESC').all()));
app.post('/api/cases', (req, res) => {
  const b = req.body;
  if (!b.client_name) return res.status(400).json({ error: 'Client name is required' });
  const id = uuid();
  const arcId = 'ARC-' + new Date().getFullYear() + '-' + String(db.prepare('SELECT COUNT(*) c FROM cases').get().c + 1).padStart(4, '0');
  db.prepare(`INSERT INTO cases (id, arc_case_id, client_name, created_at, updated_at) VALUES (?,?,?,?,?)`)
    .run(id, arcId, b.client_name, now(), now());
  updateRow('cases', id, b, CASE_COLS);
  for (const dir of ['originals', 'generated', 'images', 'thumbnails']) fs.mkdirSync(path.join(CASES_DIR, id, dir), { recursive: true });
  for (const c of b.charges || []) db.prepare('INSERT INTO charges (id, case_id, charge, statute, sort_order) VALUES (?,?,?,?,?)').run(uuid(), id, c.charge, c.statute || '', c.sort_order || 0);
  audit('case.create', { recordType: 'case', recordId: id, caseId: id, summary: `${arcId} ${b.client_name}` });
  res.json(db.prepare('SELECT * FROM cases WHERE id=?').get(id));
});
app.get('/api/cases/:caseId', (req, res) => {
  const c = db.prepare('SELECT * FROM cases WHERE id=?').get(req.params.caseId);
  if (!c) return res.status(404).json({ error: 'Not found' });
  c.charges = db.prepare('SELECT * FROM charges WHERE case_id=? ORDER BY sort_order').all(c.id);
  res.json(c);
});
app.put('/api/cases/:caseId', (req, res) => {
  const prev = db.prepare('SELECT * FROM cases WHERE id=?').get(req.params.caseId);
  const row = updateRow('cases', req.params.caseId, req.body, CASE_COLS);
  if (Array.isArray(req.body.charges)) {
    db.prepare('DELETE FROM charges WHERE case_id=?').run(req.params.caseId);
    for (const [i, c] of req.body.charges.entries())
      db.prepare('INSERT INTO charges (id, case_id, charge, statute, sort_order) VALUES (?,?,?,?,?)').run(uuid(), req.params.caseId, c.charge, c.statute || '', i);
  }
  audit('case.update', { recordType: 'case', recordId: row.id, caseId: row.id, prev, next: req.body });
  res.json(row);
});

// ---- documents --------------------------------------------------------------
const DOC_COLS = ['source', 'producing_agency', 'discovery_batch', 'bates_range', 'description', 'privilege',
  'confidentiality', 'document_date', 'author', 'related_people', 'related_charges', 'processing_status', 'notes'];
app.get('/api/cases/:caseId/documents', (req, res) => res.json(list('documents', req.params.caseId, 'uploaded_at DESC')));
app.post('/api/cases/:caseId/documents', upload.array('files', 40), (req, res) => {
  const out = [];
  for (const f of req.files || []) {
    const id = uuid();
    const sha = crypto.createHash('sha256').update(fs.readFileSync(f.path)).digest('hex');
    db.prepare(`INSERT INTO documents (id, case_id, original_filename, stored_filename, file_type, file_size, uploaded_at, sha256, source, description)
      VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(id, req.params.caseId, f.originalname, f.filename, path.extname(f.originalname).slice(1).toLowerCase(), f.size, now(), sha,
        req.body.source || '', req.body.description || '');
    audit('document.upload', { recordType: 'document', recordId: id, caseId: req.params.caseId, summary: f.originalname });
    out.push(db.prepare('SELECT * FROM documents WHERE id=?').get(id));
  }
  res.json(out);
});
app.put('/api/documents/:id', (req, res) => res.json(updateRow('documents', req.params.id, req.body, DOC_COLS)));
app.delete('/api/documents/:id', (req, res) => {
  const d = db.prepare('SELECT * FROM documents WHERE id=?').get(req.params.id);
  if (d) {
    audit('document.delete', { recordType: 'document', recordId: d.id, caseId: d.case_id, summary: d.original_filename });
    db.prepare('DELETE FROM documents WHERE id=?').run(d.id); // original file intentionally kept on disk
  }
  res.json({ ok: true });
});
app.get('/api/documents/:id/file', (req, res) => {
  const d = db.prepare('SELECT * FROM documents WHERE id=?').get(req.params.id);
  if (!d) return res.status(404).end();
  const p = path.join(CASES_DIR, d.case_id, 'originals', d.stored_filename);
  if (!insideCases(p) || !fs.existsSync(p)) return res.status(404).end();
  res.sendFile(p);
});

// ---- people -----------------------------------------------------------------
const PEOPLE_COLS = ['name', 'role', 'agency', 'badge', 'contact', 'credibility_issues', 'prior_inconsistent',
  'identification_involvement', 'disclosure_issues', 'notes'];
app.get('/api/cases/:caseId/people', (req, res) => res.json(list('people', req.params.caseId, 'role, name')));
app.post('/api/cases/:caseId/people', (req, res) => {
  const id = uuid();
  db.prepare('INSERT INTO people (id, case_id, name, role, created_at) VALUES (?,?,?,?,?)')
    .run(id, req.params.caseId, req.body.name || '[NAME]', req.body.role || 'other', now());
  res.json(updateRow('people', id, req.body, PEOPLE_COLS));
});
app.put('/api/people/:id', (req, res) => res.json(updateRow('people', req.params.id, req.body, PEOPLE_COLS)));
app.delete('/api/people/:id', (req, res) => { db.prepare('DELETE FROM people WHERE id=?').run(req.params.id); res.json({ ok: true }); });

// ---- facts & conflicts ------------------------------------------------------
const FACT_COLS = ['statement', 'source_document_id', 'page', 'paragraph', 'line', 'timestamp_ref', 'image_ref',
  'asserted_by', 'event_date', 'location', 'category', 'confidence', 'verification', 'defense_significance',
  'commonwealth_significance', 'conflict_status', 'related_facts', 'related_witnesses', 'related_officers',
  'related_motions', 'notes', 'ai_generated'];
app.get('/api/cases/:caseId/facts', (req, res) => res.json(list('facts', req.params.caseId)));
app.post('/api/cases/:caseId/facts', (req, res) => {
  if (!req.body.statement) return res.status(400).json({ error: 'Fact statement is required' });
  const id = uuid();
  db.prepare('INSERT INTO facts (id, case_id, statement, created_at, updated_at) VALUES (?,?,?,?,?)')
    .run(id, req.params.caseId, req.body.statement, now(), now());
  const row = updateRow('facts', id, req.body, FACT_COLS);
  audit('fact.create', { recordType: 'fact', recordId: id, caseId: req.params.caseId, summary: req.body.statement.slice(0, 120) });
  res.json(row);
});
app.put('/api/facts/:id', (req, res) => {
  const prev = db.prepare('SELECT * FROM facts WHERE id=?').get(req.params.id);
  const row = updateRow('facts', req.params.id, req.body, FACT_COLS);
  audit(req.body.verification && req.body.verification !== prev.verification ? 'fact.verify' : 'fact.update',
    { recordType: 'fact', recordId: row.id, caseId: row.case_id, prev: prev.verification, next: row.verification });
  res.json(row);
});
app.delete('/api/facts/:id', (req, res) => { db.prepare('DELETE FROM facts WHERE id=?').run(req.params.id); res.json({ ok: true }); });

app.get('/api/cases/:caseId/conflicts', (req, res) => {
  const rows = list('fact_conflicts', req.params.caseId);
  const f = id => db.prepare('SELECT id, statement, asserted_by, verification, page FROM facts WHERE id=?').get(id);
  res.json(rows.map(r => ({ ...r, a: f(r.fact_a), b: f(r.fact_b) })));
});
app.post('/api/cases/:caseId/conflicts', (req, res) => {
  const id = uuid();
  db.prepare('INSERT INTO fact_conflicts (id, case_id, fact_a, fact_b, conflict_type, status, attorney_note, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(id, req.params.caseId, req.body.fact_a, req.body.fact_b, req.body.conflict_type || 'description', 'unresolved', req.body.attorney_note || '', now(), now());
  db.prepare("UPDATE facts SET conflict_status='unresolved' WHERE id IN (?,?)").run(req.body.fact_a, req.body.fact_b);
  res.json(db.prepare('SELECT * FROM fact_conflicts WHERE id=?').get(id));
});
app.put('/api/conflicts/:id', (req, res) => {
  const row = updateRow('fact_conflicts', req.params.id, req.body, ['status', 'attorney_note', 'conflict_type']);
  const map = { unresolved: 'unresolved', material: 'material', immaterial: 'immaterial', resolved_source: 'resolved_source', attorney_determination: 'attorney_determination' };
  if (map[row.status]) db.prepare('UPDATE facts SET conflict_status=? WHERE id IN (?,?)').run(map[row.status], row.fact_a, row.fact_b);
  res.json(row);
});

// ---- motion bank & recommendations -----------------------------------------
app.get('/api/motion-bank', (req, res) => res.json(MOTION_BANK));
app.post('/api/cases/:caseId/recommend', (req, res) => {
  const caseRow = db.prepare('SELECT * FROM cases WHERE id=?').get(req.params.caseId);
  if (!caseRow) return res.status(404).json({ error: 'Not found' });
  const facts = list('facts', caseRow.id);
  const recs = recommend(caseRow, facts);
  const existing = new Set(db.prepare('SELECT title FROM motions WHERE case_id=?').all(caseRow.id).map(r => r.title));
  const created = [];
  for (const r of recs) {
    if (existing.has(r.title)) continue;
    const id = uuid();
    db.prepare(`INSERT INTO motions (id, case_id, bank_id, title, category, status, factual_basis, missing_facts, legal_issues,
      potential_authorities, requested_relief, risks, confidence, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, caseRow.id, r.bank_id, r.title, r.category, r.status, r.factual_basis, r.missing_facts, r.legal_issues,
        r.potential_authorities, r.requested_relief, r.risks, r.confidence, now(), now());
    created.push(id);
    audit('motion.recommend', { recordType: 'motion', recordId: id, caseId: caseRow.id, summary: `${r.title} → ${r.status}` });
  }
  res.json({ created: created.length, total: recs.length, recommendations: recs });
});

// ---- motions ----------------------------------------------------------------
const MOTION_COLS = ['title', 'category', 'status', 'factual_basis', 'missing_facts', 'missing_discovery', 'legal_issues',
  'potential_authorities', 'risks', 'requested_relief', 'hearing_required', 'affidavit_required', 'proposed_order_required',
  'exhibits_recommended', 'attorney_actions', 'attorney_decision', 'filing_date', 'court_ruling', 'notes'];
app.get('/api/cases/:caseId/motions', (req, res) => res.json(list('motions', req.params.caseId, 'updated_at DESC')));
app.post('/api/cases/:caseId/motions', (req, res) => {
  const id = uuid();
  db.prepare('INSERT INTO motions (id, case_id, title, status, created_at, updated_at) VALUES (?,?,?,?,?,?)')
    .run(id, req.params.caseId, req.body.title || 'Untitled Motion', req.body.status || 'Drafting', now(), now());
  const row = updateRow('motions', id, req.body, MOTION_COLS);
  audit('motion.create', { recordType: 'motion', recordId: id, caseId: req.params.caseId, summary: row.title });
  res.json(row);
});
app.get('/api/motions/:id', (req, res) => {
  const m = db.prepare('SELECT * FROM motions WHERE id=?').get(req.params.id);
  if (!m) return res.status(404).json({ error: 'Not found' });
  m.sections = db.prepare('SELECT * FROM motion_sections WHERE motion_id=? ORDER BY sort_order').all(m.id);
  m.irac = db.prepare('SELECT * FROM irac_blocks WHERE motion_id=? ORDER BY sort_order').all(m.id);
  m.exhibits = db.prepare('SELECT * FROM exhibits WHERE motion_id=? ORDER BY number_value').all(m.id);
  res.json(m);
});
app.put('/api/motions/:id', (req, res) => {
  const prev = db.prepare('SELECT * FROM motions WHERE id=?').get(req.params.id);
  if (!prev) return res.status(404).json({ error: 'Not found' });
  // Approval requires explicit attorney action with a name.
  if (req.body.status === 'Approved for Filing') {
    if (!req.body.approved_by) return res.status(400).json({ error: 'Approval requires the approving attorney name (approved_by).' });
    db.prepare('UPDATE motions SET approved_by=?, approved_at=? WHERE id=?').run(req.body.approved_by, now(), req.params.id);
    audit('motion.approve', { recordType: 'motion', recordId: prev.id, caseId: prev.case_id, summary: `Approved by ${req.body.approved_by}` });
  }
  const row = updateRow('motions', req.params.id, req.body, MOTION_COLS);
  if (prev.status !== row.status) audit('motion.status', { recordType: 'motion', recordId: row.id, caseId: row.case_id, prev: prev.status, next: row.status });
  res.json(row);
});
app.delete('/api/motions/:id', (req, res) => { db.prepare('DELETE FROM motions WHERE id=?').run(req.params.id); res.json({ ok: true }); });

// snapshot + sections
app.post('/api/motions/:id/snapshot', (req, res) => {
  const m = db.prepare('SELECT * FROM motions WHERE id=?').get(req.params.id);
  const sections = db.prepare('SELECT * FROM motion_sections WHERE motion_id=?').all(req.params.id);
  const vid = uuid();
  db.prepare('INSERT INTO motion_versions (id, motion_id, snapshot, created_at, label) VALUES (?,?,?,?,?)')
    .run(vid, req.params.id, JSON.stringify({ motion: m, sections }), now(), req.body.label || '');
  res.json({ id: vid });
});
app.get('/api/motions/:id/versions', (req, res) =>
  res.json(db.prepare('SELECT id, created_at, label FROM motion_versions WHERE motion_id=? ORDER BY created_at DESC').all(req.params.id)));
app.get('/api/versions/:id', (req, res) => res.json(db.prepare('SELECT * FROM motion_versions WHERE id=?').get(req.params.id)));

const SECTION_COLS = ['section_type', 'heading', 'body', 'sort_order', 'irac_id'];
app.post('/api/motions/:id/sections', (req, res) => {
  const id = uuid();
  db.prepare('INSERT INTO motion_sections (id, motion_id, section_type, sort_order, updated_at) VALUES (?,?,?,?,?)')
    .run(id, req.params.id, req.body.section_type || 'argument', req.body.sort_order || 0, now());
  res.json(updateRow('motion_sections', id, req.body, SECTION_COLS));
});
app.put('/api/sections/:id', (req, res) => res.json(updateRow('motion_sections', req.params.id, req.body, SECTION_COLS)));
app.delete('/api/sections/:id', (req, res) => { db.prepare('DELETE FROM motion_sections WHERE id=?').run(req.params.id); res.json({ ok: true }); });

// ---- IRAC -------------------------------------------------------------------
const IRAC_COLS = ['motion_id', 'sort_order', 'label', 'issue', 'issue_framing', 'disputed_questions', 'standard_of_review', 'burden',
  'rule_constitutional', 'rule_statute', 'rule_crim_p', 'rule_evidence', 'rule_controlling', 'rule_supporting', 'rule_test',
  'rule_elements', 'rule_exceptions', 'rule_burden_allocation', 'app_defense_facts', 'app_commonwealth_allegations',
  'app_conflicting_facts', 'app_missing_evidence', 'app_weaknesses', 'app_element_application', 'app_anticipated_commonwealth',
  'app_defense_response', 'linked_fact_ids', 'linked_authority_ids', 'linked_exhibit_ids', 'concl_result', 'concl_suppress',
  'concl_discovery', 'concl_hearing', 'concl_alternative', 'concl_order_language', 'attorney_notes', 'flags'];
app.get('/api/cases/:caseId/irac', (req, res) => res.json(list('irac_blocks', req.params.caseId, 'sort_order')));
app.post('/api/cases/:caseId/irac', (req, res) => {
  const id = uuid();
  db.prepare('INSERT INTO irac_blocks (id, case_id, created_at, updated_at) VALUES (?,?,?,?)').run(id, req.params.caseId, now(), now());
  const row = updateRow('irac_blocks', id, req.body, IRAC_COLS);
  audit('irac.create', { recordType: 'irac', recordId: id, caseId: req.params.caseId, summary: row.label || row.issue.slice(0, 100) });
  res.json(row);
});
app.put('/api/irac/:id', (req, res) => res.json(updateRow('irac_blocks', req.params.id, req.body, IRAC_COLS)));
app.delete('/api/irac/:id', (req, res) => { db.prepare('DELETE FROM irac_blocks WHERE id=?').run(req.params.id); res.json({ ok: true }); });

// Convert an IRAC block into motion argument text (deterministic template, no invention).
app.post('/api/irac/:id/to-argument', (req, res) => {
  const b = db.prepare('SELECT * FROM irac_blocks WHERE id=?').get(req.params.id);
  if (!b) return res.status(404).json({ error: 'Not found' });
  const flags = [];
  if (!b.linked_fact_ids) flags.push('NO LINKED VERIFIED FACTS');
  const authIds = (b.linked_authority_ids || '').split(',').filter(Boolean);
  const unverified = authIds.filter(id => { const a = db.prepare('SELECT attorney_verified FROM authorities WHERE id=?').get(id.trim()); return !a || !a.attorney_verified; });
  if (unverified.length || !authIds.length) flags.push('AUTHORITY REQUIRES VERIFICATION');
  const P = [];
  if (b.issue) P.push(`Issue. ${b.issue}${b.issue_framing ? ' ' + b.issue_framing : ''}`);
  const rules = [b.rule_constitutional, b.rule_statute, b.rule_crim_p, b.rule_evidence, b.rule_controlling, b.rule_supporting].filter(Boolean).join(' ');
  if (rules || b.rule_test) P.push(`Rule. ${rules}${b.rule_test ? ' ' + b.rule_test : ''}${b.rule_elements ? ' The required elements are: ' + b.rule_elements : ''}`);
  const appParts = [b.app_defense_facts, b.app_element_application].filter(Boolean).join(' ');
  if (appParts) P.push(`Application. ${appParts}${b.app_missing_evidence ? ' [FACTUAL SUPPORT REQUIRED: ' + b.app_missing_evidence + ']' : ''}`);
  if (b.app_anticipated_commonwealth) P.push(`The Commonwealth may argue that ${b.app_anticipated_commonwealth}${b.app_defense_response ? ' That argument fails because ' + b.app_defense_response : ''}`);
  if (b.concl_result) P.push(`Conclusion. ${b.concl_result}${b.concl_alternative ? ' In the alternative, ' + b.concl_alternative : ''}`);
  if (flags.length) P.push(`[${flags.join('] [')}]`);
  res.json({ heading: b.label || 'ARGUMENT', body: P.join('\n\n'), flags });
});

// ---- authorities ------------------------------------------------------------
const AUTH_COLS = ['research_question', 'jurisdiction', 'court', 'topic', 'motion_type', 'name', 'citation', 'year', 'level',
  'proposition', 'quotation', 'pinpoint', 'source', 'url', 'date_checked', 'cite_check_status', 'status', 'attorney_verified',
  'notes', 'related_motions', 'related_irac'];
app.get('/api/cases/:caseId/authorities', (req, res) => res.json(list('authorities', req.params.caseId, 'name')));
app.post('/api/cases/:caseId/authorities', (req, res) => {
  if (!req.body.name) return res.status(400).json({ error: 'Authority name is required' });
  const id = uuid();
  db.prepare('INSERT INTO authorities (id, case_id, name, created_at, updated_at) VALUES (?,?,?,?,?)')
    .run(id, req.params.caseId, req.body.name, now(), now());
  const row = updateRow('authorities', id, { ...req.body, attorney_verified: asBool(req.body.attorney_verified) }, AUTH_COLS);
  res.json({ ...row, warnings: authorityWarnings(row) });
});
app.put('/api/authorities/:id', (req, res) => {
  const row = updateRow('authorities', req.params.id, { ...req.body, attorney_verified: req.body.attorney_verified !== undefined ? asBool(req.body.attorney_verified) : undefined }, AUTH_COLS);
  audit('authority.update', { recordType: 'authority', recordId: row.id, caseId: row.case_id, summary: row.name });
  res.json({ ...row, warnings: authorityWarnings(row) });
});
app.delete('/api/authorities/:id', (req, res) => { db.prepare('DELETE FROM authorities WHERE id=?').run(req.params.id); res.json({ ok: true }); });
function authorityWarnings(a) {
  const w = [];
  if (a.citation && !a.pinpoint) w.push('Citation lacks a pinpoint.');
  if (!a.date_checked) w.push('Authority has never been cite-checked.');
  else if ((Date.now() - Date.parse(a.date_checked)) > 90 * 86400e3) w.push('Authority not checked in over 90 days.');
  if (a.quotation && !a.source && !a.url) w.push('Quotation has no verified source.');
  if (/unpublished|1106|1125/i.test(a.citation || '')) w.push('This appears to be an unpublished decision; confirm citation rules before relying on it.');
  if (a.level === 'secondary') w.push('Secondary source: do not treat as controlling.');
  if (/9A/.test(a.citation || '') || /rule 9a/i.test(a.name || '')) w.push('Civil Rule 9A material: not for automatic use in a criminal motion.');
  if (['Overruled', 'Do Not Cite', 'Potentially Superseded', 'Limited'].includes(a.status)) w.push(`Status is "${a.status}".`);
  return w;
}

// ---- exhibits ---------------------------------------------------------------
const EXHIBIT_COLS = ['motion_id', 'label', 'numbering_scheme', 'number_value', 'title', 'description', 'source_document_id',
  'image_id', 'file_path', 'bates', 'exhibit_date', 'source_person', 'authentication_notes', 'custody_notes',
  'attorney_notes', 'confidential', 'admission_status', 'linked_fact_ids'];
app.get('/api/cases/:caseId/exhibits', (req, res) => res.json(list('exhibits', req.params.caseId, 'number_value')));
app.post('/api/cases/:caseId/exhibits', (req, res) => {
  const id = uuid();
  const nextNum = (db.prepare('SELECT MAX(number_value) m FROM exhibits WHERE case_id=? AND (motion_id IS ? OR motion_id=?)').get(req.params.caseId, req.body.motion_id || null, req.body.motion_id || null).m || 0) + 1;
  db.prepare('INSERT INTO exhibits (id, case_id, number_value, created_at, updated_at) VALUES (?,?,?,?,?)')
    .run(id, req.params.caseId, req.body.number_value || nextNum, now(), now());
  // derive file path from source document or image if provided
  const b = { ...req.body, confidential: asBool(req.body.confidential) };
  if (b.source_document_id && !b.file_path) {
    const d = db.prepare('SELECT * FROM documents WHERE id=?').get(b.source_document_id);
    if (d) b.file_path = path.join(CASES_DIR, d.case_id, 'originals', d.stored_filename);
  }
  if (b.image_id && !b.file_path) {
    const img = db.prepare('SELECT * FROM images WHERE id=?').get(b.image_id);
    if (img) b.file_path = img.file_path;
  }
  const row = updateRow('exhibits', id, b, EXHIBIT_COLS);
  audit('exhibit.create', { recordType: 'exhibit', recordId: id, caseId: req.params.caseId, summary: row.title || row.description });
  res.json(row);
});
app.put('/api/exhibits/:id', (req, res) => {
  const row = updateRow('exhibits', req.params.id, { ...req.body, confidential: req.body.confidential !== undefined ? asBool(req.body.confidential) : undefined }, EXHIBIT_COLS);
  audit('exhibit.update', { recordType: 'exhibit', recordId: row.id, caseId: row.case_id });
  res.json(row);
});
app.delete('/api/exhibits/:id', (req, res) => { db.prepare('DELETE FROM exhibits WHERE id=?').run(req.params.id); res.json({ ok: true }); });
// Renumber all exhibits attached to a motion; references update automatically because labels derive from number_value.
app.post('/api/motions/:id/renumber-exhibits', (req, res) => {
  const rows = db.prepare('SELECT * FROM exhibits WHERE motion_id=? ORDER BY number_value').all(req.params.id);
  const order = req.body.order || rows.map(r => r.id);
  const oldLabels = new Map(rows.map(r => [r.id, X.exhibitLabel(r)]));
  order.forEach((id, i) => db.prepare('UPDATE exhibits SET number_value=? WHERE id=?').run(i + 1, id));
  const updated = db.prepare('SELECT * FROM exhibits WHERE motion_id=? ORDER BY number_value').all(req.params.id);
  // update textual references in motion sections
  const sections = db.prepare('SELECT * FROM motion_sections WHERE motion_id=?').all(req.params.id);
  for (const s of sections) {
    let body = s.body;
    const temp = new Map();
    for (const e of updated) {
      const oldL = oldLabels.get(e.id), newL = X.exhibitLabel(e);
      if (oldL && oldL !== newL) { const tok = `\u0000${e.id}\u0000`; body = body.split(oldL).join(tok); temp.set(tok, newL); }
    }
    for (const [tok, newL] of temp) body = body.split(tok).join(newL);
    if (body !== s.body) db.prepare('UPDATE motion_sections SET body=?, updated_at=? WHERE id=?').run(body, now(), s.id);
  }
  audit('exhibit.renumber', { recordType: 'motion', recordId: req.params.id, summary: `Renumbered ${updated.length} exhibits` });
  res.json(updated);
});

// ---- images (Picture Center: direct upload v1) ------------------------------
const IMG_COLS = ['caption', 'description', 'people_shown', 'location_shown', 'date_shown', 'relevance',
  'authentication_issues', 'custody_notes', 'related_fact_ids', 'related_motion_id', 'exhibit_status', 'attorney_verified', 'source_page'];
app.get('/api/cases/:caseId/images', (req, res) => res.json(list('images', req.params.caseId, 'extracted_at DESC')));
app.post('/api/cases/:caseId/images', upload.array('files', 40), (req, res) => {
  const out = [];
  for (const f of req.files || []) {
    if (!/\.(jpe?g|png|webp|tiff?)$/i.test(f.originalname)) continue;
    const id = uuid();
    const dest = path.join(CASES_DIR, req.params.caseId, 'images', f.filename);
    fs.renameSync(f.path, dest);
    const sha = crypto.createHash('sha256').update(fs.readFileSync(dest)).digest('hex');
    db.prepare(`INSERT INTO images (id, case_id, source, extracted_at, format, sha256, file_path) VALUES (?,?,?,?,?,?,?)`)
      .run(id, req.params.caseId, 'upload', now(), path.extname(f.originalname).slice(1).toLowerCase(), sha, dest);
    audit('image.create', { recordType: 'image', recordId: id, caseId: req.params.caseId, summary: f.originalname });
    out.push(db.prepare('SELECT * FROM images WHERE id=?').get(id));
  }
  res.json(out);
});
app.put('/api/images/:id', (req, res) => res.json(updateRow('images', req.params.id, { ...req.body, attorney_verified: req.body.attorney_verified !== undefined ? asBool(req.body.attorney_verified) : undefined }, IMG_COLS)));
app.get('/api/images/:id/file', (req, res) => {
  const img = db.prepare('SELECT * FROM images WHERE id=?').get(req.params.id);
  if (!img || !insideCases(img.file_path) || !fs.existsSync(img.file_path)) return res.status(404).end();
  res.sendFile(path.resolve(img.file_path));
});

// ---- timeline ---------------------------------------------------------------
const TL_COLS = ['event_date', 'event_time', 'title', 'event_type', 'description', 'linked_fact_ids', 'linked_document_ids',
  'linked_image_ids', 'linked_exhibit_ids', 'linked_people_ids', 'linked_motion_ids'];
app.get('/api/cases/:caseId/timeline', (req, res) => res.json(list('timeline_events', req.params.caseId, 'event_date, event_time')));
app.post('/api/cases/:caseId/timeline', (req, res) => {
  const id = uuid();
  db.prepare('INSERT INTO timeline_events (id, case_id, title, created_at) VALUES (?,?,?,?)').run(id, req.params.caseId, req.body.title || 'Event', now());
  res.json(updateRow('timeline_events', id, req.body, TL_COLS));
});
app.put('/api/timeline/:id', (req, res) => res.json(updateRow('timeline_events', req.params.id, req.body, TL_COLS)));
app.delete('/api/timeline/:id', (req, res) => { db.prepare('DELETE FROM timeline_events WHERE id=?').run(req.params.id); res.json({ ok: true }); });

// ---- dashboard --------------------------------------------------------------
app.get('/api/cases/:caseId/dashboard', (req, res) => {
  const c = req.params.caseId;
  const count = (sql, ...args) => db.prepare(sql).get(c, ...args).n;
  res.json({
    unverified_facts: count("SELECT COUNT(*) n FROM facts WHERE case_id=? AND verification!='verified'"),
    conflicts: count("SELECT COUNT(*) n FROM fact_conflicts WHERE case_id=? AND status IN ('unresolved','material')"),
    missing_discovery: count("SELECT COUNT(*) n FROM facts WHERE case_id=? AND category='missing discovery'"),
    motions_by_status: db.prepare('SELECT status, COUNT(*) n FROM motions WHERE case_id=? GROUP BY status').all(c),
    exhibit_count: count('SELECT COUNT(*) n FROM exhibits WHERE case_id=?'),
    document_count: count('SELECT COUNT(*) n FROM documents WHERE case_id=?'),
    authority_count: count('SELECT COUNT(*) n FROM authorities WHERE case_id=?'),
    unverified_authorities: count('SELECT COUNT(*) n FROM authorities WHERE case_id=? AND attorney_verified=0'),
    recent: db.prepare('SELECT at, action, summary FROM audit_log WHERE case_id=? ORDER BY at DESC LIMIT 12').all(c),
  });
});

// ---- exports ----------------------------------------------------------------
app.get('/api/motions/:id/preview', (req, res) => {
  const bundle = X.loadMotionBundle(req.params.id);
  if (!bundle) return res.status(404).end();
  res.type('html').send(X.motionHtml(bundle));
});
app.get('/api/motions/:id/checks', (req, res) => {
  const bundle = X.loadMotionBundle(req.params.id);
  if (!bundle) return res.status(404).end();
  res.json(X.packetChecks(bundle));
});
app.get('/api/motions/:id/export/:fmt', async (req, res) => {
  const bundle = X.loadMotionBundle(req.params.id);
  if (!bundle) return res.status(404).end();
  const stamp = Date.now();
  const base = bundle.motion.title.replace(/[^A-Za-z0-9]+/g, '_').slice(0, 60);
  try {
    if (req.params.fmt === 'html') {
      res.setHeader('Content-Disposition', `attachment; filename="${base}.html"`);
      return res.type('html').send(X.motionHtml(bundle));
    }
    if (req.params.fmt === 'docx') {
      const p = path.join(EXPORT_DIR, `${base}_${stamp}.docx`);
      await X.motionDocx(bundle, p);
      audit('export', { recordType: 'motion', recordId: bundle.motion.id, caseId: bundle.motion.case_id, summary: 'DOCX export' });
      return res.download(p, `${base}.docx`);
    }
    if (req.params.fmt === 'pdf') {
      const p = path.join(EXPORT_DIR, `${base}_${stamp}.pdf`);
      await X.motionPdf(bundle, p);
      audit('export', { recordType: 'motion', recordId: bundle.motion.id, caseId: bundle.motion.case_id, summary: 'PDF export' });
      return res.download(p, `${base}.pdf`);
    }
    if (req.params.fmt === 'packet') {
      const p = path.join(EXPORT_DIR, `${base}_exhibits_${stamp}.pdf`);
      await X.exhibitPacketPdf(bundle, p);
      return res.download(p, `${base}_exhibit_packet.pdf`);
    }
    if (req.params.fmt === 'zip') {
      const p = await X.filingZip(bundle);
      audit('export', { recordType: 'motion', recordId: bundle.motion.id, caseId: bundle.motion.case_id, summary: 'Filing ZIP export' });
      return res.download(p);
    }
    res.status(400).json({ error: 'Unknown format' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/cases/:caseId/export/facts.csv', (req, res) => {
  const rows = list('facts', req.params.caseId);
  const cols = ['id', 'statement', 'category', 'verification', 'asserted_by', 'event_date', 'location', 'page', 'paragraph', 'conflict_status'];
  const csv = [cols.join(','), ...rows.map(r => cols.map(c => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
  res.setHeader('Content-Disposition', 'attachment; filename="facts.csv"');
  res.type('text/csv').send(csv);
});
app.post('/api/cases/:caseId/backup', async (req, res) => {
  try {
    const p = await X.caseBackup(req.params.caseId, BACKUP_DIR);
    audit('backup', { recordType: 'case', recordId: req.params.caseId, caseId: req.params.caseId, summary: path.basename(p) });
    res.json({ path: p, filename: path.basename(p) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/backups', (req, res) =>
  res.json(fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.zip')).map(f => ({ filename: f, size: fs.statSync(path.join(BACKUP_DIR, f)).size }))));

// ---- audit ------------------------------------------------------------------
app.get('/api/cases/:caseId/audit', (req, res) =>
  res.json(db.prepare('SELECT * FROM audit_log WHERE case_id=? ORDER BY at DESC LIMIT 500').all(req.params.caseId)));
app.get('/api/audit', (req, res) => res.json(db.prepare('SELECT * FROM audit_log ORDER BY at DESC LIMIT 500').all()));

// ---- knowledge library ------------------------------------------------------
app.get('/api/knowledge', (req, res) => {
  const kdir = path.join(ROOT, 'knowledge');
  const walk = (dir, rel = '') => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const r = path.join(rel, e.name);
    return e.isDirectory() ? walk(path.join(dir, e.name), r) : [{ path: r, size: fs.statSync(path.join(dir, e.name)).size }];
  });
  res.json({ files: walk(kdir), warning: 'Rules, statutes, cases, standing orders, and local filing procedures must be checked for amendments or changes before filing.' });
});
app.get('/api/knowledge/file', (req, res) => {
  const rel = String(req.query.path || '');
  const p = path.resolve(path.join(ROOT, 'knowledge', rel));
  if (!p.startsWith(path.join(ROOT, 'knowledge') + path.sep) || !fs.existsSync(p)) return res.status(404).end();
  res.sendFile(p);
});

// ---- optional AI provider proxy (server-side key only) ----------------------
app.post('/api/ai', async (req, res) => {
  const key = process.env.ARC_AI_KEY;
  const provider = process.env.ARC_AI_PROVIDER || 'anthropic';
  const model = process.env.ARC_AI_MODEL || (provider === 'anthropic' ? 'claude-sonnet-4-6' : 'gpt-4o-mini');
  if (!key) return res.status(400).json({ error: 'AI is not configured. Set ARC_AI_KEY in .env (server side only). All core functions work without AI.' });
  const { system, prompt } = req.body || {};
  try {
    let text = '';
    if (provider === 'anthropic') {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: 4000, system: system || '', messages: [{ role: 'user', content: prompt || '' }] }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error?.message || 'AI provider error');
      text = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
    } else {
      const base = process.env.ARC_AI_BASE || 'https://api.openai.com/v1';
      const r = await fetch(base + '/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
        body: JSON.stringify({ model, messages: [{ role: 'system', content: system || '' }, { role: 'user', content: prompt || '' }] }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error?.message || 'AI provider error');
      text = j.choices?.[0]?.message?.content || '';
    }
    res.json({ text, note: 'AI output is a PROPOSAL. It is unverified, is not approved for filing, and must be reviewed by counsel.' });
  } catch (e) { res.status(502).json({ error: e.message }); }
});

app.use((err, req, res, next) => res.status(400).json({ error: err.message }));

if (process.env.ARC_NO_LISTEN !== '1') {
  app.listen(PORT, HOST, () => {
    console.log('');
    console.log('  ARC MOTION is running.');
    console.log(`  Open:  http://${HOST}:${PORT}`);
    console.log('  Localhost only. Keep this window open while working.');
    console.log('');
  });
}
export { app };
