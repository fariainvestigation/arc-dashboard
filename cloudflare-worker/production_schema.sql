-- ARC Motion & Legal module: Cloudflare D1 migration 0001
-- D1 is SQLite-dialect. This schema replaces the standalone app's local SQLite.
-- Cases themselves live in the ARC shared case system; this module stores only
-- legal-work records keyed by the shared ARC case_id. No competing case table.

-- ARC shared production case authority. All modules use these same case/member tables.
CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  rev INTEGER NOT NULL DEFAULT 1,
  deleted INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  owner_user_id TEXT
);

CREATE TABLE IF NOT EXISTS case_members (
  case_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('owner','editor','reviewer','reader')),
  granted_by TEXT,
  granted_at TEXT,
  PRIMARY KEY (case_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_case_members_user ON case_members(user_id, case_id);

CREATE TABLE IF NOT EXISTS legal_users (
  email TEXT PRIMARY KEY,
  name TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'pending',   -- pending | investigator | attorney | supervisor | administrator
  bbo TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending', -- pending | active | disabled
  created_at TEXT, updated_at TEXT
);

CREATE TABLE IF NOT EXISTS case_assignments (
  case_id TEXT NOT NULL,
  email TEXT NOT NULL REFERENCES legal_users(email),
  assigned_role TEXT DEFAULT 'investigator',
  assigned_at TEXT,
  PRIMARY KEY (case_id, email)
);

CREATE TABLE IF NOT EXISTS legal_issues (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT DEFAULT 'Issue Identified',
  related_fact_ids TEXT DEFAULT '[]',     -- JSON array of ARC fact/source IDs
  created_by TEXT DEFAULT '',
  created_at TEXT, updated_at TEXT
);

-- ---- CourtListener object hierarchy: Court -> Docket -> Cluster -> Opinion ----
-- Cached CourtListener records. Shared across cases (they are public case law),
-- while the *authority* record below is per ARC case.

CREATE TABLE IF NOT EXISTS cl_courts (
  cl_court_id TEXT PRIMARY KEY,           -- e.g. "mass", "massappct", "scotus"
  name TEXT DEFAULT '',
  abbreviation TEXT DEFAULT '',
  jurisdiction TEXT DEFAULT '',
  court_level TEXT DEFAULT '',            -- trial | intermediate appellate | supreme | federal district etc.
  in_use INTEGER,                         -- active status when available (NULL = unknown)
  cached_at TEXT
);

CREATE TABLE IF NOT EXISTS cl_dockets (
  cl_docket_id TEXT PRIMARY KEY,
  cl_court_id TEXT REFERENCES cl_courts(cl_court_id),
  case_name TEXT DEFAULT '',
  docket_number TEXT DEFAULT '',          -- NOT unique; always pair with court/jurisdiction when searching
  date_filed TEXT DEFAULT '',
  date_terminated TEXT DEFAULT '',
  jurisdiction_type TEXT DEFAULT '',
  absolute_url TEXT DEFAULT '',
  cluster_ids TEXT DEFAULT '[]',          -- JSON array of related cluster IDs
  cached_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_cl_dockets_num ON cl_dockets(docket_number, cl_court_id);

CREATE TABLE IF NOT EXISTS cl_clusters (
  cl_cluster_id TEXT PRIMARY KEY,         -- opinion-page URLs use THIS id
  cl_docket_id TEXT REFERENCES cl_dockets(cl_docket_id),
  case_name TEXT DEFAULT '',
  date_filed TEXT DEFAULT '',
  citations TEXT DEFAULT '[]',            -- JSON array of parallel citations
  judges TEXT DEFAULT '',
  panel TEXT DEFAULT '[]',
  opinion_ids TEXT DEFAULT '[]',          -- JSON array of related opinion IDs
  absolute_url TEXT DEFAULT '',
  cached_at TEXT
);

CREATE TABLE IF NOT EXISTS cl_opinions (
  cl_opinion_id TEXT PRIMARY KEY,
  cl_cluster_id TEXT REFERENCES cl_clusters(cl_cluster_id),
  opinion_type TEXT DEFAULT '',           -- lead | majority | concurrence | dissent | combined (never merged)
  author TEXT DEFAULT '',
  ordering_key INTEGER,
  opinions_cited TEXT DEFAULT '[]',
  opinion_text TEXT DEFAULT '',           -- from html_with_citations, tags stripped
  text_source_field TEXT DEFAULT '',      -- which CL field supplied the text
  source_url TEXT DEFAULT '',
  download_url TEXT DEFAULT '',
  cached_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_cl_op_cluster ON cl_opinions(cl_cluster_id);

-- ---- ARC authority record (per case) ----------------------------------------
CREATE TABLE IF NOT EXISTS authorities (
  id TEXT PRIMARY KEY,                    -- ARC authority ID
  case_id TEXT NOT NULL,
  cl_court_id TEXT DEFAULT '',
  cl_docket_id TEXT DEFAULT '',
  cl_cluster_id TEXT DEFAULT '',
  cl_opinion_id TEXT DEFAULT '',
  case_name TEXT NOT NULL,
  citation TEXT DEFAULT '',               -- official or parallel citation
  court TEXT DEFAULT '',
  decided_date TEXT DEFAULT '',
  opinion_type TEXT DEFAULT '',
  courtlistener_url TEXT DEFAULT '',
  quoted_language TEXT DEFAULT '',        -- relevant quoted passage
  pinpoint TEXT DEFAULT '',
  retained_text_ref TEXT DEFAULT '',      -- cl_opinion_id holding full text, or inline excerpt
  verification_status TEXT NOT NULL DEFAULT 'Imported',
    -- Imported | Located | Pinpoint Needed | Verified | Persuasive | Controlling | Superseded | Do Not Use
  jurisdiction TEXT DEFAULT '',
  imported_by TEXT DEFAULT '',
  imported_at TEXT DEFAULT '',
  verified_by TEXT DEFAULT '',
  date_verified TEXT DEFAULT '',
  controlling_marked_by TEXT DEFAULT '',  -- attorney/supervisor/admin only
  related_issue_ids TEXT DEFAULT '[]',
  related_motion_ids TEXT DEFAULT '[]',
  notes TEXT DEFAULT '',
  created_at TEXT, updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_auth_case ON authorities(case_id);
CREATE INDEX IF NOT EXISTS idx_auth_cl ON authorities(case_id, cl_cluster_id);
CREATE INDEX IF NOT EXISTS idx_auth_cl_op ON authorities(case_id, cl_opinion_id);

-- One master motion record per motion (integration directive section 8).
CREATE TABLE IF NOT EXISTS motions (
  id TEXT PRIMARY KEY,                    -- motionId
  case_id TEXT NOT NULL,
  motion_type TEXT DEFAULT '',            -- bank id or custom
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Issue Identified',
    -- Issue Identified | Researching | Ready to Draft | Draft | Attorney Review |
    -- Revision Required | Approved for Filing | Filed | Withdrawn | Archived
  selected_fact_ids TEXT DEFAULT '[]',    -- JSON arrays; every entry keeps ARC source IDs
  selected_finding_ids TEXT DEFAULT '[]',
  selected_authority_ids TEXT DEFAULT '[]',
  selected_exhibit_ids TEXT DEFAULT '[]',
  sections TEXT DEFAULT '[]',             -- JSON [{type,heading,body,citations:[{factId|authorityId,...}]}]
  proposed_order TEXT DEFAULT '',
  certificate_of_service TEXT DEFAULT '',
  filing_warnings TEXT DEFAULT '[]',
  approved_by TEXT DEFAULT '',
  approved_by_email TEXT DEFAULT '',
  approved_at TEXT DEFAULT '',
  approval_statement TEXT DEFAULT '',
  approval_conditions TEXT DEFAULT '',
  approved_version INTEGER DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT DEFAULT '',
  created_at TEXT, updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_motions_case ON motions(case_id);

CREATE TABLE IF NOT EXISTS motion_versions (
  id TEXT PRIMARY KEY,
  motion_id TEXT NOT NULL REFERENCES motions(id),
  version INTEGER NOT NULL,
  snapshot TEXT NOT NULL,                 -- full JSON of the master record at that version
  saved_by TEXT DEFAULT '',
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_mv_motion ON motion_versions(motion_id, version);

CREATE TABLE IF NOT EXISTS irac_blocks (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  motion_id TEXT DEFAULT '',
  label TEXT DEFAULT '',
  issue TEXT DEFAULT '', rule TEXT DEFAULT '',
  application TEXT DEFAULT '', conclusion TEXT DEFAULT '',
  anticipated_commonwealth TEXT DEFAULT '', defense_response TEXT DEFAULT '',
  linked_fact_ids TEXT DEFAULT '[]',
  linked_authority_ids TEXT DEFAULT '[]',
  linked_exhibit_ids TEXT DEFAULT '[]',
  flags TEXT DEFAULT '[]',
  created_by TEXT DEFAULT '',
  created_at TEXT, updated_at TEXT
);

CREATE TABLE IF NOT EXISTS legal_files (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  stored_key TEXT NOT NULL,               -- R2 object key: legal/<case_id>/<file_id>_<safe_name>
  mime_type TEXT DEFAULT '',
  size INTEGER DEFAULT 0,
  sha256 TEXT DEFAULT '',
  uploaded_by TEXT DEFAULT '',
  uploaded_at TEXT,
  category TEXT DEFAULT 'exhibit',
  confidentiality TEXT DEFAULT 'standard',
  related_issue_id TEXT DEFAULT '',
  related_motion_id TEXT DEFAULT '',
  exhibit_number INTEGER DEFAULT 0,
  exhibit_title TEXT DEFAULT '',
  attorney_notes TEXT DEFAULT ''          -- never exported in filings
);
CREATE INDEX IF NOT EXISTS idx_files_case ON legal_files(case_id);

CREATE TABLE IF NOT EXISTS legal_audit (
  id TEXT PRIMARY KEY,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,                    -- Access identity email
  action TEXT NOT NULL,
  case_id TEXT DEFAULT '',
  record_type TEXT DEFAULT '',
  record_id TEXT DEFAULT '',
  summary TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_laudit_case ON legal_audit(case_id);

CREATE TABLE IF NOT EXISTS provider_log (
  id TEXT PRIMARY KEY,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  provider TEXT NOT NULL,                 -- courtlistener | anthropic
  route TEXT NOT NULL,
  case_id TEXT DEFAULT '',
  request_chars INTEGER DEFAULT 0,        -- sizes only; never secrets, never raw prompts
  response_chars INTEGER DEFAULT 0,
  ok INTEGER DEFAULT 1
);


-- Public web research (Firecrawl), keyed to ARC shared case.
CREATE TABLE IF NOT EXISTS web_research_records (
  research_id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  title TEXT,
  provider TEXT NOT NULL DEFAULT 'firecrawl',
  retrieved_at TEXT NOT NULL,
  retrieved_by TEXT NOT NULL,
  content_markdown TEXT,
  content_hash TEXT,
  related_issue_id TEXT,
  verification_status TEXT NOT NULL DEFAULT 'Unverified',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_web_research_case ON web_research_records(case_id, retrieved_at);


-- ARC shared report/review/workspace tables used by the case sync Worker.
CREATE TABLE IF NOT EXISTS final_reports (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  payload TEXT NOT NULL,
  payload_hash TEXT NOT NULL DEFAULT '',
  approved INTEGER NOT NULL DEFAULT 0,
  approved_by TEXT NOT NULL DEFAULT '',
  approved_at TEXT NOT NULL DEFAULT '',
  approved_revision INTEGER NOT NULL DEFAULT 0,
  invalidated_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_final_reports_case ON final_reports(case_id, updated_at);

CREATE TABLE IF NOT EXISTS final_report_versions (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  case_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  snapshot TEXT NOT NULL,
  saved_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_final_report_versions_case ON final_report_versions(case_id, report_id, revision);

CREATE TABLE IF NOT EXISTS arc_audit (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  report_id TEXT DEFAULT '',
  details TEXT DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_arc_audit_case ON arc_audit(case_id, created_at);

CREATE TABLE IF NOT EXISTS report_reviews (
  report_id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  status TEXT NOT NULL,
  reviewer TEXT NOT NULL,
  notes TEXT DEFAULT '',
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_report_reviews_case ON report_reviews(case_id, updated_at);

CREATE TABLE IF NOT EXISTS report_assets (
  case_id TEXT NOT NULL,
  id TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  file_key TEXT DEFAULT '',
  file_name TEXT DEFAULT '',
  file_type TEXT DEFAULT '',
  file_size INTEGER NOT NULL DEFAULT 0,
  sha256 TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  modified_by TEXT NOT NULL,
  PRIMARY KEY(case_id, id)
);
CREATE INDEX IF NOT EXISTS idx_report_assets_case ON report_assets(case_id, updated_at);

CREATE TABLE IF NOT EXISTS investigation_workspaces (
  case_id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS case_module_state (
  case_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  rev INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  PRIMARY KEY(case_id, module_id)
);
CREATE INDEX IF NOT EXISTS idx_case_module_state_case ON case_module_state(case_id, updated_at);
