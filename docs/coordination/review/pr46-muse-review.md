# Review of PR #46 — Roster: clarify zero-quota calculations and investigate relief counts

- Reviewer/model: Muse
- Reviewed head: `72f14067716b8fbba42bae0ca5fd00869f0f6c86`
- Base: main (rebased onto `69dcc2093cc8ae9fc40891f2cd0a03c419dcf884`; verified ancestor of the head)
- Date (Asia/Singapore): 2026-11-13
- Verdict: **APPROVE**

## What the PR does

My Calculations now shows the completed relief count and an explicit no-quota message when accumulated quota is zero, instead of "Unavailable". Unknown history still shows "Unavailable". No allocation formula, ranking or policy change; no duties fabricated; the historical owner-specific missing duties remain unresolved.

The product change is one line in `roster-update/public/roster-calculations.js`: when the percentage is not finite, and entitlement is 0 with a finite completed count (and not a daily roster), the percentage cell reads "N periods done; no relief quota recorded, so no percentage". Everything else still reads "Unavailable".

Two new tests prove it: a jsdom UI test for the zero-quota wording (completed 0 and 7, plus the unknown-history case) and a real D1 test that runs the production `calculations` route against an active Roster store, compares Google/D1 counts, and proves the read changes no saved state. The D1 test covers published, draft, completed, corrected, imported, duplicate and explicitly name-bridged records, plus opening balances without double-counting pre-cutoff history.

## Evidence

- **CI run 43317805257 green at the exact head, all 5 jobs pass** (Regression shards 1–4, full-suite). Verified via `gh pr checks`.
- **Local worktree at the exact head, all 5 programs PASS** (TZ=Asia/Singapore, NODE_NO_WARNINGS=1, GSIS_BROWSER_EXECUTABLE / ROSTER_TEST_CHROMIUM / LORD_TEST_CHROMIUM all set to the Playwright chromium-1234 path):
  - `tests/roster-relief-count-ui.cjs` (new): PASS — "quota-zero wording preserves completed count and distinguishes unknown history".
  - `tests/roster-relief-count.mjs` (new): PASS — "real D1 calculations: canonical published completion, drafts/future separated, correction/import/dedup parity, identity bridge, zero-start and formula-zero hypotheses".
  - `tests/roster-fresh-start-accounting.cjs` (adjacent): PASS.
  - `tests/roster-opening-balances-browser.cjs` (adjacent, Chromium): PASS.
  - `tests/roster088-statistics-contrast.cjs` (adjacent): PASS.
- **Negative control reproduced**: the new UI test copied into a worktree on origin/main (78f6a21) FAILS, exit 1 — the old code renders "…your cumulative relief done is Unavailable." where the test expects "0 periods done; no relief quota recorded, so no percentage". The D1 parity test PASSES on main as well; that is expected, because it is new coverage of existing accounting behaviour, not a fix test — the counts were already correct and the PR changes no accounting code.
- **Canonical build at the head: 18 components, no diff** (`git status` clean after `npm run build`).
- **Merge-tree clean**: `git merge-tree --write-tree --name-only origin/main 72f1406` reports no conflicts. PR is MERGEABLE.
- **D1 parity guard**: `node tests/roster-d1-parity.mjs` exit 0, 272 operations, unchanged.
- **Secret scan**: no password/secret/token/key matches in the PR diff.
- **Scope matches the task record** (`docs/coordination/tasks/roster-relief-count-investigation.md`): hand-written changes are only the one display line in `roster-update/public/roster-calculations.js`, the two new tests, the new D1 helper, and the task record. No `shared/roster-allocation.js` or `shared/roster-operations.js` change was needed; no allocation, relief, publication, WhatsApp, live data, settings or release-branch changes. The task record's expected file list named those shared files as possibilities, and the narrower actual change is consistent with the finding that no count-definition change was justified.

## Findings

- **Zero-quota wording is correctly gated**: the new branch requires `entitlement===0`, a finite `completed`, and not a daily roster. Unknown history (null completed/entitlement) still falls through to "Unavailable", as the UI test proves.
- **D1 test proves read-only parity**: the calculations route is executed against a real D1 store with Google network calls blocked, Google and D1 completions are deep-equal, and the saved state is byte-identical before and after. Opening-balance case counts 9 (7 opening + 2 retained completed) without re-counting pre-cutoff history, with `from` at the fresh-start effective date.
- **Task record reviewer line is stale**: the task record still names Claude as reviewer and says "Reviewer: Claude, exact PR head". The PR body correctly names Muse at this head, and the owner returned coordination to Muse on 13 Nov. Minor; the record could be corrected on merge, not a blocker.
- **Merge is still held by the owner**: the task record says "merge held by owner" and no "merge 46" has been given. This approval is a review only; the owner merges.
- No findings against approval.

## Not tested

Live Google/D1/R2/Drive/Meta/provider behaviour, secret values, deployed authority/configuration, staging/production saves, production browser sessions, or owner rollback. The owner's exact historical relief records remain unaudited (the task record is explicit that missing history is not evidence and no records are fabricated). The full local suite was not re-run in full here; the five programs above plus the parity guard and canonical build were run at the exact head, and full CI (all 5 jobs) is green at the exact head.

## Release notes

Ships in the next release after the owner merges it. Deploy the updated Roster Pages `roster-calculations.js` (no Worker or backend change). My Calculations will show the completed count with "no relief quota recorded, so no percentage" for zero-quota teachers, and "Unavailable" only when history is genuinely unknown. Google stays frozen.
