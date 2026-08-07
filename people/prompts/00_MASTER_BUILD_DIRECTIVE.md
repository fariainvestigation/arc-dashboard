# ARC People / Parties Involved Module — Master Directive

Build the four-screen People module from the supplied Stitch visual references without redesigning the ARC interface.

## Screens
1. Parties Involved Dashboard.
2. Reusable Individual Person Profile.
3. Add/Edit Person.
4. Extracted People Review Queue.

## Workflow
Uploaded reports → OCR/text extraction → per-document people extraction → cross-document matching → review queue → investigator approval/edit/merge/reject → permanent person profile → dashboard → statements/evidence/timeline/interviews/final-report links.

## Required controls
- Dashboard role filters: all, defendant, co-defendant, witness, victim, police officer, other.
- Add New Person.
- Review Extracted People.
- Profile tabs: overview, contact, statements, interviews, reports, evidence, timeline, relationships, contact attempts, notes.
- Review actions: approve as new, merge, edit, reject.
- Duplicate warning before manually creating a likely matching person.

## Source rules
- Use only uploaded report text, document metadata, page boundaries, approved case fields, and investigator edits.
- Do not invent facts, contacts, roles, dates, statements, page numbers, or citations.
- Keep exact quotations separate from report paraphrases.
- Preserve conflicts and source references.
- Do not automatically merge people.
- Do not automatically approve AI extractions.

## Case isolation
Every record is scoped by authenticated user, active case ID, person ID, and source document IDs. One approved person record must be reused by evidence, timeline, statements, interviews, reports, and the final report.

## Production persistence
The existing ARC Worker/D1 case record remains the source of truth. The standalone localStorage store is only a prototype fallback. Implement `window.ARCPeopleBridge` in the main ARC program to connect this package to the existing case APIs. Never expose an AI API key in frontend files.
