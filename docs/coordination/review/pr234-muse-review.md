# Review: PR #234 — Port Roster contactCreate via Contacts provisional registration (F03)

- Reviewer: Muse, replacing Claude until Claude returns, per the owner's 16 November directive (source 12b06eb).
- Verdict: **APPROVED at the exact head** `4ab3d8cf`.
- Branch: `antigravity/v1-roster-contact-create`. Base: main `7ee24189`. PR status: open, MERGEABLE. GPT to merge.
- No deployment authorised.

## What it does

Ports Roster `contactCreate` (F03), called by both Assign Relief and Stapler, delegating permanent Staff ID creation to Contacts:

- New `v1/services/roster/contact-create.mjs`: validates `operationId` (required, token-shaped), `basicName` (1–120 chars), and mobile (8 digits starting 8 or 9, with `0065`/`65` prefix stripping). Derives the TTb Name with the shared `previewTTb` formatter (#207) and refuses when it does not fit. Computes a deterministic `expectedStaffId` from `digest([schoolId, "provisional-" + digest(["roster", operationId])])` so an exact retry with the same operationId recovers its own committed record instead of flagging itself as a duplicate.
- Duplicate handling reads the current Contacts `/internal/projection`: exact mobile or exact TTb Name returns `{ saved: false, blocked: true, duplicates }` without creating anything; name similarity ≥ 0.7 (NFKD-normalised token overlap) returns a warning unless `confirmDistinct: true`. Creation delegates to Contacts `/internal/register-provisional` via authenticated `serviceCall` — Roster never writes Contacts D1 directly, preserving Contacts as sole staff-identity owner (R01). A Contacts `IDENTITY_SELECTION_REQUIRED` is surfaced as a blocked response, not a throw.
- `v1/services/roster/service.mjs`: `contactCreate` added to the `writes` set (so it requires `roster.write`, SMC/Admin) and dispatched to `createRosterContact`. Unprivileged staff (`roster.own`) and read-only preview sessions fail closed.
- The operation-probe allowlist loses exactly the F03 entry.

## Scope, merge, secrets

- Diff vs origin/main: exactly 5 files, matching the task record's exact-file allowlist. 377 insertions, 8 deletions.
- `git merge-tree --write-tree --name-only origin/main 4ab3d8c` clean (tree be667c6f), re-checked against current main.
- `git diff --check`: clean. Secrets scan of the diff: clean.
- No SQL migrations, no v0.9 source edits.

## CI at the exact head

- Isolated v1 product run 44618152971: **success at head 4ab3d8c**.
- Node/LORD ("Verify GSiS queue changes"): **no run exists for this head**. The workflow `verify-queue.yml` triggers only on push to `codex/**`, `muse/**`, `claude/**` branches, so `antigravity/**` branches never trigger it. The owner waived this notation difference on 20 Nov 2026 ("review all done by antigravity, ignore difference in notation, i will orchestrate") and will orchestrate the workflow fix/merges. This approval rests on the green product CI at the exact head plus the full local verification below, and the waiver is recorded here rather than hidden.

## Local checks at the exact head

Worktree `wt234-review` at 4ab3d8c, `npm ci` in root and in `v1/`, `TZ=Asia/Singapore`, Playwright Chromium:

- `tests/v1-product-roster-contact-create.mjs`: exit 0, PASS — fail-closed unprivileged denial, invalid mobile 400, Contacts provisional creation + Contacts D1 verification, exact operationId retry recovery, duplicate mobile block, duplicate TTb Name block, similar-name warning and `confirmDistinct: true` creation.
- `tests/v1-product-operation-probe.mjs`: exit 0 — 407 probes, `knownMissing` 23 (was 24; F03 cleared).
- `tests/v1-product-roster-service.mjs`: exit 0, PASS — existing Roster service regressions intact.
- `npm run build`: exit 0, no diff. `node scripts/v1/build.mjs` and `node scripts/v1/verify-build.mjs`: exit 0.

## Findings

None.

## Quality gates

- Q01–Q06 pass at the exact head (bounded scope, Contacts remains identity owner, exact-head product CI green, local checks green). Q07 is this review. Q08 is not applicable — no deployment authorised.
- Hosted/runtime UAT: **Not tested**.
