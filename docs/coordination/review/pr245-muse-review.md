# Review: PR #245 — v1: record Deploy pending-save recovery audit (Muse, exact head 1e37bdf2)

Project: v1 documentation (audit reconciliation). Reviewer: Muse, at the exact head SHA, under the owner's 16 Nov 2026 directive (source commit 12b06eb): Muse reviews v1 PRs at the exact head, replacing Claude until Claude returns; no code, merges or coordination. GPT merges.

## Verdict

**APPROVED at exact head `1e37bdf27574bdd988ba7a2c7e061c67c464c664`.**

## PR

- #245, `codex/v1-deploy-save-recovery-findings`, "Model: Codex / v1: record Deploy pending-save recovery audit".
- State at review: OPEN, not a draft, MERGEABLE/CLEAN. Base `b952c7e4` (main at the time of the update). The PR was a draft at its prior head `8967055d` ("Record v1 audit of Deploy save recovery lessons"); this head reconciles the audit against merged main.
- Docs only: a 23 Nov disposition reconciling the 20 Nov save-recovery audit with merged #260 and #263, preserving the original audit text below it.

## CI at the exact head

- Verify GSiS queue changes at the head: `full-suite` pass, `scope` pass, regression shards **skipped** by design under #280's scope rule (one file under `docs/coordination/`).
- No "Isolated v1 product" run: product CI has no automatic docs-only trigger. This PR changes documentation only.

## Scope

Diff against the merge-base (`b952c7e4`): **1 file, 81 insertions, 0 deletions** — `docs/coordination/tasks/v1-deploy-save-recovery-v09-lessons.md` (new on this base; the file existed on the PR branch at the prior head and is reconciled here).

- `git merge-tree --write-tree --name-only origin/main 1e37bdf2` returns a clean tree (`07facfbf…`). No conflicts.
- `git diff --check` clean. No secrets (documentation only).
- Both relative links resolve: `../review/pr263-muse-review.md` and `../OWNER_DIRECTIVES.md`.

## Content verification (read, not trusted)

- **Merge ancestry verified.** Both cited merges are ancestors of this head: #260 at `3160da94` ("Merge PR #260 — Deploy save review and recovery") and #263 at `ab195175` ("Merge PR #263 — Repair Deploy recovery browser fixture"). The disposition's claim that the readable-label and pre-dispatch-refusal work merged in #260, and that #263 persists the teacher and class through the real synthetic owner paths before Review, matches the merged PRs.
- **The 17-groups claim verified.** The cited #263 review record states "All 17 groups pass, including the repaired Review-labels group" at head `31be52c8`. The disposition correctly notes that historical result is not a test run of this documentation head.
- **Line references spot-checked at the stated v1 code basis** (`e6df70b7`). `updateDeploy` in `scripts/v1/build-web.mjs` replaces the legacy `/api/commands` caller with a direct-to-D1 implementation; `isUnsentOperation` in `v1/web/shared/client.js` checks context-bound local proof from the `WeakMap`; `reserveWrite` exists in the same file. The historical audit's tracing claims hold at the cited basis.
- **Honest limits.** The disposition states plainly that no application test, build, new CI run, hosted UAT, deployment or live-data operation was performed for this update; that official T1B-01/T1B-02 remain Not tested and F5 remains OPEN; and that no exact-head approval is claimed for the update itself. The older "Claude review" wording in the preserved historical section is explicitly flagged as retained history only. Nothing here claims an implementation, a deployment, or a test result it does not have.

## Findings

None.

## Quality gates

- Q01 (scope): one documentation file inside the task's stated scope. Pass.
- Q02–Q04: no implementation change. Not applicable.
- Q05: queue CI green at the exact head. Pass.
- Q06: cited merges, line references and the 17-groups claim verified against the repo; no build is affected by a docs-only change. Pass.
- Q07: records verified against live state as listed above. Pass.
- Q08: this exact-head review. Pass.
- F5 remains OPEN. This PR is an audit reconciliation; it does not close it. Hosted UAT remains open, as the document states.

## Release notes

Docs only. No deployment, migration or live-data effect. GPT to merge.
