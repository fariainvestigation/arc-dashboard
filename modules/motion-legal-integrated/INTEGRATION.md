# ARC Motion & Legal - Integration Instructions

## What this module is
A native ARC module. It has no case system of its own: it receives the active case
from the ARC shared case system and stores only legal work product (issues,
authorities, IRAC blocks, motions, versions, legal files) in Cloudflare D1 and R2.

## 1. Frontend placement
Copy into the ARC site root alongside the other numbered modules:

    23_Motion_and_Legal.html
    arc_motion_legal.css
    arc_motion_legal.js
    arc_courtlistener_client.js
    arc_motion_templates.js
    arc_legal_authority_store.js

The page loads the existing `arc_uniform_design.css`, `arc_report_header.js`, and
`arc_unified_bridge.js`. It adds no navigation of its own; add a link to
`23_Motion_and_Legal.html` from the existing Case Intelligence workspace nav.

## 2. Active-case contract
The module calls, in order of availability:

    window.ARCBridge.getActiveCase()
    window.ARC.getActiveCase()
    window.ARC_ACTIVE_CASE

Return an object with at least:

    { caseId, caseName, clientName, docketNumber, court, county,
      charges, assignedAttorney, assignedInvestigator }

If none resolves, the module shows `No active ARC case selected.` and disables
research, drafting, uploads, and exports. There is no hard-coded default case.
The module re-reads the case on the existing `arc:case-updated` event.

## 3. Approved-data contract
Add these two bridge methods. They must return ONLY approved records:

    window.ARCBridge.getApprovedFacts(caseId)
      -> [{ id, text, category, sourceId, document, page, timestamp, verification }]
    window.ARCBridge.getApprovedFindings(caseId)
      -> [{ id, text, type, sourceId }]

Exclude rejected, draft, superseded, unverified, and any note not approved for
legal use. Every returned fact keeps its ARC fact ID and source ID; those IDs
become `[FACT:id]` tags inside motion text and remain clickable back to the
source record.

## 4. Worker deployment

    npm install -g wrangler
    wrangler d1 create arc_legal          # copy the database_id into wrangler.toml
    wrangler r2 bucket create arc-legal-files
    npm run db:migrate                    # applies worker/schema.sql
    wrangler secret put COURTLISTENER_API_KEY
    wrangler secret put ANTHROPIC_API_KEY
    npm run deploy

Edit `wrangler.toml` first: set `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` (the Access
application AUD tag), `ALLOWED_ORIGINS`, and the D1 `database_id`.

## 5. Cloudflare Access
Protect both the module page and `/legal-api/*` with the same Access application
so the browser sends `Cf-Access-Jwt-Assertion`. The Worker validates the JWT
signature against your team JWKS, checks `aud` and `exp`, and rejects anything
unsigned. There is no fallback user and no development bypass.

## 6. Roles and assignment
Users are not auto-created. A first-time identity is inserted as
`role=pending, status=pending` and refused until an administrator sets a role:

    POST /legal-api/users        { email, name, role, bbo, status }   (administrator)
    POST /legal-api/assignments  { caseId, email, role }              (supervisor+)

Roles: `investigator`, `attorney`, `supervisor`, `administrator`.
Attorney/supervisor/administrator may approve a motion for filing and may mark an
authority `Controlling`. Every case-scoped read and write requires an assignment
(supervisors and administrators see all cases).

## 7. Route map

    GET  /legal-api/me
    POST /legal-api/users                    POST /legal-api/assignments
    GET  /legal-api/courts
    POST /legal-api/search                   GET  /legal-api/dockets/:id
    GET  /legal-api/clusters/:id[?full=1]    GET  /legal-api/opinions/:id
    POST /legal-api/import-authority         POST /legal-api/verify-authority
    GET  /legal-api/authorities/:caseId
    GET/POST /legal-api/issues[/:caseId]     GET/POST /legal-api/irac[/:caseId]
    GET  /legal-api/motions/:caseId          POST /legal-api/motions
    GET/PUT /legal-api/motion/:id
    GET  /legal-api/motion/:id/versions      GET  /legal-api/motion/:id/review
    POST /legal-api/motion/:id/prepare       POST /legal-api/motion/:id/draft
    POST /legal-api/motion/:id/revise        POST /legal-api/motion/:id/verify
    POST /legal-api/motion/:id/approve       POST /legal-api/motion/:id/finalize
    GET  /legal-api/motion/:id/export/(html|docx|zip)
    POST /legal-api/files?caseId=&filename=  GET/PUT /legal-api/file/:id
    GET  /legal-api/files/:caseId            GET  /legal-api/audit/:caseId

## 8. Tests

    npm test        # 22 tests, all must pass before deployment
