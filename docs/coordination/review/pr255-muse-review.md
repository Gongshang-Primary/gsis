# Review: PR #255 — Contacts/Deploy direct 11-tag publication, Basic Name timestamp conflict & cross-draft TTb Name reservation (C04–C10, C19–C23)

- Reviewer: Muse, replacing Claude until Claude returns, per the owner's 16 November directive (source 12b06eb).
- Verdict: **APPROVED at the exact head** `3258734`.
- Branch: `antigravity/v1-contacts-deploy-direct-tag-publication`. Base: main `6461f4e`. PR status: open, MERGEABLE. GPT to merge.
- No deployment authorised.

## What it does

Extends Deploy → Contacts publication to directly apply all 11 deployment tags, with server-timestamp conflict resolution for `Basic Name` and cross-draft `TTb Name` reservation:

- **All 11 deployment tags + blank-clears + bidirectional `Active`** (C04, C05, C08–C10, C21): `proposalFields` in `v1/services/deploy/model.mjs`, `contributions()` in `v1/services/deploy/service.mjs`, `allowedFields` in `v1/services/contacts/service.mjs`, and `authorizeContribution()` in `v1/services/core/contributions.mjs` now cover all 11 tags (`role`, `eoAppointmentLevel`, `appointmentStatus`, `employmentArrangement`, `employmentStatus`, `schoolSection`, `personnelCategory`, `employmentTags`, `subjectTags`, `mkTags`, `memberships`), bidirectional `employmentActive` (`Y↔N`), and `basicName`. Blank-clears normalise deterministically (`""` / `null` → `null` for scalar tags, `[]` for multi-token modifier tags; semicolon/comma-separated modifier lists split and trimmed). Contributions carry `directTagPublicationVersion: 1`, verified by Core like the membership publication (with `validFrom` allowed null for direct tags).
- **Timestamp-checked `Basic Name` conflict resolution** (C25, C26): Deploy `basicName` contributions carry `basicNameChangedAt` (recorded as `basicNameProvenance` in `teacherDraftMeta` when a draft sets a Basic Name, with actor and operation IDs). `v1/services/contacts/contributions.mjs` compares it against Contacts' `contacts_fields.accepted_at`; when Contacts' `Basic Name` was edited more recently, the stale Deploy contribution is superseded (`CONTACTS_BASIC_NAME_NEWER`) without overwriting Contacts' newer value. The supersede path returns the processed outcome so the outbox entry is accepted as handled.
- **Cross-draft `TTb Name` reservation & release** (C19, C22): `assertNoCrossDraftTTbCollision` inspects active (`v.deleted=0`) `teachers` and `teacherDrafts` rows across drafts; registering a provisional teacher or renaming a teacher's TTb Name in one draft rejects collisions with `409 DUPLICATE_TTB_NAME`, and deleting the conflicting draft immediately releases the reservation (the check only sees active rows). For `/staff/register`, the check is scoped to unpublished draft overrides only (`draftOverridesOnly`), so published teachers do not block a new registration — the atomic TTb guard in `/staff/create` still handles races. `EO Appt Level` stays protected (the head commit keeps it out of the register-time TTb derivation inputs).

## Scope, merge, secrets

- Diff vs the PR base: exactly 7 files, matching the task record's exact-file allowlist (task record, new test, `v1/services/contacts/contributions.mjs`, `v1/services/contacts/service.mjs`, `v1/services/core/contributions.mjs`, `v1/services/deploy/model.mjs`, `v1/services/deploy/service.mjs`). 569 insertions, 25 deletions.
- `git merge-tree --write-tree --name-only origin/main 3258734` clean (tree e09e8323); GitHub reports MERGEABLE/CLEAN.
- `git diff --check`: clean. Secrets scan of the diff: clean.
- `npm run build` produces zero drift in `roster-update/`, `public/`, `shared/` (verified locally with `git diff --exit-code`).

## CI at the exact head

- Isolated v1 product run 44880479369: **success at head 3258734**. (The earlier run at 8faf0c5 failed on `v1-product-deploy-ttb-registration.mjs` (`DUPLICATE_TTB_NAME` assertion), `v1-product-deploy-workbooks.mjs`, and a stapler-resize timing flake; the builder fixed it with the head commit, which keeps EO Appt Level protected and scopes the `/staff/register` TTb check to unpublished draft overrides.)
- Node/LORD ("Verify GSiS queue changes"): **no run exists for this head**. The workflow `verify-queue.yml` triggers only on push to `codex/**`, `muse/**`, `claude/**` branches, so `antigravity/**` branches never trigger it. The owner waived this notation difference on 20 Nov 2026 ("review all done by antigravity, ignore difference in notation, i will orchestrate") and, on 21 Nov, directed review of these PRs after the gap was restated to him. This approval rests on the green product CI at the exact head plus the full local verification below, and the waiver is recorded here rather than hidden.

## Local checks at the exact head

Worktree `wt255-review` at 3258734, `npm ci` in root and in `v1/`, `TZ=Asia/Singapore`, Playwright Chromium:

- `tests/v1-product-contacts-deploy-direct-publication.mjs`: exit 0, PASS.
- `tests/v1-product-deploy-memberships.mjs`: exit 0, PASS.
- `tests/v1-product-deploy-ttb-registration.mjs`: exit 0, PASS.
- `npm run build`: exit 0, zero v0.9 drift. `node scripts/v1/build.mjs` and `node scripts/v1/verify-build.mjs`: exit 0.

## Findings

None.

## Quality gates

- Q01–Q06 pass at the exact head (bounded scope, exact-head product CI green, local checks green). Q07 is this review. Q08 is not applicable — no deployment authorised.
- Hosted/runtime UAT: **Not tested**.
