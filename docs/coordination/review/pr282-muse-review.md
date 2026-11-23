# Review: PR #282 — Implement Contacts/Deploy lifecycle C08, C06/C25 and C26 follow-ups (Muse, exact head 2acf8099)

Project: v1. Reviewer: Muse, at the exact head SHA, under the owner's 16 Nov 2026 directive (source commit 12b06eb): Muse reviews v1 PRs at the exact head, replacing Claude until Claude returns; no code, merges or coordination. GPT merges.

## Verdict

**APPROVED at exact head `2acf809987036a313ce1c6493f1825a2bb8d1b03`.**

## PR

- #282, `antigravity/v1-contacts-lifecycle-c08-c25-c26`, "Model: Antigravity / Implement Contacts/Deploy lifecycle C08, C06/C25 and C26 follow-ups". Reviewer named: Muse at exact head `2acf8099`. Merger: GPT (Codex).
- State at review: OPEN, not a draft, MERGEABLE/CLEAN. Base `1041e392b314659f563e500345c10fe74ee59d25` (current main at the time of the review; main has since moved only by the #281 review record).
- Single commit at the head. This implements the three lifecycle items deferred after PR #254.

## CI at the exact head

- "Isolated v1 product", run 45028958403, head `2acf809987036a313ce1c6493f1825a2bb8d1b03`, event pull_request, completed **success** (29m3s).
- No "Verify GSiS queue changes" (Node/LORD) run exists at this head. That is expected: the workflow triggers only on push to `codex/**`, `muse/**` and `claude/**` branches, and this is an `antigravity/**` branch. **Waiver:** the owner directed on 20 Nov 2026 ("review all done by antigravity, ignore difference in notation, i will orchestrate") and again on 21 Nov to review all available Antigravity PRs. This approval therefore rests on green product CI at the exact head plus the full local verification below, with the Node/LORD absence disclosed openly, not hidden.

## Scope

Diff against the merge-base (`1041e392`, current main): **6 files, 605 insertions, 26 deletions.** The file list matches the task record's Files Claimed exactly.

| File | Change |
| --- | --- |
| `docs/coordination/tasks/v1-contacts-lifecycle-c08-c25-c26.md` | +44, new: task record (scope, files, local verification) |
| `tests/v1-product-contacts-lifecycle-c08-c25-c26.mjs` | +414, new: end-to-end regression test for C08, C06/C25, C26 |
| `v1/services/contacts/contributions.mjs` | C26 tie-break in `processContribution` |
| `v1/services/deploy/model.mjs` | C08 `copiedDeploymentTags` snapshot in `mergeContacts` |
| `v1/services/deploy/service.mjs` | C08 contributions, C06/C25 provenance + hoisted collision guard, C26 `basicNameOperationId` |
| `v1/services/deploy/workbooks.mjs` | C06/C25 provenance in `validateWorkbook` |

- `git merge-tree --write-tree --name-only origin/main 2acf8099` returns a clean tree (`c0e8e1c7…`). No conflicts.
- `git diff --check` clean. Secrets scan of the diff: no secret values (no `secret`/`password`/key/token-value hits).
- No relative Markdown links in the changed docs (the task record contains none). The task record's scope text matches the PR body.

## Code verification (read, not trusted)

**C08 — untouched copied deployment tag publication.** `copiedTagSnapshot` in `model.mjs` copies the 10 ordinary deployment tags and drops `Memberships`. In `mergeContacts`, on an ordinary load/save the existing saved snapshot is preserved (`saved.copiedDeploymentTags`); on refresh or for a newly added teacher a fresh snapshot is taken from current Contacts facts; a legacy row that never had a snapshot gets none fabricated (undefined stays unset). The projection always supplies `fields` for deploy-purpose staff entries (Contacts `/internal/projection` sets `x.fields` unconditionally), and teachers absent from the projection are carried over wholesale by the orphan path, so the snapshot cannot be silently dropped on an ordinary load. In `contributions()`, `copiedOrdinary` emits `directTagPublicationVersion: 1` contributions for copied tags that drifted from current Contacts facts, only for labels not overridden in `teacherDrafts` (the ordinary path handles draft-touched fields, so there is no double emission); values are normalised with `normalizeTagContributionValue` and compared canonically, so an unchanged tag emits nothing, while an explicit blank/clear in the snapshot is restored. `Statutory Name` and `Mobile No` are not in `copiedTagFields` and are untouched. The version marker is consumed in `v1/services/core/contributions.mjs` (lines 183–188), which requires a valid publication proof sequence and lets the direct publication win.

**C06/C25 — workbook import Basic Name provenance and cross-draft collision guard.** `validateWorkbook` records `teacherDraftMeta[staffId].basicNameProvenance` (`value`, `changedAt`, `source: "deploy"`, `actorId`, `operationId`) only when the imported Basic Name genuinely changes: the value must be a non-empty string and must differ from the baseline after trimming, so whitespace-only differences and unchanged imports record nothing. `changedAt` uses the server-supplied `meta.now`; `previewImport` passes the preview operation id and `applyImport` passes the apply operation id, and `validateWorkbook` works on a `structuredClone` of the document, so a preview cannot mutate or pre-stamp the saved doc. `projectPlanningNames(next)` runs when proposals exist; the function is exported from `v1/web/shared/deploy-eligibility.mjs`. In `save()`, the `assertNoCrossDraftTTbCollision` loop was hoisted out of the `applyEdits`-only `else` branch (in the base it sat inside `if (!next)` under the `saveVersionNote` else), so it now runs on any TTb Name change whether the save came from `applyEdits` or `applyImport`. A note-only save is unaffected in practice (teachers unchanged, so no name differs from `before`).

**C26 — deterministic durable ordering for equal-millisecond Basic Name edits.** Deploy `basicName` contributions now carry `basicNameOperationId` from the provenance (when a non-empty string). `processContribution` compares `(changedAt, operationId)` against Contacts `(accepted_at, operation_id)`: Contacts wins iff its timestamp is strictly later, or equal with a lexicographically greater operation id, falling back to `sourceOperationId` when no `basicNameOperationId` is present. The tie-break is deterministic and replay-invariant for equal timestamps; it does not rely on delivery order or client clocks. On a tie the outcome JSON records both operation ids alongside `CONTACTS_BASIC_NAME_NEWER`.

**New test** (`tests/v1-product-contacts-lifecycle-c08-c25-c26.mjs`, 414 lines, Miniflare/D1, no browser): seeds a teacher with all 11 tags, clears `appointmentStatus` before copying V1, asserts the snapshot (including the null clear), edits all tags plus Statutory Name and Mobile in Contacts after the copy, publishes V1 with zero draft edits, and asserts Contacts reverts to the copied values while Statutory Name and Mobile stay at their updated values. Then verifies an unchanged workbook import records no provenance, a changed import records server provenance (`source: "deploy"`, apply operation id, safe-integer `changedAt`), and a cross-draft TTb collision on import is rejected 409 `DUPLICATE_TTB_NAME`. Finally it forces `accepted_at === basicNameChangedAt` by direct D1 update and checks both tie-break directions (Contacts operation id greater → Contacts wins with `CONTACTS_BASIC_NAME_NEWER` and both ids in the outcome; Deploy operation id greater → Deploy wins).

## Local verification at the exact head

Worktree `~/workspace/gsis-work/review/wt282-review` at `2acf8099`. TZ=Asia/Singapore, NODE_NO_WARNINGS=1, GSIS_BROWSER_EXECUTABLE / ROSTER_TEST_CHROMIUM / LORD_TEST_CHROMIUM = Playwright chromium-1234.

- `npm ci` (root): exit 0. `npm ci --prefix v1`: exit 0.
- `npm run build`: exit 0. `git diff --exit-code -- roster-update/ public/ shared/`: zero v0.9 drift.
- `node scripts/v1/build.mjs`: exit 0. `node scripts/v1/verify-build.mjs`: exit 0.
- Product tests, each exit 0, run sequentially in the PR body's listed order:
  - `tests/v1-product-contacts-lifecycle-c08-c25-c26.mjs` — exit 0 (C08, C06/C25 and both C26 directions pass)
  - `tests/v1-product-contacts-deploy-direct-publication.mjs` — exit 0
  - `tests/v1-product-deploy-draft-contacts-insulation.mjs` — exit 0
  - `tests/v1-product-deploy-workbooks.mjs` — exit 0
  - `tests/v1-product-membership-publication.mjs` — exit 0
  - `tests/v1-product-authority-publication.mjs` — exit 0
  - `tests/v1-product-deploy-duplicate-contacts.mjs` — exit 0
  - `tests/v1-product-deploy-planning-eligibility.mjs` — exit 0
  - `tests/v1-product-deploy-memberships.mjs` — exit 0
  - `tests/v1-product-core-contacts.mjs` — exit 0
- No timing-flake reruns were needed. The PR body's local verification claims are therefore verified by re-running them, not trusted.

## Findings

None blocking. No minor notes.

## Quality gates

- Q01 (scope): six files, all within the claimed task scope; no v0.9 product paths, no workflow files. Pass.
- Q02 (no silent behaviour change outside the claimed scope): the collision guard now also runs on import saves, which is the claimed C25 behaviour; the whitespace-only Basic Name skip in `validateWorkbook` removes only a no-op draft entry. Pass.
- Q03 (evidence): product CI green at the exact head; local tests and builds re-run at the exact head. Pass.
- Q04 (no deployment or live-data effect in the PR): the change is service logic behind existing capability gates; nothing in this PR deploys or migrates. Pass.
- Q05 (CI): product green at the head; Node/LORD absent under the disclosed waiver. Pass with waiver.
- Q06 (builds): root and v1 builds pass; zero v0.9 drift. Pass.
- Q07 (records): task record, PR body and code agree on scope, files and behaviour; all cited heads and mechanisms verified. Pass.
- Q08 (exact-head review): this review. Pass.
- F5 remains OPEN. This PR does not close it. Hosted UAT, authenticated runtime UAT and hosted restore remain Not tested, as before.

## Release notes

Implements the three Contacts/Deploy lifecycle follow-ups deferred after #254: untouched copied deployment tags are restored on publish (C08), workbook imports record server-assigned Basic Name provenance and cross-draft TTb collisions are rejected on import as well as edit (C06/C25), and equal-millisecond Basic Name edits resolve deterministically by operation id (C26). No deployment authorised by this review. GPT to merge.
