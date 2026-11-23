# Global Admin evidence retention preview

- **Status** Locally verified on 23 November 2026; full CI and exact-head Muse review pending
- **Builder** Codex
- **Reviewer** Muse at the exact head
- **Branch** `codex/v1-core-retention-preview`
- **Base before claim** `d0ff8f5d6e8386295af04a4beaf4318402cc321e`
- **Owner basis** Measure first and show candidates and protections in Global Admin Toolbox. [Retention owner decisions](v1-core-evidence-retention-measurement.md#owner-decisions)
- **Exact scope** This task record, `v1/web/overlays/admin/index.html`, `v1/web/shared/admin.js`, `v1/web/shared/client.js`, and `tests/v1-product-core-retention-preview-browser.mjs`.

Show bounded dry-run counts for 90-day and one-year candidate windows using the existing Core endpoint. Show owner dependency protection reasons and indicate when the preview is incomplete. Use the existing Global Admin admission and protect the current-account context when requests complete.

Verify the built Toolbox against actual local Core and owner Workers and D1 with synthetic records. Confirm only exact dry runs use read-request client handling and create no pending cleanup write. Product deletion controls, duration selection, byte estimates, hosted restore and activation remain separate from this preview.

## Implementation contract

The existing Core endpoint remains authoritative. One explicit **Get estimate** action reads the 90-day and 365-day windows sequentially with `dryRun: true` and `limit: 500`. Each request keeps the existing Global Admin, non-impersonation, CSRF and request-ID checks. Core's normal authorization evidence is still recorded; the preview does not prepare a cleanup operation, delete records or change configuration.

Only `/api/core/admin/evidence/retention` with the literal boolean `dryRun: true` bypasses the client's pending-write map. Omitted/false flags and other routes retain their current write handling. No generic `saved` result or cleanup receipt shortcut is added.

Results are bounded candidate counts, not byte savings or complete history totals. Evidence and terminal Core admissions each have an independent 500-row bound. Core-local protections are excluded before the evidence scan; returned protection reasons describe cross-owner protections within that scan. Protected rows consume the scan bound. Unknown owner status and failed/malformed responses remain explicitly incomplete, never zero-valued success. The two observations are not an atomic cross-owner snapshot.

The preview keeps no persistent data. Starting another estimate replaces the previous results; an account-context epoch change clears them immediately and invalidates late responses. Existing exact-decision recovery and other Toolbox sections remain intact. Retention duration and deletion confirmation remain separate owner decisions, and F5 remains **OPEN**.

## Verification and handoff

Local checks use the working tree based on accepted claim `4fa2b60dcd177204e16155864418c2c54910529e`, with synthetic data only:

| Check | Result |
| --- | --- |
| `TZ=Asia/Singapore npm run build` | Pass; no tracked generated drift |
| `TZ=Asia/Singapore node scripts/v1/build.mjs` | Pass; nine services, 380 artifacts |
| `TZ=Asia/Singapore PLAYWRIGHT_BROWSERS_PATH=/tmp/gsis-ttb-playwright timeout 45s node tests/v1-product-core-retention-preview-browser.mjs` | Pass, seven groups, 10.818 seconds |
| `TZ=Asia/Singapore PLAYWRIGHT_BROWSERS_PATH=/tmp/gsis-ttb-playwright timeout 45s node tests/v1-product-toolbox.mjs` | Pass, unchanged regression |
| `TZ=Asia/Singapore timeout 45s node tests/v1-product-core-evidence-retention.mjs` | Pass, unchanged owner regression |
| JavaScript syntax, scoped diff and whitespace | Pass |

The new test exercises the actual built Toolbox and nine local Workers/D1: 90/365-day counts, Core-local and cross-owner protections, a 501-row source hitting the 500-row bound, sequential/double-click handling, preserved original records, existing incomplete-evidence recovery, and zero pending cleanup operations. Synthetic malformed and unavailable responses prove that errors cannot become zero-valued estimates. A real account change with delayed IndexedDB clearing and a held response proves immediate removal of old results and rejection of late results. Negative client cases preserve write handling for false/omitted flags and other paths. Normal new Core authorization evidence is expected and is not misreported as a cleanup write.

Red/green evidence is retained privately in `/tmp/gsis-retention-preview-*.log`. The first launch failed because the default browser cache was absent; the existing locked Playwright cache resolved that environment issue without installation. The actual baseline red then found the missing estimate button. An initial test assertion incorrectly expected the panel to survive the shell's protected-content removal and was corrected to require absence. The next run exposed a real new-handler error when cleanup accessed already-removed controls; the implementation now tolerates that lifecycle, and the same seven-group test passes. Only the newly added JavaScript block was formatted; an AST comparison verified unchanged semantics and preservation of surrounding source bytes before the existing regressions ran.

Q01–Q05 pass locally: the five-file claim is preserved; Core remains the sole data/permission owner; strict response validation, existing CSRF and explicit request IDs are retained; requests and rendering are bounded; context epochs invalidate late responses. Q06 local checks pass, with full exact-head CI pending. Q07 exact-head Muse review remains pending. Q08 deployment is not applicable to this task; hosted UAT and F5 restore/recovery closure remain **Not tested/OPEN**.

No service-runtime, schema, configuration or provider change accompanies the preview. Rollback consists of reverting the three frontend files; no data migration or cleanup is needed. This branch is for review, not activation of deletion. No push, merge, deployment or live data operation is claimed.

Skill catalog inspected; no optional skill package executed. Applied the repository's boundary, minimal-state and evidence-before-completion principles through the existing API contract, a narrow transport classification and actual local Worker/D1 browser tests. No dependency, schema, runtime policy, provider, deployment or live-data change is in scope.
