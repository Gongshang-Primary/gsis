# Revision O validation

Targeted local verification is complete. This is not a claim that the full repository suite, a native school-scale Cloudflare import or a live Calendar sync passed.

| Coverage | Evidence |
| --- | --- |
| Native exporter and shared-model roundtrip | 14 cases, including exact admin gates, single/odd-even weekday projections, confirmed plans with replacement/missing baselines, unconfirmed draft isolation, recesses, privacy, source races, bounds and SG rollover |
| Preparation Worker, source and final dashboard bundle | 11 cases each. Real local SQLite behind the D1 adapter; mock R2 transport; real RSA JWT signatures and claims. CAS races, receipt replay, rollback, corrupt gzip, no-op pointer integrity, overlapping baseline priority, empty-baseline confirmed plan and SG chronology |
| Independent end-to-end native integration | 5 cases using actual gateway output, actual exporter, actual SQLite and mock R2; plus independent midbatch Calendar YEAR-fence race |
| Admin export browser | 3 cases: successful checked download, source changed, denied administrator access. Two route checks include canonical backend module ownership and no Calendar access |
| Export UI layout | Headless Chromium desktop 1280px/mobile390px: no page overflow, heading/buttons and denied-admin response verified; screenshot visually inspected |
| Separate preparation package | 5 checks: deterministic bundle/provenance, canonical source verification, tampered rehashed Worker refusal, unexpected inventory refusal and existing rehearsal boundary |
| Calendar | New 9-case isolation/boundary program; partial-completion UI and cooldown UI. Retained native-storage9, concurrency9, core38 and Sheets63, plus provider cooldown/source deferral/retry checks. See docs/v098o/CALENDAR_SYNC_VALIDATION.md |
| Existing production Roster behavior | 16 programs pass across N capacity/intake/later-shorter, M any-time manual allocation, L allocation modes, H independent Stapler/privacy/persistence, teacher Stapler, health UI, existing timetable cache/write hooks and edge clock. Raw results in verification/098o-retained-regressions.json |
| Source syntax | 236 Apps Script files parse as ES2020; unsupported logical-assignment regression refused |
| Release metadata | O/N baseline, four production components, optional Calendar pair, unchanged notification/operations N, separate preparation archive and no-cutover flags |

The first tests reproduced missing export/gateway routing and new Calendar regressions before implementation. Review also caught and corrected two integration defects: strict backend request fields versus gateway-added metadata, and a route placed only in generated Code.gs rather than canonical RosterOperations.gs. Source-to-runtime regeneration and the final routing test pass. Independent review reports no remaining blocking finding in .superpowers/reviews/098o/independent-review.md.

The Worker processes one native part at a time; limits are4MiB per part,64MiB aggregate and62 native parts. A native350-teacher/20-period fixture exceeds2MiB and passes locally. Node memory/CPU timings do not certify Cloudflare runtime capacity. The setup guide requires actual Worker CPU/error observations on the school snapshot.

Current Google freshness is not independently authenticated by uploaded JSON. Calendar dated parity and current Contacts staff-ID/Name Bridge mappings are not established by this preparation. Fencing every baseline/Stapler writer, production reader routes/permissions, source-change refresh, SG rollover, protected retention/pruning, backups and rollback remain later cutover work. The relief ledger stays outside this preparation.

The only live repair performed in this task was adding the missing Events!AE1 VenueID header, with adjacent-format copy and source cell readback. Event rows and the two unknown save receipts were preserved. No live provider sync, message send, timetable import, authority switch, resource creation or code deployment was performed. A full-workbook copy was blocked by automatic approval review because destination sharing was unverified; no copy was made. A narrow private affected-cell snapshot supported the reversible header repair.
