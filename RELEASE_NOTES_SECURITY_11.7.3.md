# ARC 11.7.3 Go-Live Hardening

- Serialized per-case D1 sync and ACK merges that preserve newer local edits (fixes Workspace autosave races).
- Workspace and Case pages now await `saveCaseAsync` and only confirm after the authoritative D1 save.
- Research Worker SSRF checks now block `0.0.0.0`, short localhost forms, IPv4-mapped IPv6, and CNAME-only DNS answers.
- Sync Worker rejects disallowed Origins with HTTP 403 before authentication (aligned with AI/Research/Legal).
- Corrected final-report polish docs to `/ai/run` + `report.final.revise`.
- Preserved 11.7.1 Notebook handoff and 11.7.2 CSP/HSTS/DOMPurify hardening.
