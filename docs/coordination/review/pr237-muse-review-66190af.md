# Re-review: PR #237 — Port Roster backup-ledger and read-only archive routes (F09, F10)

- Reviewer: Muse, replacing Claude until Claude returns, per the owner's 16 November directive (source 12b06eb).
- Verdict: **APPROVED at the exact head** `66190af9`.
- Branch: `antigravity/v1-roster-backup-ledger-and-archive`. Base: main `559f5f51`. PR status: open, MERGEABLE. GPT to merge.
- No deployment authorised.
- This is a re-review at a rebased head. The original approval at `a6db030` (record `pr237-muse-review.md`) does not carry across the rebase; this record is the approval for the new head.

## Why a re-review

GPT merged #231, #232, #234, #236, #238, #239, #240 and #241 after the original approval, and #237 conflicted with the new main in `v1/services/roster/service.mjs`. The owner directed conflict resolution and a fresh exact-head review. The rebase was performed by Muse (the reviewer) at the owner's direction, because the conflicts were purely mechanical unions with a unique correct resolution — no product decision was involved. The resolution is disclosed here, and this approval rests on the fresh exact-head evidence below (green product CI at the new head plus full local verification), not on the rebase itself.

## What the rebase changed

The branch was rebased onto main `559f5f51`. The only conflict was in `v1/services/roster/service.mjs`, two regions, both unions of independent additions:

- Imports: main added the `absence-clash.mjs` import (#236); #237 added the `backup-ledger.mjs` and `archive.mjs` imports. Resolution keeps both.
- `operations()` dispatch: main added the `resolveAbsenceIntake`/`retryAbsenceIntake` branch (#236); #237 added the `archiveColdOutput` branch. Resolution keeps both, main's branch first.

The allowlist auto-merged. Verified after the rebase: the diff vs the new main is exactly #237's original change (6 files, 1076 insertions, 48 deletions) — the only difference from the original diff is the `v1-release-v108.md` claim file, which is now on main via #233. The allowlist entry set equals base minus main's removals minus #237's removals (12 entries remain: 24 − 6 − 6), and the `dynamicCallSites` set satisfies the same union rule, with nothing missing or extra.

## What it does (unchanged from the original approval)

Ports the remaining Roster backup-ledger and archive routes, clearing all six F09/F10 probe allowances:

- New `v1/services/roster/backup-ledger.mjs` (342 lines): `POST /backup-ledger` (`roster.admin`).
  - `read`: paginated, filtered ledger rows over `roster_exports`, `roster_drive_exports`, and `backupLedgerEntries`, with a status summary, backup-config flag, and verification-request history. Internal `_artifactKey`/`_source` fields are stripped from public rows.
  - `verify`: validates `manifestFileId` (safe charset, no `..`), finds the entry, and verifies by private-R2 artifact readback with SHA-256 digest comparison (accepting the store's canonical digest or raw SHA-256 hex); a school-scope mismatch, missing artifact, or digest mismatch is reported, not hidden. The verification request is recorded durably via `prepared`/`commit` (idempotent by operationId).
  - `restore`: hard 409 `RESTORE_ISOLATED_ONLY` — live HTTP restore into an active production database is disabled per `OPERATIONS.md`; operators use the isolated empty-target `restoreOwner` procedure. No restore path exists in this PR.
- New `v1/services/roster/archive.mjs` (397 lines):
  - `POST /edge/archive`: read-only projections — `history` and `calculations` scoped to the caller's own staffId (`roster.own`), `statistics` requires `roster.read` (366-day range cap), `openingBalances` requires `roster.admin`. Every view returns `archive: { readOnly: true, throughDate, id }`.
  - `POST /operations` with `archiveColdOutput` (`roster.admin`): captures an immutable cold-output snapshot/manifest into private R2 (`cold-archive`) with SHA-256 readback verification (503 on failure), retains all authoritative D1/R2 records (`deletionEnabled: false`; nothing is deleted anywhere), and records a durable `coldArchive` index.
- `v1/services/roster/service.mjs`: `/backup-ledger` maps to `roster.admin` (write only for verify/restore), `/edge/archive` maps by view, `archiveColdOutput` is an admin write.
- The operation-probe allowlist loses exactly the six F09/F10 entries.

## Scope, merge, secrets

- Diff vs origin/main: exactly 6 files, matching the task record's exact-file allowlist. 1076 insertions, 48 deletions.
- `git merge-tree --write-tree --name-only origin/main 66190af9` clean (tree 7cbeabd1), re-checked against current main.
- `git diff --check`: clean. Secrets scan of the diff: clean.
- No SQL migrations, no v0.9 source edits.
- Allowance arithmetic: #237 clears 6 (F09/F10). With #230 (7), #231 (2), #232 (1), #234 (1), #235 (5) and #236 (2), the batch clears 24 in total once all seven merge.

## CI at the exact head

- Isolated v1 product run 44695885456: **success at head 66190af9**.
- Node/LORD ("Verify GSiS queue changes"): **no run exists for this head**. The workflow `verify-queue.yml` triggers only on push to `codex/**`, `muse/**`, `claude/**` branches, so `antigravity/**` branches never trigger it. The owner waived this notation difference on 20 Nov 2026 ("review all done by antigravity, ignore difference in notation, i will orchestrate") and will orchestrate the workflow fix/merges. This approval rests on the green product CI at the exact head plus the full local verification below, and the waiver is recorded here rather than hidden.

## Local checks at the exact head

Worktree `wt237-rebase` at 66190af9, `npm ci` in root and in `v1/`, `TZ=Asia/Singapore`, Playwright Chromium:

- `tests/v1-product-roster-backup-archive.mjs`: exit 0, PASS — `/backup-ledger` (read/verify/restore-refusal), `/edge/archive` views, `archiveColdOutput`.
- `tests/v1-product-operation-probe.mjs`: exit 0, PASS — 406 probes, `knownMissing` 12 (the union count on this base: 24 − 6 cleared by merged PRs − 6 cleared here), parsedScripts 131.
- `tests/v1-product-roster-service.mjs`: exit 0, PASS — existing Roster service regressions intact.
- `npm run build`: exit 0, no diff. `node scripts/v1/build.mjs` and `node scripts/v1/verify-build.mjs`: exit 0.

## Findings

None.

## Quality gates

- Q01–Q06 pass at the exact head (bounded scope, no live restore path, exact-head product CI green, local checks green). Q07 is this review. Q08 is not applicable — no deployment authorised.
- Hosted/runtime UAT: **Not tested**.
