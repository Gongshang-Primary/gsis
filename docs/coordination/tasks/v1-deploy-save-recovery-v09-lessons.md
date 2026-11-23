# V1 Deploy: lessons from the v0.9 pending-save hotfix

## Disposition — 23 November 2026 (Asia/Singapore)

This reconciliation uses main [`b952c7e4`](https://github.com/Gongshang-Primary/gsis/commit/b952c7e402323c53c6ae3ad834a6c52552842378) and preserves the original audit below. It supersedes the old forward-looking handoff, not its pinned observations. PR #245's prior documentation head was `8967055dfc2bbbbf3d4b6cf05f3545b5a5f2d64b`.

- The actionable readable-label and pre-dispatch-refusal regression work merged in [#260](https://github.com/Gongshang-Primary/gsis/pull/260), commit [`3160da94`](https://github.com/Gongshang-Primary/gsis/commit/3160da940976f66c8b69522225fc510763b811cb). This audit is not an outstanding duplicate implementation claim.
- A later combined-main failure came from Review fixtures that existed only in the browser working copy. [#263](https://github.com/Gongshang-Primary/gsis/pull/263), merged at [`ab195175`](https://github.com/Gongshang-Primary/gsis/commit/ab195175f268b93ccb1ca4ee91d57db10962d05f), persists the teacher and class through the real synthetic owner paths before Review. It retains the genuine-missing-reference fallback and the recovery assertions. [Muse's exact-head review](../review/pr263-muse-review.md) records 17 passing groups at `31be52c85f8ebd410b8c23dadba28c23c3ea5ea1`; that historical result is not a test run of this documentation head.
- No new v1 defect or product change is claimed by this reconciliation. The distinctions between unsent, uncertain, committed and aborted operations below remain the evidence to preserve in later changes. Merged source alone does not establish which hosted version a user exercised.

The existing one-file scope is unchanged. The local branch incorporates the pinned main with a non-force merge; only this document differs from that main. Documentation scope, retained historical text, relative links and `git diff --check` were checked. No application test, build, new CI run, hosted UAT, deployment or live-data operation was performed for this update. Official T1B-01/T1B-02 remain **Not tested**; F5 remains **OPEN**.

Under the [current owner directive](../OWNER_DIRECTIVES.md), Muse reviews the new exact head and GPT/Codex is the merger. No exact-head approval is claimed for this update. The older Claude-review wording below is retained solely as history. This local reconciliation does not publish or merge the PR.

## Historical audit — 20 November 2026 (preserved)

Model: Codex. Owner requested on 20 November 2026, Asia/Singapore: “mirror the findings over to v1 in case such a flaw in logic is there too”.

This is a separate v1 read-only audit and handoff. No v1 product change, live request, deployment or data change is claimed. V1 coordinator: ChatGPT. Any subsequent v1 implementation has its own claim, branch, scope and Claude review.

## Evidence and scope

- V1 code basis: main `e6df70b7de2318798c9ef7bc7e0d40fac37489c5`.
- Shared visual source also inspected after the isolated v0.9 correction at `1483c631000468201f4a739624b7a8ed4a95b61f`.
- Relevant canonical sources: `scripts/v1/build-web.mjs`, `v1/web/shared/client.js`, `v1/services/deploy/service.mjs`.
- Relevant existing tests: `tests/v1-product-deploy-save-recovery-browser.mjs`, `tests/v1-product-deploy-save-recovery.mjs`, `tests/v1-product-deploy-note-revision-browser.mjs`.
- Record: `docs/coordination/tasks/v1-deploy-save-recovery-v09-lessons.md`. Scope is this document only; no v1 implementation is claimed.

## The confirmed v0.9 failure

The v0.9 UI created a fresh `queueFlight` for six draft edits. Its old command client rejected that fresh request locally because an earlier request remained open. No new save was sent, but the untyped error made the UI retain the new ID as uncertain, disable input and repeatedly check the wrong ID. Review headings also exposed internal assignment keys and `true`/`false` values.

The correction distinguishes definitely-unsent new input from an actually submitted unknown operation; checks the actual original blocker; refreshes a confirmed saved revision while retaining newer edits; and uses teacher/class/group/subject labels. It does not discard uncertain operations, infer failure from HTTP 4xx, or blindly resend a changed proposal.

## V1 findings

**The identical v0.9 command-client deadlock was not found in v1.** V1 does not use that legacy Apps Script command transport. `updateDeploy()` in `scripts/v1/build-web.mjs:829` removes `/api/commands`; `updateDeployRecovery()` replaces the ordinary save/note functions with v1 recovery-aware implementations.

Existing protections:

| Concern | V1 implementation and evidence |
| --- | --- |
| Distinguish definitely-unsent failures | `v1/web/shared/client.js:481` stores context-bound local proof in a `WeakMap`; `isUnsentOperation()` at line 504 checks the exact service, operation ID, epoch, actor context and absence from pending operations. A generic error property or HTTP status is not proof. |
| Restore editable new draft | Generated `pumpQueue()` in `scripts/v1/build-web.mjs:679` calls `isUnsentOperation()` before returning edits to `cellQueue`, clearing `queueFlight` and unlocking input. Otherwise it retains the original attempt. |
| Preserve genuine uncertainty | `recoverDeploySave()` at line 652 operates on the retained attempt/reference. Check, retry and stop-original-save controls are distinct. `submitDeployAttempt()` at line 581 requires verified committed recovery evidence before treating the save as complete. |
| Refresh current saved data after recovery | `finishDeployQueue()` at line 639 clears the completed attempt, invalidates the snapshot and refreshes saved data. It does not declare an old returned snapshot current. |
| Handle notes separately | `saveVersionNote()` at line 744 applies the same definitely-unsent distinction. `finishVersionNote()` at line 714 reads the current note and rejects stale session/entry continuations. |
| Capacity refuses before writing | `reserveWrite()` in `v1/web/shared/client.js:1952` accounts for the parent operation and prerequisite lease together. Its capacity refusal at line 2044 is explicitly marked unsent. |

**Readable review labels are shared visual source.** V1 builds the Deploy frontend from `public/` and retains the ordinary unsent-draft Review renderer. The fresh local v1 build from `1483c631` contains `draftReviewTitle()` and `draftReviewValue()`, so the v0.9 label correction flows into the next v1 build that includes this source commit. This is not evidence that any hosted v1 deployment already contains it. Do not hand-edit generated v1 assets or duplicate the correction in another renderer unnecessarily.

## State distinction to retain

| Evidence | Required behaviour |
| --- | --- |
| Trusted local proof this fresh operation never entered dispatch/pending storage | Keep its input editable; do not invent an uncertain submitted request. |
| Operation or its prerequisite may have been sent; receipt unavailable, malformed or unknown | Retain the original identity and frozen intent; show recovery; do not create a replacement ID or mark saved. |
| Verified committed original receipt | Settle that original attempt and load the current saved revision before a later dependent save. |
| Verified aborted original receipt | Preserve the draft; a new deliberate save may use a new operation ID after current-state review. |
| HTTP 4xx/5xx alone | Not proof of non-application; retain uncertainty unless the contract provides stronger evidence. |

## Regression handoff

Do not copy the v0.9 tests mechanically: v1 has a different operation lifecycle and explicit local-proof API. Retain or extend the existing actual-built-browser tests with these scenarios:

1. An unrelated retained old operation plus fresh Deploy edits: a pre-dispatch refusal keeps all new edits editable, creates no phantom operation and performs no lease/save request.
2. A late status result targets only its original operation and cannot clear a newer draft or another version's note.
3. Genuine response loss preserves the original ID and frozen wire; Check is read-only; explicit Retry creates at most one durable effect.
4. A verified committed receipt refreshes current state; a historical receipt cannot roll back newer notes or revisions.
5. Missing/malformed receipts and generic HTTP errors never become “Saved” or trusted-unsent proof.
6. Review of assignment additions/removals shows teacher, class/TG and subject labels with assigned/unassigned wording; preserve opaque identities internally and escape display text.

The existing browser file already covers many of these, including storage refusal before lease/save at lines 830–859, capacity refusal at lines 1017–1053, exact original retry, no duplicate durable effect, and historical nonselected-note protection. The combined “unrelated retained operation plus new edit” case should be explicit if later client changes add a broader pending-operation gate.

## Validation and limits

- Read applicable v1 instructions, skill policy, Rust-inspired principles and quality gates. Applied source tracing and recovery-boundary review; no additional skill workflow was executed.
- `TZ=Asia/Singapore NODE_NO_WARNINGS=1 node scripts/v1/build-web.mjs /tmp/gsis-v1-save-audit-web` passed: 331 assets, 9 modules. Inspected the actual generated Deploy code for its v1 save replacement and inherited readable labels.
- `TZ=Asia/Singapore NODE_NO_WARNINGS=1 GSIS_BROWSER_EXECUTABLE=/usr/bin/chromium ROSTER_TEST_CHROMIUM=/usr/bin/chromium node tests/v1-product-deploy-save-recovery-browser.mjs` passed, exit 0: 15 printed recovery scenario groups. It uses the actual built browser and isolated local Workers/D1 with synthetic data. Output: `/tmp/v1-save-recovery-browser-audit.log`.
- No independent full v1 suite or live runtime UAT was performed for this read-only handoff. The v0.9 hotfix's full-suite/CI result is not a v1 deployment or approval.
- No v1 logic defect is asserted solely from similarity to the v0.9 incident. A new implementation needs a failing v1 behavioural reproduction and its own bounded scope.
