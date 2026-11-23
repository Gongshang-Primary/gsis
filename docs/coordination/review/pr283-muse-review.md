# Review: PR #283 — Log Deploy Duty recess column parity issue (Muse, exact head 014b2af6)

Project: v1 documentation (UAT log). Reviewer: Muse, at the exact head SHA, under the owner's 16 Nov 2026 directive (source commit 12b06eb): Muse reviews v1 PRs at the exact head, replacing Claude until Claude returns; no code, merges or coordination. GPT merges.

## Verdict

**APPROVED at exact head `014b2af6f4a64aa171f30e5b7a32a0b86116d100`.**

## PR

- #283, `codex/v1-deploy-duty-uat-20261123`, "Model: Codex / Log Deploy Duty recess column parity issue".
- State at review: OPEN, not a draft, MERGEABLE/CLEAN. Base `a8a5860a` (the Duty parity log claim commit).
- Docs only: DEP-23-001, the Recess-columns-repeat finding from the owner's v1.10 and v0.9.9y Deploy Duty screenshots.

## CI at the exact head

- Verify GSiS queue changes at the head: `full-suite` pass, `scope` pass, regression shards **skipped** by design under #280's scope rule (one file under `docs/v1/`).
- No "Isolated v1 product" run: product CI has no automatic docs-only trigger. This PR changes documentation only.

## Scope

Diff against the merge-base (`a8a5860a`): **1 file, 28 insertions, 0 deletions** — `docs/v1/DEPLOY_DUTY_UAT_2026-11-23.md` (new).

- `git merge-tree --write-tree --name-only origin/main 014b2af6` returns a clean tree (`29ed52bf…`). No conflicts.
- `git diff --check` clean. No secrets (documentation only).

## Content verification (read and re-run, not trusted)

- **Renderer identity verified at source and built-asset level.** `dutyPrintHTML` extracted from `public/app.js` is byte-identical (5,606 characters) between v0.9.9y (`d9d180c`) and v1.10 (`d726896c`). The v1.10 release artifact (14758464741, verified in the #281 review) was downloaded and unpacked; the built Deploy asset `product/web/assets/deploy/app.js` contains the same function, byte-identical (5,606 characters). The log's claim that the v0.9.9y source and the built v1.10 asset contain the same function is therefore verified, not trusted.
- **Mechanism verified by reading.** The function emits one `<th>RECESS</th>` per Recess record (`recess.map(...)`) and derives each displayed period from the column index plus three (`'pd '+(i+3)`). That is exactly the repeated-column pattern the screenshots show when the same occurrences are stored as separate single-day records. Cells fill only on the days listed in each record.
- **`setDuties` retains separate rows — verified.** In the v1 Deploy model, `setDuties` validates the list (array, ≤200, unique ids, valid intervals and assignments) and stores `doc.duties = clone(input.value)` — the list is kept as given, with no grouping or merging. The log's statement that no specific import or conversion has yet been identified is honest about the open question.
- **Screenshot facts are labelled as such.** "Both screenshots show 1 of 64 duty slots unfilled" and the grid/header descriptions are presented as what the owner's supplied screenshots show; the log does not claim a hosted-record cause. The source of the hosted duty definitions "still needs tracing", and built-browser interaction, PDF output and hosted save behaviour are listed as outside the log entry. Nothing here is claimed beyond its evidence.

## Findings

None.

## Quality gates

- Q01 (scope): one documentation file inside the task's stated scope. Pass.
- Q02–Q04: no implementation change. Not applicable.
- Q05: queue CI green at the exact head. Pass.
- Q06: renderer identity verified at source and built-asset level; no build is affected by a docs-only change. Pass.
- Q07: records verified against live state as listed above. Pass.
- Q08: this exact-head review. Pass.
- F5 remains OPEN. This PR is a UAT log; it does not close it. The repair (PR #285) is a separate PR.

## Release notes

Docs only. No deployment, migration or live-data effect. GPT to merge.
