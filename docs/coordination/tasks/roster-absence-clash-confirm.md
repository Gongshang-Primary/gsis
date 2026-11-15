# Report Absence: confirm replacement of overlapping reports

- Status: implemented; verification in progress
- Owner/model: Codex
- Review: owner explicitly waived Claude review for v0.9 hotfixes in this session; build/test/CI gates remain.
- Last updated (Asia/Singapore): 2026-11-16
- Branch: codex/roster-absence-clash-confirm
- Base SHA: a1606c2 (current main at claim)
- User-authorised scope: owner-raised fault within the v0.9 freeze exception. Accept a second report when no absent period overlaps; otherwise show the existing absence and, on acknowledgement, replace it with the new report.
- Files/domains owned: D1 absence adapter, Roster UI, transport validation as necessary, generated Worker artifacts, regression tests, parity references, changelog and hotfix deploy notes.
- Out of scope: live data/configuration, releases, deployment, merging, unrelated allocation rules and other apps. The required v1 mirror belongs in a separate PR under v1 rules.

## Diagnosis and implementation plan

The live D1 intake captures reports durably, but the domain refuses overlaps with ABSENCE_OVERLAP and sends them to the SMC merge/keep/edit workflow. Non-overlapping reports already have distinct rows. Introduce an authenticated preflight that shows the affected existing reports. Confirmation binds the incoming coverage and current saved records; recheck it within the save transaction. Replace only overlapping records, retaining deleted records and the replacement relationship as audit history. Do not delete any live rows while developing.

The owner has authorized the hotfix and its later v1 mirror. This branch carries its claim because the standing instruction prohibits pushing to main. No claim or work is transferred from another branch.

## Acceptance

- Disjoint periods save without a replacement confirmation, including on the same day.
- Overlap displays the existing date, periods, type/reason and an explicit replace/cancel choice.
- Cancel leaves stored reports unchanged. Confirm retires all and only the overlapping reports and saves the complete incoming report atomically.
- Invalid input, stale confirmation and unauthorized callers cannot delete reports. Same-request retries cannot duplicate replacements or notifications.
- Existing instruction history, completed work, receipt history and permissions remain protected. No automatic allocation/publication is added.
- Cover browser interaction and actual D1 save/receipt paths with synthetic tests; leave Google Apps Script code unchanged.
- Canonical build leaves no diff; full local suite and exact-head CI before a draft PR for the owner. Include deploy/rollback notes on top of y.

## Verification

Targeted D1 adapter, SQLite intake/receipt and report-form regression tests pass. Parity refresh covers 273 catalogued operations with all outcome and missing-handler counts unchanged. Full local suite and exact-head CI are pending at implementation commit. No live reads, provider sends, merge or deployment. Deploy/rollback: `docs/plans/2026-11-16-absence-clash-hotfix.md`.

## Handoff

Build the v0.9 hotfix first, then mirror the behavior in a separate v1 PR. Owner merges and deploys. Claude review is waived for this v0.9 hotfix; the separate v1 mirror follows v1 review rules.

Owner clarification, 16 Nov: D1 Worker and frontend only; no Google Apps Script fallback changes. The implementation uses a D1-specific adapter and leaves shared Google domain code unchanged.

## CI follow-up

Run 43775109909 at 26fa4e3 passed three regression shards; shard 3 failed only because `v1-product-operation-probe.mjs` pins the existing shared frontend dispatch call by line. The new replacement-dialog code is extracted into a helper after the dispatch section, retaining that existing call-site location. No v1 files, allowlists or assertions are changed. A new exact-head full CI run is required.
