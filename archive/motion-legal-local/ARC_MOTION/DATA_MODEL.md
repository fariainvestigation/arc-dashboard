# Data model (SQLite)

- attorney_profiles: identity, BBO, contact, signature_block (used verbatim),
  certificate-of-service language, defaults.
- cases: ARC case ID, client, docket, court, county, posture, dates, judge,
  prosecutor, police department, archived flag. charges is a child table.
- documents: original + stored filename, type, size, source, agency, batch,
  Bates, privilege, confidentiality, SHA-256, notes. Originals never modified.
- people: role-typed persons (defendant, officers, witnesses, experts...),
  credibility issues, prior inconsistent statements, disclosure issues.
- facts: statement, source document + page/paragraph/line/timestamp/image ref,
  asserting person, category (35 categories), confidence, verification
  (unverified/verified/rejected), defense & Commonwealth significance,
  conflict_status, ai_generated flag.
- fact_conflicts: two facts, conflict type, status (unresolved, material,
  immaterial, resolved_source, attorney_determination), attorney note.
- motions: bank_id, title, category, 16-state status workflow, factual basis,
  missing facts/discovery, authorities, relief, risks, approval fields
  (approved_by, approved_at - required for Approved for Filing), ruling.
- motion_sections: typed sections (caption ... exhibit_index) with sort order.
- motion_versions: full JSON snapshots for version history.
- irac_blocks: full Issue/Rule/Application/Conclusion field set, linked fact,
  authority, and exhibit IDs, Commonwealth counterargument fields, flags.
- authorities: research record with citation, pinpoint, level, seven-state
  status, cite-check date, attorney_verified gate, warnings computed on save.
- exhibits: numbering scheme + value (labels derive from these so renumbering
  updates every reference), source document or image, Bates, authentication
  and custody notes, confidentiality, admission status.
- images: Picture Center records with source, hash, dimensions, caption,
  people/location/date shown, verification.
- timeline_events: typed chronology with links to facts, documents, images,
  exhibits, people, motions.
- audit_log: timestamped action trail with previous/new values.
