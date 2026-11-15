# Owner change log — 15 November 2026

Documentation only. Model: Codex; coordinator: ChatGPT (v1); independent reviewer: Claude. [Task and scope](../../coordination/tasks/v1-changelog-20261115.md). Entries record reported problems and future acceptance criteria; they do not authorise implementation or live operations.

Owner subsequently authorised working through the bug fixes one by one, including entries from the separate “data clone UAT ledger” project conversation. Implementation now uses separate bounded claims/PRs; this PR remains documentation only. That conversation is not accessible through the current connected tools and was not found in main or connected Pages. Its entries or Git handoff have been requested; they are not yet imported or presumed known.

## V1-20261115-01 — Deploy publication blocked by venue metadata

**Status: Implementation in progress; not yet fixed or deployed.** Owner request: “deploy is unable to publish, changelog for bug fix”. The authorised fix is separately claimed in `docs/coordination/tasks/v1-deploy-venue-publication.md`, main claim `bef1ac8c1d5e310a3468b92b72da38d59e49aeb1`, branch `codex/v1-deploy-venue-publication`. The original live outcome remains unverified.

### Observed and expected behaviour

The owner's mobile screenshot shows the Publish dialog for “2026 T4 post-PSLE” reporting: “Refresh current venue metadata before publication.” It then displays the original operation reference and says to check its receipt before retrying. “Retry same publication” appears disabled; “Check original receipt” and “Close” remain available. The screenshot and real operation identifier are not committed here.

Expected: an authorised user can publish a valid saved version with current venue references. If venue evidence is incomplete, the interface must explain how to refresh it, preserve the saved draft and provide a clear recovery path. It must distinguish a confirmed rejected/aborted operation from a pending or unknown outcome and a committed publication. A disabled button alone does not establish any of those outcomes.

### Source evidence and open diagnosis

Source inspected at main `26bbccd229962700409bb6e9c80b1e9bec170d20`; no live data or receipt was read for this report.

- [Deploy venue-reference validation](https://github.com/helper-gsps/gsis/blob/26bbccd229962700409bb6e9c80b1e9bec170d20/v1/services/deploy/service.mjs#L964) emits this exact message as `VENUE_REFERENCE_STALE`, HTTP 409, when a venue referenced by a class, teaching group or room form mapping is absent from the publication document or has an undefined/null revision. This check does not compare against the current Venues revision.
- [The publication dialog](https://github.com/helper-gsps/gsis/blob/26bbccd229962700409bb6e9c80b1e9bec170d20/v1/web/shared/deploy-publication.js#L506) disables retry for a non-408 HTTP error below 500. It does not determine the durable receipt state when setting that button.
- [The existing draft refresh operation](https://github.com/helper-gsps/gsis/blob/26bbccd229962700409bb6e9c80b1e9bec170d20/v1/services/deploy/service.mjs#L1842) reads the canonical Venues catalogue and saves per-venue revisions. Investigate whether version creation, import, duplication, refresh and publication preparation retain the required evidence.
- [Venues source fencing](https://github.com/helper-gsps/gsis/blob/26bbccd229962700409bb6e9c80b1e9bec170d20/v1/services/venues/service.mjs#L946) reads the prepared Deploy publication status, which constructs venue references from its frozen document. Missing references can block that path before the normal publication commit. A separate current-revision comparison uses `VENUE_REFERENCE_CHANGED`.
- [Worker recovery](https://github.com/helper-gsps/gsis/blob/26bbccd229962700409bb6e9c80b1e9bec170d20/v1/runtime/worker.mjs#L235) attempts to fence/abort a matching prepared operation after a known 4xx rejection, returns the receipt if already committed, and reports `RECOVERY_PENDING` if recovery fails. The original receipt must establish what actually happened.

Leading hypothesis: missing venue revision evidence in the saved/prepared document. Its origin, the affected venue, the screenshot's exact running build and the actual publication outcome remain unverified. Do not infer that venue data recently changed, that nothing committed, or that every 409 can safely retry.

### Future fix acceptance criteria

1. Reproduce with synthetic versions containing referenced rooms with missing/null revisions or missing catalogue entries; include class, teaching-group and form-mapping references. Identify the path that lost/omitted metadata before choosing the fix.
2. Verify a valid current venue projection publishes successfully. Exercise create/import/duplicate/refresh paths and retain Venues ownership, school isolation, current permission checks and saved-version revision checks. A source outage or concurrently changed/deleted room must fail truthfully without fabricated revisions or a stale publication.
3. Make the recovery action understandable and usable on mobile. Retain unsaved edits and the original request identity while checking its receipt. Do not silently replace an uncertain operation with a new one or alter an already frozen publication payload under the same operation ID.
4. Test confirmed rejection/abort, pending/unknown outcome, committed receipt, duplicate retry and response loss after commit. Refresh/recovery must not leave a known rejected operation blocking edits, create duplicate publications, or mistake recipient delivery for publication. A corrected intent may start a new operation only after the original outcome is resolved safely.
5. Before a future fix is accepted, provide focused service and built-browser regressions, applicable existing regressions/build/CI and Claude's exact-head review. Live publication/recovery UAT requires separate authorisation and evidence.

No application changes, tests, publication retry, merge or deployment performed for this entry. The earlier deployment's successful CI does not close this bug. F5 remains OPEN; official T1B-01/T1B-02 and unperformed runtime UAT remain **Not tested**.
