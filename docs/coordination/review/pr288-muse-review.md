# Review: PR #288 — Preview Core evidence retention in Toolbox (Muse, exact head 346fd22e)

Project: v1. Reviewer: Muse, at the exact head SHA, under the owner's 16 Nov 2026 directive (source commit 12b06eb): Muse reviews v1 PRs at the exact head, replacing Claude until Claude returns; no code, merges or coordination. GPT merges.

## Verdict

**APPROVED at exact head `346fd22e95599141c0340be2b8e8fe01c33f136c`.**

## PR

- #288, `codex/v1-core-retention-preview`, "Model: Codex / Preview Core evidence retention in Toolbox". Reviewer named: Muse at exact head `346fd22e`. Merger: GPT.
- State at review: OPEN, not a draft, MERGEABLE/CLEAN. Base `5119a9b`; merge-base `4fa2b60d` (the accepted claim commit).
- Adds a bounded dry-run preview of Core evidence retention in the Global Admin Toolbox: 90-day and 365-day candidate counts with protection reasons. No deletion, no byte estimate, no duration decision.

## CI at the exact head

- "Isolated v1 product", run 45107745509, head `346fd22e`, event pull_request. First attempt completed **failure** on exactly one program, `v1-product-venues-register-ui.mjs`, with a `SocketError: other side closed` at setup — the known socket flake (same signature as the #235 flake and the #281 teardown failure), no failed assertion, and #288 touches nothing in Venues. The failed job was rerun once (`gh run rerun 45107745509 --failed`); attempt 2 completed **success** with **192/192 product programs passed**.
- "Verify GSiS queue changes", run 45107725639, head `346fd22e`, completed **success**: full-suite pass, scope pass, regression shards skipping (v1-only change under the #280 scope rule). No waiver needed: this is a `codex/**` branch, so Node/LORD CI ran.

## Scope

Diff against the merge-base (`4fa2b60d`): **5 files, 866 insertions, 2 deletions.** The file list matches the task record's exact scope.

| File | Change |
| --- | --- |
| `docs/coordination/tasks/v1-core-retention-preview.md` | +35/−1: implementation contract, verification and handoff |
| `tests/v1-product-core-retention-preview-browser.mjs` | +614, new: seven-group browser test |
| `v1/web/overlays/admin/index.html` | +11/−1: retention preview section in the evidence area |
| `v1/web/shared/admin.js` | +204: estimate handler, strict response validation, epoch/generation guards |
| `v1/web/shared/client.js` | +4: exact-path dry-run bypass of the pending-write map |

- `git merge-tree --write-tree --name-only origin/main 346fd22e` returns a clean tree (`7b49d599…`). No conflicts.
- `git diff --check` clean. Secrets scan of the diff: no secret values (the only matches are the pre-existing "Never enter an access token or client secret." help text in the Toolbox page).

## Change, read (not trusted)

- One explicit **Get estimate** action reads the 90-day and 365-day windows sequentially from the existing Core endpoint `/admin/evidence/retention` with `dryRun: true` and `limit: 500`. Core remains the sole data and permission owner; each request keeps the existing Global Admin, non-impersonation, CSRF and request-ID checks. The preview prepares no cleanup operation and deletes nothing.
- The client bypass is narrow: only the exact path `/api/core/admin/evidence/retention` with the literal boolean `dryRun === true` bypasses the pending-write map. Omitted/false flags, other routes and other domains keep their current write handling — group 7 of the new test proves this.
- Response validation is strict: dryRun true, retentionDays matches the window, limit 500, `retentionDeletionEnabled` boolean, positive safe-integer cutoff, 64-hex previewDigest, counts 0–500, evidence + protected ≤ 500, unknownOwners within the seven-owner list with no duplicates, protection-reason entries exactly matching the protected count (id ≤ 160 chars, reason non-empty string ≤ 300), and deleted counts exactly 0. Anything else throws and the window shows an error — never a zero-valued estimate. Unknown owners and the 500-row bound are shown as explicitly incomplete.
- Account-context safety: an epoch change (`gsis:save-status`) or protected-state clear removes the results immediately, aborts in-flight requests and invalidates late responses via the generation check. The button is enabled only after the session loads with the epoch unchanged since page load, and double-clicks cannot start a second estimate.
- Rendering uses `textContent` only; no injected HTML. The page text states the counts are bounded, not complete totals or estimated bytes saved, and that retention duration remains undecided.

## Local verification at the exact head

Worktree `~/workspace/gsis-work/review/wt288-review` at `346fd22e`. TZ=Asia/Singapore, NODE_NO_WARNINGS=1, GSIS_BROWSER_EXECUTABLE / ROSTER_TEST_CHROMIUM / LORD_TEST_CHROMIUM = Playwright chromium-1234.

- `npm ci` (root): exit 0. `npm ci --prefix v1`: exit 0.
- `node tests/v1-product-core-retention-preview-browser.mjs`: exit 0 — **7/7 groups pass** (actual 90/365 owner scans with local/remote protection, serial double-click guard, no pending cleanup; 501-row source marks the 500-row scan incomplete; malformed/non-preview/deleting responses and owner outage never become zero or confirmed estimates; unknown-owner reply keeps evidence unknown instead of zero; legacy evidence still recovers as incomplete with byte-equal retained rows and no cleanup operation; real account switch clears counts synchronously and suppresses late replies, non-Admin access denied 403; only the exact Core path plus explicit true bypasses pending-write recovery).
- `node tests/v1-product-toolbox.mjs`: exit 0 (unchanged regression).
- `node tests/v1-product-core-evidence-retention.mjs`: exit 0 (unchanged owner regression).
- `npm run build`: exit 0. `git diff --exit-code`: zero tracked drift.
- `node scripts/v1/build.mjs`: exit 0. `node scripts/v1/verify-build.mjs`: exit 0.

## Findings

None.

## Quality gates

- Q01 (scope): five files inside the task record's stated scope. Pass.
- Q02: the preview is read-only by construction (dry-run endpoint, strict validation, no cleanup path); the test asserts no pending cleanup operations and byte-equal retained rows. Pass.
- Q03: the new test covers the endpoint, the bound, malformed responses, unknown owners, legacy recovery, account switching and the client classification. Pass.
- Q04: no deployment, migration or live-data effect. Not applicable.
- Q05: product CI green at the exact head on the rerun (192/192, run 45107745509 attempt 2); queue CI green (run 45107725639). The first attempt's single failure was a known socket flake, unrelated to this change; the rerun is disclosed, not hidden. Pass.
- Q06: builds pass with zero drift. Pass.
- Q07: records verified against live state as listed above. Pass.
- Q08: this exact-head review. Pass.
- F5 remains OPEN. This PR is the preview the #262 disposition anticipated; it does not close F5. Hosted UAT remains Not tested; retention duration and deletion confirmation remain separate owner decisions.

## Release notes

- Toolbox now previews bounded 90-day and 365-day evidence-retention candidate counts with protection reasons. Reclaimable bytes remain unmeasured; nothing is deleted.
- GPT to merge. No deployment authorised.
