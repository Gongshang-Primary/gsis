# v1 probe cleanup: remove replaced Contacts, OVERLORD and Calendar legacy callers

- Model: Antigravity
- Status: implemented and locally verified; exact-head CI and Muse review pending
- Updated (Asia/Singapore): 20 November 2026
- Base: `origin/main` `7ee2418`
- Coordinator / Merger: GPT
- Reviewer: Muse at the exact PR head
- Owner scope: remove seven dead/replaced v0.9-only API callers from built v1 frontend assets (`S2/replaced`: Contacts `/kp`, OVERLORD `backgroundpreview`/`backgroundapply`/`backgroundack`; `F14`: Calendar `/calendar-jobs`, `/calendar-changes`, `/calendar-changes/delta`) without modifying v0.9 source files.

## Exact file allowlist

1. `docs/coordination/tasks/v1-probe-replaced-cleanup.md`
2. `scripts/v1/remove-obsolete-callers.mjs`
3. `scripts/v1/build-web.mjs`
4. `tests/v1-product/operation-probe-allowlist.json`
5. `tests/v1-product-obsolete-callers.mjs`

## Boundaries and invariants

- Zero edits to v0.9 production files (`contacts-update/`, `lord-suite/`, `calendar-update/`, etc.) or generated v0.9 outputs (`npm run build` must show zero tracked diff).
- Line numbers in built assets are preserved so remaining dynamic call-site pins in `operation-probe-allowlist.json` stay exact; the two dead `calendar/app.js` lines (`6674`, `6684`) inside the removed legacy Calendar job panel are removed from `dynamicCallSites` along with the seven allowlist entries.
- Contacts access stays routed to Core Admin (`/admin/`); OVERLORD background work stays routed to `GSISV1LordBackground`; Calendar saves stay direct synchronous v1 D1 operations.
- No merge, deployment, live-data access, migration or provider activation.

## Verification evidence (`TZ=Asia/Singapore`)

- `node tests/v1-product-obsolete-callers.mjs`: PASS (fail-closed anchor checks, line-count parity on unmodified v0.9 sources, built asset caller absence, native v1 Calendar `saveYear` + `saveEvent` pass).
- `node tests/v1-product-operation-probe.mjs`: PASS (`knownMissing` reduced from 24 to 17; `unresolvedDynamic` reduced from 15 to 13 with zero stale/unallowed entries).
- `node tests/v1-product-web-browser.mjs`: PASS (all nine built module screens).
- `npm run build` + `git diff --exit-code` on all v0.9 production paths: PASS (zero tracked drift).
- `node scripts/v1/build.mjs` + `node scripts/v1/verify-build.mjs`: PASS (9 services, 9 Wrangler dry-runs, local additive migration upgrade).
- `git diff --check`: PASS.
- Q01–Q06: pass locally; Q07: awaiting exact-head CI and Muse review; Q08: deployment not authorised; hosted UAT, F5 and official T1B-01/T1B-02 remain unchanged.
