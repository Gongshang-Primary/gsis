# Review: PR #188 — Use the helper account for v1 Google integrations

- Reviewer: Muse (owner, 16 Nov: Muse replaces Claude for v1 exact-head review until Claude returns; source `claude/zealous-archimedes-4i2lv1` at `12b06eb`).
- Verdict: **APPROVED at the exact head**.
- Exact head: `8372f7e4d745605ee549f25eca751c2866867977`.
- Base / accepted configuration claim: `30559ad8ceefe8eb79126713d1892ec2a7189b11`.
- CI run: [43803257723](https://github.com/helper-gsps/gsis/actions/runs/43803257723), green, all 5 jobs (4 regression shards + full-suite), at the exact head. Product/package CI [43804680890](https://github.com/helper-gsps/gsis/actions/runs/43804680890) also green at the exact head (full 109-program product suite, canonical build, nine Worker dry-runs, local migration verification, artifact packaging).
- PR: https://github.com/helper-gsps/gsis/pull/188 (Codex, branch `codex/v1-drive-connection-package-1`).
- Task record: `docs/coordination/tasks/v1-drive-connection-package-1.md` (in the PR; reviewer line still names Claude — stale, superseded by the owner's 16 Nov role switch noted in the PR body).

## What it does

Connects the school's existing backend Google integrations primarily as `helper@gsps.edu.sg`, using direct Google APIs and offline OAuth. Core retains the single encrypted refresh credential; existing Drive and Calendar transports obtain short-lived access through Core. Staff still sign in as themselves. No legacy fallback after helper failure. Visible change: one school Google connection card in Global Admin System Health (connect, read-only check, disconnect). No automatic consent, backup activation, Gmail/Sheets, scheduler, orchestrator or generic restore. Additive Core migration `0005_drive_connection.sql` is prepared, not applied to a hosted database.

## Checks run (local worktree at the exact head, TZ=Asia/Singapore, Playwright chromium-1234)

- `npm ci` (repo root and `v1/`): exit 0.
- New server test `tests/v1-product-drive-connection.mjs`: exit 0. "PASS built Workers/D1 consent, encrypted storage, exact replay/concurrency, wrong account/session/state/nonce/scope/root, expiry, current Admin guard, revoked refresh, outages, Calendar reads/writes, Drive export, broker, disconnect and offline restart".
- New browser test `tests/v1-product-drive-connection-browser.mjs`: exit 0. "PASS real built Admin browser → consent → Worker/D1 connection, URL removal, reload, check and disconnect; no browser credentials or provider writes".
- Named regressions, all exit 0: `v1-product-core-identity`, `v1-product-providers`, `v1-product-calendar-provider`, `v1-product-drive-backup`, `v1-product-provider-secret-setup`.
- `npm run build`: exit 0, no generated drift (`git status` clean after build).
- `node scripts/v1/build.mjs`: exit 0.
- `node scripts/v1/verify-build.mjs`: exit 0 after the `v1/` install (see note N1). "PASS real Wrangler LOCAL upgrade from deployed 0001: additive migrations applied once, all five upgrade tables present; no cloud credentials or operations".
- Merge-tree against current main: clean, no conflicts.
- Scope: the diff against the base is exactly the 21 allowlist paths. Zero v0.9 code changes. `git diff --check` clean.
- Secrets scan of the diff: none. The two new secrets (`GOOGLE_HELPER_CLIENT_SECRET`, `GOOGLE_HELPER_WRAP_KEY`) appear only as names in the opt-in upload path and Core-only owner list; no values.
- Read the security core in full: `v1/runtime/google-drive-credential.mjs` (AES-GCM, school+purpose AAD, 32-byte wrap key, strict config validation, token/scope validation, bounded refresh with compare-and-set rotation, reconnect-required on 400/401); `v1/services/core/drive-connection.mjs` (PKCE S256, hashed state, encrypted nonce/verifier, ten-minute expiry, atomic pending→exchanging claim with Admin guard, identity/nonce/audience/domain verification, helper-email and subject pinning, Drive root verification, Admin+revision recheck at durable commit, exact receipt replay, no blind code re-exchange); `v1/migrations/core/0005_drive_connection.sql` (two additive tables, state/status CHECK constraints); `v1/runtime/providers.mjs` (helper route before legacy, Core-only direct broker, other services via authenticated internal path, `supportsAllDrives=true` on Drive uploads); `v1/runtime/drive-backup.mjs` (`verifyDriveRoot` checks folder id, Shared Drive id, not trashed, folder type, `canAddChildren`; redirect manual); `v1/services/calendar/service.mjs` (child jobs retain the original committed decision reference, as pagination already does; Core checks unchanged); `v1/services/core/service.mjs` (internal helper-token route and Admin connection routes); `scripts/v1/build.mjs` (five public helper settings added to the allowlist; secrets rejected); `scripts/v1/provider-secrets.mjs` (both new secrets Core-only); `.github/workflows/v1-deploy.yml` (upload only when `upload_provider_credentials` is true, from GitHub secrets); `v1/web/shared/drive-connection.js` (callback code removed from the URL immediately, kept in memory only for the attempt, consent URL origin/path validated, status shows email+state only).
- Read the contract doc and the owner-directive entry: the 16 Nov owner instruction ("build all google interactions to be primarily through helper@gsps.edu.sg") is recorded in `docs/coordination/OWNER_DIRECTIVES.md` and `docs/v1/core/CENTRAL_GOOGLE_BACKUP_PLAN.md`; no live activation, sharing change or deployment is authorised by it.

## Note

### N1 (informational — local setup, not a PR defect)

`verify-build.mjs` first failed with `Cannot find module 'v1/node_modules/wrangler/bin/wrangler.js'` because the v1 package (`v1/package.json`, wrangler devDependency) needs its own `npm ci`; the root install does not cover it. After `npm ci` in `v1/` the check passed. Future v1 reviews should run the `v1/` install before `verify-build.mjs`.

## Gates (Q01–Q08)

- Q01 Authority and scope: pass. Owner work order 16 Nov item 3(d), package 1 only; 21-path allowlist held; no v0.9 changes.
- Q02 Design and ownership: pass. Core owns the credential and flow state; existing transports and job boundaries reused; rejected alternatives recorded.
- Q03 Security and privacy: pass. No browser token exposure; no plaintext credential in D1, logs, exports or build output; subject pinned; scope set bounded; secrets Core-only and opt-in.
- Q04 Concurrency and recovery: pass. Atomic flow claim, exact replay, concurrent callback observes 503 without aborting the exchange, lost-response recovery by status check + reconnect, rotation compare-and-set, revocation → reconnect-required, outages retryable and never claimed as success.
- Q05 Resources and maintainability: pass. One flow/credential per school; bounded responses; no new dependency (wrangler was already the v1 devDependency); no access-token caching in this package, with hosted measurement still required before activation.
- Q06 Verification: pass. Both new tests and all five named regressions pass locally; exact-head Node/LORD CI and product CI green; build and migration verification pass.
- Q07 Handoff and review: pass. This record; PR names the reviewer; no merge or deployment requested.
- Q08 Release boundary: not applicable. No deployment, credential provisioning, Google consent, backup activation, live data or provider sends; migration not applied to a hosted database; F5 OPEN; T1B-01/T1B-02 and hosted/runtime UAT Not tested. A later approved deployment requires a Core D1 backup and the additive migration. Actual helper OAuth consent, folder adoption and Calendar permissions remain Not tested.

## Release notes

The Global Admin System Health page gains a school Google connection card. Rollback can retain the additive tables; never drop credential/history tables as a rollback shortcut. Loss or rotation of the wrapping key requires controlled reconnection; encrypted backups are not plaintext credential recovery.
