# GSiS v0.8.2 implementation and verification plan

Authorised full release, 21 October 2026. Baseline commit c4a2a85896c4404410a6f13c8e8ef4ded2feae81. This release implements queued items 061–079, including Contacts, inbox and the teacher timetable views. Production deployment, sending staff messages and changing live timetables are not part of offline release verification.

## Ownership

| Workstream | Canonical source ownership | Acceptance |
| --- | --- | --- |
| Allocation domain | shared/roster-operations.js, shared/roster-allocation.js | Manual choices including empty cells survive automation; direct SMC replacement; captured decision facts |
| Backend | backend/RosterOperations.gs, backend/RosterAuditExport.gs | Independent cell merges, durable receipts, pure private reads, one daily Drive text export |
| Roster interface | roster operations UI, roster.js, workbook writers | Explicit local/save/release/send workflow, recoverable drafts, local Excel |
| Private page and dispatch | external page, WhatsApp contracts, notification worker, private/send gateway sections | Seven-day reusable links, top acknowledgement, gated two-button contract, no stranded batch claims |
| Contacts | contacts frontend | Accessible add icon before TTb name, delegated Google contact consent, duplicate-safe create |
| Inbox | inbox model/backend/UI and inbox gateway sections | Bounded incremental reads, authorised incoming image viewing, failure recovery |
| Integration | Stapler UI, packaging, version labels, documentation | Local Stapler editing, coherent full suite package and independent review |

## Verification gates

1. Reproduce meaningful changed behavior before implementation; use synthetic data.
2. Verify concurrency, manual ownership, stale/uncertain outcomes, private access lifetime and acknowledgement freshness.
3. Verify all three workbook exports with the network unavailable after data load.
4. Verify Contacts consent, duplicate prevention and uncertain create handling; no real contacts are created during testing.
5. Verify inbox image authorisation and content handling; no real messages are sent during testing.
6. Run the complete current test suite, syntax checks, generated-source consistency, full archive integrity and source review.
7. Commit the verified release and package the full deployables, source and repository bundle. Preserve the wider changelog for later suite maintenance.

## External activation state

The two-button template `gsis_timetable_updated_button_v2` (1009634445543507) was read back as PENDING on 21 October. The approved existing template remains the default until approval and exact contract matching are verified. Google Contacts requires People API enablement and user consent to the Contacts scope in the configured Google OAuth application.

## Progress

- Baseline and release branch verified; six isolated source ownership workstreams started.
- Six source workstreams completed; cross-tab recovery, publication replacement ancestry, exact uncertain retries and archived-evidence compaction defects were reproduced and fixed.
- Independent correctness and UI-reliability reviews are closed. Five code skills and the requested UI review were applied.
- All 482 current scripts passed before item 079; the final full run passed all 483 current scripts after that change. Archive integrity is verified separately before and after committing the repository bundle.
- Final counts, commit state and installation limits are recorded in VALIDATION.md and RELEASE_SUMMARY.json.
