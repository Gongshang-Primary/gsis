# Muse review — PR #211: package the reviewed v1.06 release

- Reviewer: Muse, replacing Claude until Claude returns, per the owner's 16 Nov directive (source 12b06eb).
- PR: #211, branch `codex/v1-release-v106`, OPEN, MERGEABLE at review time.
- Exact head reviewed: `16aee1a5a743f2fe18adbc475bbe31fd02f04e50`.
- Base (claimed implementation base): `bea573dcd65a75d4776bc0667c210977c9d2dff1` (merge-base of the head against origin/main at review time; the #210 merge).
- Verdict: **APPROVED at the exact head.**

## What it is

Release-only PR. The only product change is `RELEASE_LABEL = "v1.06"` in `v1/release.mjs` (display label only; API, storage and workbook schema versions are independent). Everything else in the release is already merged and Muse-approved: #205, #206, #207, #208, #209, #210. No migration, resource, provider, workflow or v0.9 source change. The owner authorised the full v1.06 rollout; the 17 Nov owner directive waives a separate Muse review solely for the routine label and release paperwork.

## Scope verified

- Diff is exactly the two paths in the task record `docs/coordination/tasks/v1-release-v106.md`: the task record and `v1/release.mjs`. 31 insertions, 1 deletion.
- The task record's release-contents table was checked against the review record: #206 at `3b4eeab` merged as `5df8b98`; #207 at `559a760` merged as `22c4192`; #208 at `6435389` merged as `43d6e6c`; #209 at `b33a42a` merged as `1fea93e`; #205 at `456f264` merged as `6b0b171`; #210 at `1d68662` merged as `bea573d`. All six heads and merges agree with Muse's exact-head review records.
- The product tree at the base is identical to #210's CI-green head: the only difference between #210's head `1d68662` and the base `bea573dc` is the #210 review record itself.
- Previous live release v1.05 at `1c42db77` (the #204 merge) agrees with the task record.
- `git merge-tree --write-tree --name-only origin/main 16aee1a5` is clean (no conflicts).
- `git diff --check` clean. No secrets in the diff (one-line label change). The four separately approved branch heads (layout, compact tables, inheritance, department moves) remain outside this release, as stated.

## CI verified at the exact head

- Node/LORD run 44297650483: head_sha verified `16aee1a5`, completed success, all five jobs green.
- Product run 44297651611 (linked in the PR body): head_sha verified `16aee1a5`, completed success. A second product run 44299819786 at the same head was still in progress when the record was written; it is not needed.

## Local checks run (TZ=Asia/Singapore, Playwright chromium-1234)

Worktree at the exact head; `npm ci` at root and inside `v1/` first.

- `node tests/v1-product-release-label.mjs` — PASS.
- `node tests/v1-product-v09-frontend-parity.mjs` — PASS.
- `npm run build` — PASS, no tracked drift.
- `node scripts/v1/build.mjs` — PASS.
- `node scripts/v1/verify-build.mjs` — PASS.

## Findings

None. No findings.

## Notes

- N1: the deployment itself is outside this review. The task record's release steps — eight fresh private verified D1 backups (Contacts last), isolated SQLite import/integrity/foreign-key/migration checks, the main-only protected rollout with provider credential upload disabled, and public-read/release-metadata verification — are the owner's and the coordinator's to perform and verify, with hosted authenticated UAT, restore and provider delivery still untested. F5 remains OPEN. Rollback requires separate owner approval and must retain stored state, stable identities and receipts. No deployment by this review.
- N2: the 17 Nov selective-deployment default (recorded in #199) is superseded for this release by the owner's explicit full-rollout authorisation stated in the PR body.
- N3: GPT merged #211 as `b23d8d15` while the product CI was finishing; the merge is recorded here for completeness.

## Quality gates

- Q01: Pass. Owner request recorded ("deploy", full v1.06 rollout authorised); exact scope in the task record.
- Q02: Pass. Display-label constant only; no new data source, authority or access path.
- Q03: Pass. No permission, secret or identity surface touched.
- Q04: Pass. No persistence or recovery behaviour touched.
- Q05: Pass. Release packaging only; no new workflow.
- Q06: Pass. Local verification above; exact-head Node/LORD CI green and product CI green.
- Q07: Pass. This exact-head review.
- Q08: No deployment authorised by this review and none performed; deployment is a separate owner-gated step.

## Release notes

Labels the reviewed v1.06 release. No deployment by this PR. Rollback is the one-line label revert.
