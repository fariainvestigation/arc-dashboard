# ARC v11.4 Product Acceptance Checklist

## Active case and synchronization

- [ ] Create a case with matter, docket, client, and investigator.
- [ ] Confirm the same active case appears in every module.
- [ ] Change the matter from one tab and confirm the shell updates.
- [ ] Switch cases and confirm no report or evidence leaks between cases.
- [ ] Refresh the browser and confirm the active case is retained.

## Evidence and exhibits

- [ ] Import representative PDF, DOCX, image, video, and large-file evidence.
- [ ] Confirm SHA-256 progress and completed hash values.
- [ ] Confirm extracted images begin unselected.
- [ ] Select one image and confirm only that image enters the report.
- [ ] Create a Snip-to-Exhibit crop and verify the crop and provenance.

## Analysis and review

- [ ] Create a cited analytical connection.
- [ ] Confirm it enters review rather than bypassing approval.
- [ ] Approve a report and record the reviewer.
- [ ] Edit the approved report and confirm status changes to Revised.
- [ ] Reject a report and confirm Edit PDF cannot receive it.
- [ ] Resolve all Review Center citation, hash, and placeholder warnings.

## Report builder and final exports

- [ ] Route an approved report to #4 ARC Generator.
- [ ] Route an approved report to #5 Edit PDF.
- [ ] Confirm simultaneous edit and live preview.
- [ ] Reorder sections and insert page breaks.
- [ ] Run the final release checklist.
- [ ] Confirm finalization is blocked while blocking checks remain.
- [ ] Export Word, PDF, print, and functional HTML.
- [ ] Compare live preview, downloaded PDF, printed PDF, and HTML.
- [ ] Confirm the HTML works offline with search and navigation.
- [ ] Confirm export and finalization events appear in the audit history.
- [ ] Open the attorney report from Stage 6 and confirm the Full Report Builder remains the last shell tab.
- [ ] Confirm only populated case sections appear and all unrelated empty sections are hidden.
- [ ] Confirm Dashboard, Sources & Citations, and Review & Certification remain visible.
- [ ] Add approved records for two cases and confirm only the active `caseId` enters the attorney report.
- [ ] Confirm pending, revised, rejected, unselected, and other-case records do not enter the attorney report.
- [ ] Edit an authorized attorney-report field and confirm HTML export creates the next revision without changing the builder source report.
- [ ] Download the final attorney HTML and JSON and confirm both contain the same case ID and revision.
- [ ] Confirm click-only certification remains blocked while required verification issues are unresolved.

## Deployment

- [ ] Run `npm test`.
- [ ] Run `npm run test:api`.
- [ ] Upload the reviewed source archive to a private GitHub repository.
- [ ] Confirm application version 11.4.0.
- [ ] Test Chrome and Edge at desktop and tablet widths.
- [ ] Test external APIs with temporary non-production credentials.
- [ ] Remove test credentials and synthetic case data.
- [ ] Create a release ZIP checksum.
- [ ] Add authenticated users, administrator authorization, case-level access controls, private object storage, a production database, TLS, backups, and audit retention before public hosting.
- [ ] Confirm the local Node server is not exposed directly to the public internet.
- [ ] Approve the production deployment.


## Restored cross-module feature checks

- [ ] Generate an ARC Notebook report and confirm Legal Research displays “What you should know about this case.”
- [ ] Confirm “Send briefing to Main Report” creates one reviewable report entry.
- [ ] Confirm Discovery Review opens from the shell, receives the active case, and can send an approved Discovery Gap Report to Main Report.
- [ ] Confirm Timeline Discrepancy replaces its sample timeline with source-attributed events from the Notebook report.
- [ ] Confirm Intelligence Analysis contains one synchronized “ARC Notebook Report (shared)” source and updates it without duplicates.
- [ ] Confirm Intelligence Board opens from the shell tab and receives the shared matter, docket, court, and investigator.
- [ ] Confirm Print Report prints only the report canvas, not application navigation or toolbars.
