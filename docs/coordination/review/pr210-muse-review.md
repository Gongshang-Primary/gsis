# Muse review — PR #210: fix repeated note saves for other Deploy versions

- Reviewer: Muse, replacing Claude until Claude returns, per the owner's 16 Nov directive (source 12b06eb).
- PR: #210, branch `codex/v1-deploy-nonloaded-note-revision`, OPEN, MERGEABLE.
- Exact head reviewed: `1d686623ba77fa617dbff245245c73e4b5d56891`.
- Base (claimed implementation base): `6b0b17165dd270578d0f3b673c15f56d554d50ff` (merge-base of the head against current origin/main `6b0b1716`, which is the #205 merge).
- Verdict: **APPROVED at the exact head.**

## What it fixes

Follow-up to the open bug disclosed in the #205 review. With A loaded, saving B's note, then Refresh, then saving B's note again sent B's stale revision 0 after B had committed revision 1, and the owner returned `409 REVISION_CONFLICT`. The Versions list already returned B's current revision, but the client cached only A's, and the client received no B note text from the list. The list now keeps each version's note and revision together, the client records every version's revision in the same monotonic cache, and the post-save note read surfaces the observed revision.

## Scope verified

- Diff is exactly the four paths in the task record `docs/coordination/tasks/v1-deploy-nonloaded-note-revision.md`: the task record, `tests/v1-product-deploy-note-revision-browser.mjs`, `v1/services/deploy/service.mjs`, `v1/web/shared/client.js`. 165 insertions, 20 deletions.
- `git merge-tree --write-tree --name-only origin/main 1d68662` is clean (no conflicts).
- `git diff --check` clean. Secrets scan of the diff clean.
- No migration, dependency or configuration change. No deployment. No live data change. No v0.9 edits.

## Design read

- `v1/services/deploy/service.mjs` (`bootstrap`): the version-list query now also projects the saved note from the same row — `CASE WHEN json_valid(metadata) THEN json_extract(metadata,'$.notes') END AS notes` — and each list entry carries `notes` (empty string when not a string), alongside its revision. The dropped `created_at` column from the SELECT is safe: nothing in the bootstrap projection uses it (`ORDER BY created_at` still applies; the one `createdAt` use in the file is in a different function that selects its own columns). The list stays capped at the existing 200 versions. The `/versionNote` response now also returns `revision: doc.revision` alongside the note text, so the confirmed-note read after a save supplies the observed revision. No owner guard changes: note comparison, revision validation, permission checks, lease fencing and recovery request identities are untouched.
- `v1/web/shared/client.js` (`captureRevision`): refactored around a `remember(id, revision)` helper that keeps the monotonic maximum (`Math.max(existing ?? -1, revision)`), so a delayed stale response can never lower a cached revision. New behaviour: when the response domain is `deploy` and `data.versions` is an array, every version entry's revision is remembered, not only the loaded/current one. The single-version remember path (versionId / currentId / current.id / body.versionId with current.revision ?? workingRevision ?? revision) is preserved. No additional request or database write is introduced.

## CI verified at the exact head

- Node/LORD run 44252956419: head_sha verified `1d68662`, completed success, all five jobs green.
- Product run 44254695517 (checks page): head_sha verified `1d68662`, completed success. Product run 44252956594 (linked in the PR body): head_sha verified `1d68662`, completed success.

## Local checks run (TZ=Asia/Singapore, Playwright chromium-1234)

Worktree at the exact head; `npm ci` at root and inside `v1/` first.

- `node tests/v1-product-deploy-note-revision-browser.mjs` — PASS (3 groups: B's note saves twice around Refresh while A stays loaded, with the second save sending the committed revision and the Refresh response carrying B's note + revision together; a third save without Refresh using the revision from the confirmed `/versionNote` read; a genuine competing edit still returns `409 REVISION_CONFLICT` with the local draft retained, the competing note intact, "Check original note" visible, and A's stored document unchanged).
- `node tests/v1-product-deploy-save-recovery-browser.mjs` — PASS (15 groups, unchanged).
- `node tests/v1-product-deploy-duplicate-selection-browser.mjs` — PASS (10 groups, unchanged).
- `node tests/v1-product-deploy-duplicate-contacts.mjs` — PASS.
- `npm run build` — PASS, no tracked drift.
- `node scripts/v1/build.mjs` — PASS.
- `node scripts/v1/verify-build.mjs` — PASS.

## Findings

None. No findings.

## Notes

- N1 (negative control, builder-stated): the new browser case reproduced the defect on the claim source — after the first save and Refresh, the second request sent revision 0 after revision 1 had committed, and the local Worker returned `409 REVISION_CONFLICT`. The passing state is re-verified locally above.
- N2 (limits, as stated in the task record): maximum-size lists and delayed-response ordering were reviewed in source, not exercised as separate browser cases. The 200-version list cap means a version beyond the cap is not refreshed from the list, but the post-save note read still supplies its revision. Hosted UAT remains Not tested. F5 remains OPEN. No merge or deployment by this review.
- N3: this closes the open bug recorded as N2 in the #205 review (record `2c4d1748`).

## Quality gates

- Q01: Pass. Owner request recorded (the #205 review's disclosed conflict); exact scope in the task record.
- Q02: Pass. Existing owner guards and recovery identities unchanged; no new data source or access path.
- Q03: Pass. Revision validation, expected-note comparison, lease fencing and permission checks retained and exercised, including the genuine-conflict case.
- Q04: Pass. Monotonic revision cache, exact-retry identities and draft retention exercised in the new and unchanged recovery tests.
- Q05: Pass. Bounded Deploy Worker + shared browser asset only; no new workflow.
- Q06: Pass. Local verification above; exact-head Node/LORD CI green and product CI green (two runs).
- Q07: Pass. This exact-head review.
- Q08: No deployment authorised by this task and none performed.

## Release notes

No release label change. No deployment. Rollback restores the previous code and assets; it reintroduces the stale-revision conflict on repeated saves of a nonloaded version's note.
