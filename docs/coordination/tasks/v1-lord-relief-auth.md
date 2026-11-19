# v1 LORD relief-teacher restricted session (F15)

- Model: Antigravity
- Status: claimed on branch `antigravity/v1-lord-relief-auth`
- Updated (Asia/Singapore): 20 November 2026
- Base: `origin/main` `7ee2418`
- Coordinator / Merger: GPT
- Reviewer: Muse at the exact PR head
- Owner scope: port `/api/lord/auth/relief` (`F15`) so relief teachers without a GSPS Google Workspace account can open a strictly LORD-scoped, short-lived session restricted to equipment loan and return operations (`reference`, `bookingeligible`, `opensessions`, `session`, `loan`, `return`, `photo-upload`).

## Exact file allowlist

1. `docs/coordination/tasks/v1-lord-relief-auth.md`
2. `v1/services/lord/relief-auth.mjs`
3. `v1/services/lord/service.mjs`
4. `v1/services/lord/model.mjs`
5. `v1/runtime/worker.mjs`
6. `v1/web/shared/client.js`
7. `tests/v1-product/operation-probe-allowlist.json`
8. `tests/v1-product-lord-relief-auth.mjs`

## Security and ownership invariants

- Relief sessions use a dedicated HMAC-SHA256-signed HttpOnly/Secure/SameSite=Lax cookie (`__Host-gsis_lord_relief`, 12-hour TTL, school-bound, domain-separated signing key) with CSRF verification on writes.
- Relief sessions NEVER create a Core staff session (`__Host-gsis_session`) and are rejected (401) by Core, Contacts, Deploy, Roster, Calendar, Venues and Layout.
- Within LORD, relief sessions are strictly restricted to `reference`, `bookingeligible`, `opensessions`, `session`, `loan`, `return` and `photo-upload`. Booking creation/editing/cancellation, `mybookings`, preferences, incidents, REIGN and all OVERLORD admin actions return 403 `CAPABILITY_DENIED`.
- Staff requests carrying `__Host-gsis_session` always authenticate through Core; relief fallback applies only when no Core session token is present.
- Atomic D1 `prepareOperation` / `commitOperation` idempotency and custody/audit attribution (`actorId = "relief:<mobile>"`) remain intact.
- Zero SQL migrations, zero v0.9 source edits, no merge or deployment.
