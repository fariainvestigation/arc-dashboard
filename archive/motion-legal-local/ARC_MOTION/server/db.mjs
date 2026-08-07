// ARC MOTION database layer. SQLite via better-sqlite3, migrations, FK enforced, UUID keys.
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');
export const DATA_DIR = process.env.ARC_DATA_DIR ? path.resolve(process.env.ARC_DATA_DIR) : path.join(ROOT, 'data');
export const CASES_DIR = path.join(DATA_DIR, 'cases');
export const DB_DIR = path.join(DATA_DIR, 'database');
export const BACKUP_DIR = path.join(DATA_DIR, 'backups');
export const EXPORT_DIR = path.join(ROOT, 'exports');
for (const d of [DATA_DIR, CASES_DIR, DB_DIR, BACKUP_DIR, EXPORT_DIR]) fs.mkdirSync(d, { recursive: true });

export const uuid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();

const dbPath = process.env.ARC_DB_PATH || path.join(DB_DIR, 'arc_motion.sqlite');
export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ---- migrations -------------------------------------------------------------
const MIGRATIONS = [
  {
    id: 1,
    sql: `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS attorney_profiles (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, bbo TEXT DEFAULT '', firm TEXT DEFAULT '',
  address TEXT DEFAULT '', city TEXT DEFAULT '', state TEXT DEFAULT 'MA', zip TEXT DEFAULT '',
  phone TEXT DEFAULT '', email TEXT DEFAULT '',
  signature_block TEXT DEFAULT '', cert_service_language TEXT DEFAULT '',
  default_court TEXT DEFAULT '', default_exhibit_numbering TEXT DEFAULT 'numeric',
  default_font TEXT DEFAULT 'Times New Roman', default_margins TEXT DEFAULT '1in',
  is_default INTEGER DEFAULT 0, created_at TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY, arc_case_id TEXT NOT NULL, client_name TEXT NOT NULL,
  client_pronouns TEXT DEFAULT '', docket_number TEXT DEFAULT '',
  court_department TEXT DEFAULT '', court_division TEXT DEFAULT '', county TEXT DEFAULT '',
  attorney_profile_id TEXT REFERENCES attorney_profiles(id) ON DELETE SET NULL,
  custody_status TEXT DEFAULT '', bail_status TEXT DEFAULT '',
  next_court_date TEXT DEFAULT '', procedural_posture TEXT DEFAULT '',
  arrest_date TEXT DEFAULT '', incident_date TEXT DEFAULT '',
  discovery_due TEXT DEFAULT '', motion_deadline TEXT DEFAULT '', trial_date TEXT DEFAULT '',
  judge TEXT DEFAULT '', prosecutor TEXT DEFAULT '', police_department TEXT DEFAULT '',
  notes TEXT DEFAULT '', tags TEXT DEFAULT '',
  archived INTEGER DEFAULT 0, created_at TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS charges (
  id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  charge TEXT NOT NULL, statute TEXT DEFAULT '', sort_order INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  original_filename TEXT NOT NULL, stored_filename TEXT NOT NULL,
  file_type TEXT DEFAULT '', file_size INTEGER DEFAULT 0, uploaded_at TEXT,
  source TEXT DEFAULT '', producing_agency TEXT DEFAULT '', discovery_batch TEXT DEFAULT '',
  bates_range TEXT DEFAULT '', description TEXT DEFAULT '',
  privilege TEXT DEFAULT 'none', confidentiality TEXT DEFAULT 'none',
  document_date TEXT DEFAULT '', author TEXT DEFAULT '',
  related_people TEXT DEFAULT '', related_charges TEXT DEFAULT '',
  processing_status TEXT DEFAULT 'uploaded', sha256 TEXT DEFAULT '',
  extracted_text_path TEXT DEFAULT '', notes TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  name TEXT NOT NULL, role TEXT DEFAULT 'other', agency TEXT DEFAULT '', badge TEXT DEFAULT '',
  contact TEXT DEFAULT '', credibility_issues TEXT DEFAULT '',
  prior_inconsistent TEXT DEFAULT '', identification_involvement TEXT DEFAULT '',
  disclosure_issues TEXT DEFAULT '', notes TEXT DEFAULT '', created_at TEXT
);
CREATE TABLE IF NOT EXISTS facts (
  id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  statement TEXT NOT NULL,
  source_document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
  page TEXT DEFAULT '', paragraph TEXT DEFAULT '', line TEXT DEFAULT '',
  timestamp_ref TEXT DEFAULT '', image_ref TEXT DEFAULT '',
  asserted_by TEXT DEFAULT '', event_date TEXT DEFAULT '', location TEXT DEFAULT '',
  category TEXT DEFAULT 'other', confidence TEXT DEFAULT 'unspecified',
  verification TEXT DEFAULT 'unverified',       -- unverified | verified | rejected
  defense_significance TEXT DEFAULT '', commonwealth_significance TEXT DEFAULT '',
  conflict_status TEXT DEFAULT 'none',          -- none | unresolved | material | immaterial | resolved_source | attorney_determination
  related_facts TEXT DEFAULT '', related_witnesses TEXT DEFAULT '',
  related_officers TEXT DEFAULT '', related_motions TEXT DEFAULT '',
  ai_generated INTEGER DEFAULT 0, notes TEXT DEFAULT '', created_at TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS fact_conflicts (
  id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  fact_a TEXT NOT NULL REFERENCES facts(id) ON DELETE CASCADE,
  fact_b TEXT NOT NULL REFERENCES facts(id) ON DELETE CASCADE,
  conflict_type TEXT DEFAULT 'description',
  status TEXT DEFAULT 'unresolved',
  attorney_note TEXT DEFAULT '', created_at TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS motions (
  id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  bank_id INTEGER, title TEXT NOT NULL, category TEXT DEFAULT '',
  status TEXT DEFAULT 'Recommended',
  factual_basis TEXT DEFAULT '', missing_facts TEXT DEFAULT '', missing_discovery TEXT DEFAULT '',
  legal_issues TEXT DEFAULT '', potential_authorities TEXT DEFAULT '', risks TEXT DEFAULT '',
  requested_relief TEXT DEFAULT '', hearing_required INTEGER DEFAULT 0,
  affidavit_required INTEGER DEFAULT 0, proposed_order_required INTEGER DEFAULT 1,
  exhibits_recommended TEXT DEFAULT '', attorney_actions TEXT DEFAULT '',
  confidence TEXT DEFAULT 'rule-based', attorney_decision TEXT DEFAULT '',
  filing_date TEXT DEFAULT '', court_ruling TEXT DEFAULT '', notes TEXT DEFAULT '',
  approved_by TEXT DEFAULT '', approved_at TEXT DEFAULT '',
  created_at TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS motion_sections (
  id TEXT PRIMARY KEY, motion_id TEXT NOT NULL REFERENCES motions(id) ON DELETE CASCADE,
  section_type TEXT NOT NULL,   -- caption|title|introduction|procedural_history|facts|legal_standard|argument|irac|relief|conclusion|signature|certificate|affidavit|proposed_order|exhibit_index
  heading TEXT DEFAULT '', body TEXT DEFAULT '', sort_order INTEGER DEFAULT 0,
  irac_id TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS motion_versions (
  id TEXT PRIMARY KEY, motion_id TEXT NOT NULL REFERENCES motions(id) ON DELETE CASCADE,
  snapshot TEXT NOT NULL, created_at TEXT, label TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS irac_blocks (
  id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  motion_id TEXT REFERENCES motions(id) ON DELETE SET NULL,
  sort_order INTEGER DEFAULT 0, label TEXT DEFAULT '',
  issue TEXT DEFAULT '', issue_framing TEXT DEFAULT '', disputed_questions TEXT DEFAULT '',
  standard_of_review TEXT DEFAULT '', burden TEXT DEFAULT '',
  rule_constitutional TEXT DEFAULT '', rule_statute TEXT DEFAULT '', rule_crim_p TEXT DEFAULT '',
  rule_evidence TEXT DEFAULT '', rule_controlling TEXT DEFAULT '', rule_supporting TEXT DEFAULT '',
  rule_test TEXT DEFAULT '', rule_elements TEXT DEFAULT '', rule_exceptions TEXT DEFAULT '',
  rule_burden_allocation TEXT DEFAULT '',
  app_defense_facts TEXT DEFAULT '', app_commonwealth_allegations TEXT DEFAULT '',
  app_conflicting_facts TEXT DEFAULT '', app_missing_evidence TEXT DEFAULT '',
  app_weaknesses TEXT DEFAULT '', app_element_application TEXT DEFAULT '',
  app_anticipated_commonwealth TEXT DEFAULT '', app_defense_response TEXT DEFAULT '',
  linked_fact_ids TEXT DEFAULT '', linked_authority_ids TEXT DEFAULT '', linked_exhibit_ids TEXT DEFAULT '',
  concl_result TEXT DEFAULT '', concl_suppress TEXT DEFAULT '', concl_discovery TEXT DEFAULT '',
  concl_hearing TEXT DEFAULT '', concl_alternative TEXT DEFAULT '', concl_order_language TEXT DEFAULT '',
  attorney_notes TEXT DEFAULT '', flags TEXT DEFAULT '',
  created_at TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS authorities (
  id TEXT PRIMARY KEY, case_id TEXT REFERENCES cases(id) ON DELETE CASCADE,
  research_question TEXT DEFAULT '', jurisdiction TEXT DEFAULT 'Massachusetts',
  court TEXT DEFAULT '', topic TEXT DEFAULT '', motion_type TEXT DEFAULT '',
  name TEXT NOT NULL, citation TEXT DEFAULT '', year TEXT DEFAULT '',
  level TEXT DEFAULT '',                 -- controlling | persuasive | secondary | unverified
  proposition TEXT DEFAULT '', quotation TEXT DEFAULT '', pinpoint TEXT DEFAULT '',
  source TEXT DEFAULT '', url TEXT DEFAULT '', date_checked TEXT DEFAULT '',
  cite_check_status TEXT DEFAULT '',
  status TEXT DEFAULT 'Verification Required',
  attorney_verified INTEGER DEFAULT 0, notes TEXT DEFAULT '',
  related_motions TEXT DEFAULT '', related_irac TEXT DEFAULT '',
  created_at TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS exhibits (
  id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  motion_id TEXT REFERENCES motions(id) ON DELETE SET NULL,
  label TEXT DEFAULT '', numbering_scheme TEXT DEFAULT 'numeric', number_value INTEGER DEFAULT 0,
  title TEXT DEFAULT '', description TEXT DEFAULT '',
  source_document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
  image_id TEXT, file_path TEXT DEFAULT '',
  bates TEXT DEFAULT '', exhibit_date TEXT DEFAULT '', source_person TEXT DEFAULT '',
  authentication_notes TEXT DEFAULT '', custody_notes TEXT DEFAULT '',
  attorney_notes TEXT DEFAULT '', confidential INTEGER DEFAULT 0,
  admission_status TEXT DEFAULT 'proposed',
  linked_fact_ids TEXT DEFAULT '', created_at TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  source TEXT DEFAULT 'upload', source_document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
  source_page TEXT DEFAULT '', extracted_at TEXT, width INTEGER DEFAULT 0, height INTEGER DEFAULT 0,
  format TEXT DEFAULT '', sha256 TEXT DEFAULT '', file_path TEXT NOT NULL,
  derivative_of TEXT, caption TEXT DEFAULT '', description TEXT DEFAULT '',
  people_shown TEXT DEFAULT '', location_shown TEXT DEFAULT '', date_shown TEXT DEFAULT '',
  relevance TEXT DEFAULT '', authentication_issues TEXT DEFAULT '', custody_notes TEXT DEFAULT '',
  related_fact_ids TEXT DEFAULT '', related_motion_id TEXT DEFAULT '',
  exhibit_status TEXT DEFAULT 'none', attorney_verified INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS timeline_events (
  id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  event_date TEXT DEFAULT '', event_time TEXT DEFAULT '', title TEXT NOT NULL,
  event_type TEXT DEFAULT 'incident', description TEXT DEFAULT '',
  linked_fact_ids TEXT DEFAULT '', linked_document_ids TEXT DEFAULT '',
  linked_image_ids TEXT DEFAULT '', linked_exhibit_ids TEXT DEFAULT '',
  linked_people_ids TEXT DEFAULT '', linked_motion_ids TEXT DEFAULT '',
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY, at TEXT NOT NULL, user TEXT DEFAULT 'local',
  action TEXT NOT NULL, record_type TEXT DEFAULT '', record_id TEXT DEFAULT '',
  case_id TEXT DEFAULT '', summary TEXT DEFAULT '', prev_value TEXT DEFAULT '', new_value TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_docs_case ON documents(case_id);
CREATE INDEX IF NOT EXISTS idx_facts_case ON facts(case_id);
CREATE INDEX IF NOT EXISTS idx_motions_case ON motions(case_id);
CREATE INDEX IF NOT EXISTS idx_audit_case ON audit_log(case_id);
`
  }
];

db.exec(`CREATE TABLE IF NOT EXISTS _migrations (id INTEGER PRIMARY KEY, applied_at TEXT)`);
const applied = new Set(db.prepare('SELECT id FROM _migrations').all().map(r => r.id));
for (const m of MIGRATIONS) {
  if (!applied.has(m.id)) {
    db.exec(m.sql);
    db.prepare('INSERT INTO _migrations (id, applied_at) VALUES (?, ?)').run(m.id, now());
  }
}

// ---- audit ------------------------------------------------------------------
const auditStmt = db.prepare(`INSERT INTO audit_log (id, at, user, action, record_type, record_id, case_id, summary, prev_value, new_value)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
export function audit(action, { recordType = '', recordId = '', caseId = '', summary = '', prev = '', next = '', user = 'local' } = {}) {
  auditStmt.run(uuid(), now(), user, action, recordType, recordId, caseId, summary,
    typeof prev === 'string' ? prev : JSON.stringify(prev),
    typeof next === 'string' ? next : JSON.stringify(next));
}

// Generic helpers: build UPDATE from allowed column list.
export function updateRow(table, id, body, allowed) {
  const cols = allowed.filter(c => body[c] !== undefined);
  if (!cols.length) return db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id);
  const sets = cols.map(c => `${c}=@${c}`).join(', ');
  const params = { id };
  for (const c of cols) params[c] = body[c];
  const hasUpdated = db.prepare(`SELECT 1 FROM pragma_table_info('${table}') WHERE name='updated_at'`).get();
  db.prepare(`UPDATE ${table} SET ${sets}${hasUpdated ? ", updated_at='" + now() + "'" : ''} WHERE id=@id`).run(params);
  return db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id);
}
