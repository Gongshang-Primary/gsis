# Revision G validation

49 focused programs pass on the final product sources. Coverage includes occupied name displacement at every level, multiple temporary rows, local recovery, mixed draft dependencies, live stale review, uncertain request identity, real backend and Worker rename cycles, canonical secret authentication, existing cache hooks, timetable exports and teacher navigation. New export cases inspect actual workbook XML, styles, source times, frozen panes and print titles. Browser checks include unsaved Stapler export and ordinary and bridged teacher names.

The separate LORD gate passes 36 programs, including 113 static checks, 17 setup checks, the new shared secret cases, and the existing booking, browser, identity and source bridge regressions.

The full parallel Node release gate completed 790 programs. Its initial result was 751 passes and 39 failures. Missing production helper loading in isolated test harnesses was corrected using the real credential resolver and synthetic properties, preserving signature checks and adding negative cases. Seven older policy tests were corrected only after reproducing the same failure on F. All 32 corrected programs then passed fresh root reruns. The resulting aggregate is 783 passes and seven remaining failures. This combines a complete run with targeted reruns; it is not a single green full-suite run. The exact package parity check is run separately after packaging.

The sequential npm test candidate run also completed, at 768 of 791 programs, while final fixture and review fixes were in progress. Its original log is retained. Do not read that intermediate count as the final aggregate above. Its failing Node phase means the chained LORD phase did not run there; the separate 36 program LORD gate completed successfully.

## Remaining inherited limits

| Program | Reason |
|---|---|
| release084-absence-browser.cjs | Historical v0.8.3 Git object is absent. |
| roster717-inbox-performance.cjs | Historical v0.7.16 Git object is absent. |
| roster718-absence-performance-browser.cjs | Historical v0.7.17 Git object is absent. |
| stapler718a-relief-import.cjs | The required historical Stapler source path is absent at commit 32d2c2d17621319ba1d57aea34046229544f5513. |
| roster-draft-cell-save-speed.cjs | Existing response is 3,073 bytes against the unchanged 3,000 byte threshold. |
| roster080-batch-backend.cjs | Imports the same response size benchmark. |
| roster719-performance.cjs | Imports the same response size benchmark. |

The response benchmark was already documented and reproduced on the reconstructed baseline in D. No historical source was invented and no performance threshold was weakened.

## Review and release gates

Independent correctness/security and structural reviews found three issues: mixed class draft dependency ordering, live conflict review rebasing and the bridged teacher name shortcut. Each was reproduced as a failing test, fixed and verified. No material review finding remains open. The optional component inventory cleanup is recorded separately in the review report.

Release sync parses 206 Apps Script files as ES2020 and regenerates both standalone Workers. The component package verifier checks all 17 declared artifacts, source parity, self contained entry points, assets, configuration, authentication and archive hashes. Before delivery, the committed tag and provenance are checked and complete source recovery is verified by a fresh clone; the recovery log is supplied with the archive.

## Scope and practical limits

Teacher Summary contains the selected parity's weekly teacher summary, with other weekdays retaining baseline arrangements. Class POV shows the selected Stapler date. The labels state this. Export timing rows use source timing. Raw XLSX import timing defaults remain unchanged; the importer recognises and skips the new header row without moving lesson cells.

Local class drafts recover for the same account, version and browser profile. Clearing site data or closing a private browsing profile can remove them. Conflicting saved names require explicit review. Saved class identities, teacher allocations and room or TG references remain protected.

GSIS_SECRET covers first party transport only. Existing session, private link, provider and booking credentials remain separate. A coordinated optional key cutover is needed; installing code with the canonical setting absent preserves legacy configuration. No real key is included.

Roster timetable cache policy, horizon, authority, schema and activation are unchanged. D1 and private R2 instructions prepare storage only. The later publishing, WhatsApp, friendly timestamp, UT override and baseline independence requests remain queued for the next patch.

The release is tested with synthetic local fixtures. No production data changes, cloud configuration writes, real provider sends or deployment occurred during preparation.
