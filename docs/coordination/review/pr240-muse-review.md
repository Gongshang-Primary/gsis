# Review: PR #240 — Publish Deploy HR Terms catalogues to Contacts with retain-and-flag (DEP-17-001)

- Reviewer: Muse, replacing Claude until Claude returns, per the owner's 16 November directive (source 12b06eb).
- Verdict: **APPROVED at the exact head** `24f653bb`.
- Branch: `antigravity/v1-deploy-hr-terms-contacts-publish`. Base: main `7ee24189`. PR status: open, MERGEABLE. GPT to merge.
- No deployment authorised.

## What it does

Completes the external Contacts HR Terms catalogue publication half of DEP-17-001:

- New `v1/services/deploy/hr-terms-publish.mjs`: `buildHrTermsPublication` freezes version-owned HR Terms choices into Deploy's immutable published envelope on `/publish`. Explicit empty lists `[]` are preserved separately from absent lists (presence checked with `hasOwnProperty`); fixed lists (Day of Birth, Month of birth, Active) are excluded; `Role` is published from the role membership schema when present. Draft saves never touch Contacts.
- `v1/services/deploy/service.mjs`: `POST /hr-terms/sync` (`deploy.publish`) verifies the publication is committed with action `deploy.publish`, requires the envelope to carry `hrTermsPublication` schemaVersion 1, calls Contacts `/internal/hr-terms-publication`, requires a confirmed outcome state (`applied`/`partial`/`superseded`), and records the delivery in `deploy_deliveries` (recipient `contacts-hr-terms`, attempts incremented on retry).
- New `v1/services/contacts/hr-terms-publish.mjs` (352 lines):
  - `POST /internal/hr-terms-publication`: verifies Deploy's committed publication via `/internal/publication/verify` (committed, matching school/publication, `hrTermsPublication` schemaVersion 1 with lists) and Core's `deploy.publish` decision via `/internal/decision` (proof decisionId, `allowHistorical`). Rejects fixed fields and unknown fields with 403/400. Choice lists are normalized (dedup, per-field limits, no control characters).
  - Monotonic sequence per field: a delayed older publication never overwrites a newer catalogue (superseded fields are listed, state `applied`/`partial`/`superseded`). Each catalogue write is guarded by a MAX(revision) check. The operation is idempotent by `digest(schoolId, publicationId, sourceOperationId)` with `prepareOperation` receipt recovery.
  - 15 Nov retain-and-flag rule: existing accepted staff values are scanned per updated field; out-of-catalogue values are returned in `flaggedStaffValues` (`reason: "OUT_OF_PUBLISHED_CATALOGUE"`, `retained: true`) and `staffValuesMutated: false` — no staff record is written; only `contacts_catalogues` rows are inserted.
  - `GET /hr-terms` (`contacts.read`): returns the published lists with revisions and provenance, including `explicitlyEmpty`.
- Catalogue definitions grant no SMC/EO/School Leader authority.

## Scope, merge, secrets

- Diff vs origin/main: exactly 6 files, matching the task record's exact-file allowlist. 739 insertions, 3 deletions.
- `git merge-tree --write-tree --name-only origin/main 24f653b` clean (tree 7186f228), re-checked against current main.
- `git diff --check`: clean. Secrets scan of the diff: clean.
- No SQL migrations, no v0.9 source edits.

## CI at the exact head

- Isolated v1 product run 44625938344: **success at head 24f653b**.
- Node/LORD ("Verify GSiS queue changes"): **no run exists for this head**. The workflow `verify-queue.yml` triggers only on push to `codex/**`, `muse/**`, `claude/**` branches, so `antigravity/**` branches never trigger it. The owner waived this notation difference on 20 Nov 2026 ("review all done by antigravity, ignore difference in notation, i will orchestrate") and will orchestrate the workflow fix/merges. This approval rests on the green product CI at the exact head plus the full local verification below, and the waiver is recorded here rather than hidden.

## Local checks at the exact head

Worktree `wt240-review` at 24f653b, `npm ci` in root and in `v1/`, `TZ=Asia/Singapore`, Playwright Chromium:

- `tests/v1-product-deploy-hr-terms-publish.mjs`: exit 0, PASS — draft isolation, explicit empty, retain-and-flag, idempotency, monotonic ordering.
- `tests/v1-product-deploy-storage.mjs`: exit 0, PASS.
- `npm run build`: exit 0, no diff. `node scripts/v1/build.mjs` and `node scripts/v1/verify-build.mjs`: exit 0.

## Findings

None.

## Quality gates

- Q01–Q06 pass at the exact head (bounded scope, verified publication + authority, exact-head product CI green, local checks green). Q07 is this review. Q08 is not applicable — no deployment authorised.
- Hosted/runtime UAT: **Not tested**.
