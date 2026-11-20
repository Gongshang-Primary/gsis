# Review: PR #236 — Implement v1 Roster absence-clash confirmation and intake resolution (F06)

- Reviewer: Muse, replacing Claude until Claude returns, per the owner's 16 November directive (source 12b06eb).
- Verdict: **APPROVED at the exact head** `fb8d8351`.
- Branch: `antigravity/v1-roster-absence-clash-confirm`. Base: main `7ee24189`. PR status: open, MERGEABLE. GPT to merge.
- No deployment authorised.

## What it does

Ports the v1 mirror of the Report Absence clash-confirmation policy (v0.9 PR #182's rules, without touching v0.9 or #182), clearing both F06 probe allowances:

- New `v1/services/roster/absence-clash.mjs` (880 lines):
  - Overlap detection: full-day always overlaps; otherwise period overlap (via `Allocation.absencePeriods`) or time-interval overlap. Disjoint same-teacher/date absences save immediately, no confirmation.
  - On overlap, `prepareSaveAbsenceClashCheck` first enforces authorization (SMC/admin, or the teacher's own absence) before exposing conflict details, then probe-validates the replacement against a clone with only the conflicting rows removed — an invalid replacement fails cleanly (400) without prompting or mutating anything. The conflict token is a SHA-256 digest over schema, school, actor, and the conflict summary including each record's revision, so it binds the exact actor/school/proposal/conflict versions; a changed conflict set rejects a stale token with 409 `ABSENCE_CLASH_CHANGED`.
  - Confirmed replacement (`confirmReplace: true` + matching token) soft-deletes only the conflicting absences (`deletedAt`, `supersededByOperationId`, history retained), cancels only affected future unpublished relief (never completed duties, never started periods, never assignments tied to a surviving absence), then applies the new absence through the shared `Operations.apply` with silent resubmission disabled.
  - Durable intake: `intake: true` queues a `needsReview` `absenceIntake` record in `roster_records` (upsert keyed by intake id, so exact retries do not duplicate). `resolveAbsenceIntake` (merge/replace/keep/withdraw; withdraw requires a reason; already-resolved is 409) and `retryAbsenceIntake` (re-derives conflicts and the token at apply time, requeues with a fresh token when the conflict changed, returns the stored result with `alreadyApplied: true` for an applied intake) apply under an intake-row revision guard, so concurrent resolves cannot both apply.
- `v1/services/roster/service.mjs`: the clash check runs before `saveAbsence` preparation (with exact-retry receipt recovery first and a revision check), silent resubmission is disabled on v1 `saveAbsence`, and `resolveAbsenceIntake`/`retryAbsenceIntake` are `ownWrites` (roster.own) dispatched to the new handlers.
- `v1/web/shared/roster-absence-clash.js` + one line in `scripts/v1/build-web.mjs` include the v1 confirmation dialog helper in built Roster HTML; no legacy JS text patches.
- The operation-probe allowlist loses exactly the two F06 entries.

## Scope, merge, secrets

- Diff vs origin/main: exactly 7 files, matching the implementation inventory in the task record's Antigravity section. 1537 insertions, 23 deletions. (The task record's older candidate inventory also listed two extra test files and a handoff doc that were not created; the implemented inventory is what was reviewed.)
- `git merge-tree --write-tree --name-only origin/main fb8d835` clean (tree 188beb98), re-checked against current main.
- `git diff --check`: clean. Secrets scan of the diff: clean.
- No SQL migrations, no v0.9 source edits; PR #182 untouched.

## CI at the exact head

- Isolated v1 product run 44621043246: **success at head fb8d835**.
- Node/LORD ("Verify GSiS queue changes"): **no run exists for this head**. The workflow `verify-queue.yml` triggers only on push to `codex/**`, `muse/**`, `claude/**` branches, so `antigravity/**` branches never trigger it. The owner waived this notation difference on 20 Nov 2026 ("review all done by antigravity, ignore difference in notation, i will orchestrate") and will orchestrate the workflow fix/merges. This approval rests on the green product CI at the exact head plus the full local verification below, and the waiver is recorded here rather than hidden.

## Local checks at the exact head

Worktree `wt236-review` at fb8d835, `npm ci` in root and in `v1/`, `TZ=Asia/Singapore`, Playwright Chromium:

- `tests/v1-product-roster-absence-clash.mjs`: exit 0, PASS — all 9 required acceptance cases (disjoint immediate acceptance; conflict details with no-write cancel; replacement limited to conflicts; invalid replacement leaves old rows intact; changed conflict requires new consent; unauthorized replacement fails; exact retry/concurrent/lost-response single result; queued changed-conflict restart/reconfirmation without duplicate notification; superseded history, completed duties, instruction history and unrelated allocations retained) plus `resolveAbsenceIntake` and `retryAbsenceIntake`.
- `tests/v1-product-operation-probe.mjs`: exit 0 — 407 probes, `knownMissing` 22 (was 24; both F06 entries cleared), 131 parsed scripts.
- `tests/v1-product-roster-service.mjs`: exit 0, PASS — existing Roster service regressions intact.
- `npm run build`: exit 0, no diff. `node scripts/v1/build.mjs` and `node scripts/v1/verify-build.mjs`: exit 0.

## Findings

None. One authorization note, not a finding: `resolveAbsenceIntake`/`retryAbsenceIntake` are `ownWrites`, and the module admits any SMC+ principal (`admin`, `roster.write`, or `roster.read` — the codebase's established SMC marker, also used for manager decisions in `baselineRead`) to resolve any intake, while an ordinary teacher may only replace/withdraw their own. A `roster.own`-only teacher attempting another teacher's replacement is denied (tested, case 6). This matches the absence workflow's SMC authority; the owner can narrow it if read-only SMC should not resolve.

## Quality gates

- Q01–Q06 pass at the exact head (bounded scope, token-bound confirmation, exact-head product CI green, local checks green). Q07 is this review. Q08 is not applicable — no deployment authorised.
- Hosted/runtime UAT: **Not tested**.
