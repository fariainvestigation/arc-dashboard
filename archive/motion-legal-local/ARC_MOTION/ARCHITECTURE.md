# Architecture

Offline-first three-layer local application.

    app/       - static SPA (vanilla JS, hash routing). No build step.
    server/    - Express REST API (server.mjs), SQLite layer (db.mjs),
                 services: recommend.mjs (rule engine), export.mjs (compile,
                 HTML/DOCX/PDF, exhibit packets, filing ZIP, backups)
    knowledge/ - motion_bank.json (154 Massachusetts motion templates),
                 criminal_rules/ (Mass. R. Crim. P., Nov 2025),
                 civil_reference/ (Rule 9A materials, quarantined)
    templates/ - motion, affidavit, proposed order, certificate skeletons
    data/      - SQLite database, per-case files, backups (created at runtime)

Design rules:
- Every record keyed by UUID; foreign keys enforced; migrations tracked in
  _migrations.
- Uploaded originals are write-once. Every derived artifact is a new file.
- The recommendation engine is deterministic: fact categories map to motion
  bank entries; verified facts -> Draft Now, unverified only -> Needs More
  Facts, baseline discovery motions always recommended.
- Compile pipeline: motion_sections -> ordered blocks -> HTML / DOCX (docx) /
  PDF (pdfkit) with identical section order, Times 12pt, 1in margins, page
  numbers.
- AI is a thin provider proxy (Anthropic- or OpenAI-compatible) behind
  /api/ai; responses are labeled proposals and never auto-enter a filing.
