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
