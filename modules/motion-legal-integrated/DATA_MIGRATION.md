# Data migration notes

## From the standalone ARC_MOTION app to the ARC module

The standalone app kept its own SQLite database with its own `cases` table. That
case system is removed. Legal work migrates; cases do not.

### Mapping

    standalone SQLite            ->  ARC module
    cases                        ->  DROPPED. Map each old case to the existing
                                     ARC case_id in the shared case system.
    attorney_profiles            ->  legal_users (email, name, role, bbo).
                                     Signature blocks move into the motion's
                                     signature section text.
    facts, fact_conflicts,
    people, timeline_events,
    documents                    ->  DROPPED from the legal module. These live in
                                     the ARC case record; the module consumes the
                                     approved subset through the bridge.
    motions + motion_sections    ->  motions (one master record; sections become
                                     the JSON `sections` array).
    motion_versions              ->  motion_versions (snapshot JSON preserved).
    irac_blocks                  ->  irac_blocks (field set condensed to
                                     issue/rule/application/conclusion plus the
                                     Commonwealth-argument pair and link arrays).
    authorities                  ->  authorities, re-keyed to the CourtListener
                                     hierarchy. Old rows have no CL identifiers,
                                     so they import as `Imported` and must be
                                     re-located and re-verified.
    exhibits + images            ->  legal_files in R2.
    audit_log                    ->  legal_audit.

### Procedure
1. For each legacy case, obtain the ARC `caseId` from the shared case system.
2. Export legacy motions and IRAC blocks to JSON.
3. Insert them through `POST /legal-api/motions` and `POST /legal-api/irac` with
   the ARC `caseId`. Content arrives as version 1 with no approval.
4. Re-import authorities from CourtListener so they carry court, docket, cluster,
   and opinion IDs. Legacy citation strings alone are not enough.
5. Upload exhibit files through `POST /legal-api/files`; hashes are recomputed.
6. Do NOT migrate approvals. Every migrated motion starts unapproved and must be
   reviewed and approved again by an attorney in the new system.

### Fact tags
Legacy motion text has no `[FACT:id]` tags, so filing review will flag its
factual paragraphs as unsupported. Re-link paragraphs to approved ARC facts
before approving a migrated motion for filing. This is intentional: it forces
the source-traceability the old system did not enforce.
