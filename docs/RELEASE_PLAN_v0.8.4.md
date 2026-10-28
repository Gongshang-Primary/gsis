# GSiS v0.8.4 implementation and verification plan

The authorised release starts from the complete v0.8.3 package and includes items 088–094. Existing school records and deployment identities remain in place.

## Scope and acceptance

1. List today's and upcoming confirmed dates for active mapped eligible teachers without plan membership. Keep legacy date metadata separate from frozen-preview permission. Distinguish account access, failed reads and a true empty list.
2. Keep Report Absence input and instruction edits responsive through baseline/suspended-date refresh. Require verified data before submission.
3. Show immediate cancellable Own arrangements feedback. After confirmed save, provide a mobile period/colleague chooser. Create requests only through Submit requests; preserve exact uncertain-save recovery.
4. Compress only authorised timetable snapshots. Verify content keys, bounded decode/cache behavior, identity/date invalidation and one safe plain-read fallback. Keep dynamic operational records fresh.
5. Merge independent saved-instruction cells using base/current comparisons and absence/source scope. Reject same-cell and source changes atomically. Retain legacy payload and receipt behavior.
6. Apply configurable consecutive subject blocks with PAL × 3 as the missing-setting default. Preserve manual choices and normal availability/quota limits. Do not silently split unfillable blocks.
7. Verify fixed Deploy/Roster action boundaries, disabled/mismatched Roster owner gates, published Deploy reads and the one-owner cutover documentation. Preserve all original data IDs; no live cutover during packaging.
8. Verify IP Deploy editing retains table position/focus through the affected redraws.
9. Run focused domain, backend, shipped-browser and regression checks. Verify generated-source parity, complete component packaging, link integrity and the self-contained 36-figure manual.

`VALIDATION.md` and `RELEASE_SUMMARY.json` record actual results. `PERFORMANCE_v0.8.4.md` labels local measurements and inherited figures. The final writer lock and single operations document remain; broad concurrency resolution and peak school latency are not claimed.

Production deployment, publication, provider approval and staff messaging are separate from package preparation. Preserve historical documents and queued items outside this release.
