# ARC MOTION
## Massachusetts Criminal Defense Motion and Litigation Workspace

Offline-first local application for organizing case materials, analyzing potential
motions, building IRAC analyses, drafting filing-ready motions, managing exhibits,
and exporting complete court packages. Defense perspective throughout; the
prosecution is always "the Commonwealth."

## Quick start (Windows)
1. Extract this folder anywhere (it moves as a folder; all paths are relative).
2. Install Node.js LTS if needed: https://nodejs.org/en/download
3. Double-click `START_ARC.bat`. First run installs dependencies.
4. The app opens at http://127.0.0.1:8790 - localhost only.
5. Follow the welcome screen: create an attorney profile, then your first case
   (or a demonstration case with fictional data).

Mac/Linux: `npm install` then `npm start`.

## What ARC MOTION will not do
- It never assumes guilt, never invents facts, quotations, or legal authorities.
- It never states that evidence exists unless uploaded or entered by counsel.
- It never resolves conflicting evidence; the Conflict Center displays both
  accounts and counsel marks the resolution.
- It never treats AI output as approved for filing. AI is optional, off by
  default, and every AI response is a proposal requiring attorney review.
- It never applies civil Superior Court Rule 9A procedure to criminal motions,
  and warns if a criminal filing references Rule 9A.
- It never fills a placeholder ([CLIENT NAME], [FACTUAL SUPPORT REQUIRED],
  [AUTHORITY REQUIRES VERIFICATION]...) with invented information.

## Core workflow
Case -> Evidence uploads (originals preserved, SHA-256 recorded) -> Facts with
page-level sources and verification status -> Conflict Center -> Motion Analysis
(rule-based engine over the 154-entry ARC motion bank; Draft Now / Needs More
Facts / Not Supported Yet) -> IRAC Builder -> Motion Builder -> pre-filing checks
-> Approved for Filing (explicit attorney action required) -> HTML / DOCX / PDF /
exhibit packet / filing ZIP.

## Legal notice
ARC MOTION is a drafting and case-management tool, not legal advice and not a
substitute for attorney judgment. Rules, statutes, cases, standing orders, and
local filing procedures must be checked for amendments or changes before filing.
The bundled Massachusetts Rules of Criminal Procedure incorporate amendments
effective November 1, 2025 and are not guaranteed current after that date.

See INSTALL.md, SECURITY.md, ARCHITECTURE.md, DATA_MODEL.md, MOTION_WORKFLOW.md,
and EXHIBIT_WORKFLOW.md.
