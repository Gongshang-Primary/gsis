# Review: PR #232 — Port LORD relief-teacher restricted session (F15)

- Reviewer: Muse, replacing Claude until Claude returns, per the owner's 16 November directive (source 12b06eb).
- Verdict: **APPROVED at the exact head** `f48884ec`.
- Branch: `antigravity/v1-lord-relief-auth`. Base: main `7ee24189`. PR status: open, MERGEABLE. GPT to merge.
- No deployment authorised.

## What it does

Ports `/api/lord/auth/relief` (F15) so relief teachers without a GSPS Google Workspace account can use LORD for loan/return only:

- New `v1/services/lord/relief-auth.mjs`: validates name (trimmed, non-empty, ≤120 chars) and an 8-digit Singapore mobile (`[689]` prefix, optional `65` country prefix) and issues an HMAC-SHA256-signed `__Host-gsis_lord_relief` cookie (HttpOnly, Secure, SameSite=Lax, 12-hour TTL). The signing key is derived per school (`SHA-256("gsis:lord-relief:v1:${SCHOOL_ID}:${GSIS_SECRET}")`), so the cookie is school-bound and never valid cross-domain. Verification is fail-closed: HMAC verify, `v: 1`, school match, `relief:` subject, name/mobile re-validated, CSRF token present, `exp` finite and in the future. Writes additionally require the `X-CSRF-Token` header, compared with `secretEquals`.
- `v1/services/lord/service.mjs`: `/auth/relief` is a public `lord.relief.auth` descriptor (GET checks the cookie, POST issues or logs out by clearing the cookie). `policy` sets `allowRelief` from `RELIEF_ALLOWED_ACTIONS` (`reference`, `bookingeligible`, `opensessions`, `session`, `loan`, `return`, `photo-upload`). `mutate` re-checks relief scope (403 otherwise) and session expiry (401), writes the admission row directly with the relief `decisionId`/`validUntil`, and records `reliefName`/`reliefMobile` in the audit. `listBookings` defaults relief to today's date. `requireOwner` allows relief only for `collect`, `returnItems`, `savePhoto`, and the `session` view — the four operations a relief teacher performs on another teacher's booking.
- `v1/runtime/worker.mjs`: the relief fallback (`module.authorizeFallback`) runs only when there is no Core session cookie and no `Authorization` header, and only for non-public descriptors — staff carrying `__Host-gsis_session` always authenticate through Core. Only LORD exports `authorizeFallback`.
- `v1/services/lord/model.mjs`: `requireCapability` admits relief only for `lord.read`/`lord.borrow` when `allowRelief` is set and the principal carries `lord.relief`.
- `v1/web/shared/client.js`: wires `/api/auth/relief` (LORD-only, 404 elsewhere), relief session check on reload, CSRF attachment on LORD writes, and logout cookie expiry.
- The operation-probe allowlist loses exactly the F15 entry.

## Scope, merge, secrets

- Diff vs origin/main: exactly 8 files, matching the task record's exact-file allowlist. 775 insertions, 30 deletions.
- `git merge-tree --write-tree --name-only origin/main f48884e` clean (tree cdb266e5), re-checked against current main.
- `git diff --check`: clean. Secrets scan of the diff: clean.
- No SQL migrations, no v0.9 source edits.

## CI at the exact head

- Isolated v1 product run 44617181138: **success at head f48884e**.
- Node/LORD ("Verify GSiS queue changes"): **no run exists for this head**. The workflow `verify-queue.yml` triggers only on push to `codex/**`, `muse/**`, `claude/**` branches, so `antigravity/**` branches never trigger it. The owner waived this notation difference on 20 Nov 2026 ("review all done by antigravity, ignore difference in notation, i will orchestrate") and will orchestrate the workflow fix/merges. This approval rests on the green product CI at the exact head plus the full local verification below, and the waiver is recorded here rather than hidden.

## Local checks at the exact head

Worktree `wt232-review` at f48884e, `npm ci` in root and in `v1/`, `TZ=Asia/Singapore`, Playwright Chromium:

- `tests/v1-product-lord-relief-auth.mjs`: exit 0, PASS — input validation, signed HttpOnly cookie, tampered cookie 401, cross-domain 401, forbidden LORD 403s, CSRF denial (403 `CSRF_INVALID`), relief photo upload + loan + idempotent replay + opensessions + return + audit attribution, logout cookie clear.
- `tests/v1-product-operation-probe.mjs`: exit 0 — 407 probes, `knownMissing` 23 (was 24; F15 cleared).
- `tests/v1-product-lord.mjs`: exit 0, PASS — existing LORD storage/race/return/reminder checks intact.
- `npm run build`: exit 0, no diff. `node scripts/v1/build.mjs` and `node scripts/v1/verify-build.mjs`: exit 0.

## Findings

None. One design note, not a finding: relief `mutate` bypasses the Core `admit`/`resolveAdmission` path and writes the admission row directly (decisionId + validUntil), which is correct because a relief principal carries no Core authority pins; the admission and audit rows are still written.

## Quality gates

- Q01–Q06 pass at the exact head (bounded scope, fail-closed auth, exact-head product CI green, local checks green). Q07 is this review. Q08 is not applicable — no deployment authorised.
- Hosted/runtime UAT: **Not tested**.
