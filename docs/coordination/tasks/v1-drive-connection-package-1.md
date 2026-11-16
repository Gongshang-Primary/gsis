# v1 Drive backup package 1: helper-account connection

- Status: implemented; full-suite/CI and independent review pending.
- Owner/model: Codex. Coordinator: ChatGPT v1. Independent reviewer: Muse at the exact head (owner role switch 16 November).
- Updated: 16 November 2026, 11:45 SGT.
- Branch: `codex/v1-drive-connection-package-1`.
- Base: main `dc68df083cd905b8527813ee4b89dc9ac2a99c49` (C-1 claim and latest venue owner clarification; reviewed #183 merged at `056e003fc5da4c770fa14c80073ec82f296e5b33`).
- Authority: owner work order of 16 November item 3(d), package 1 only; approved #184 design at `720fe385adaabde05fe2908c0fcf2968a3861d90`, merged `5386513881734c8b9177896b9a89bb19ae42324f`; owner answers on main `ccab5f75f55f6310748ee2167b58566c4ca53e30`.

## Exact file allowlist

1. `docs/coordination/tasks/v1-drive-connection-package-1.md`
2. `docs/v1/core/DRIVE_CONNECTION_PACKAGE_1.md`
3. `v1/migrations/core/0005_drive_connection.sql`
4. `v1/services/core/drive-connection.mjs`
5. `v1/services/core/service.mjs`
6. `v1/runtime/google-drive-credential.mjs`
7. `v1/runtime/providers.mjs`
8. `v1/runtime/drive-backup.mjs`
9. `v1/web/shared/admin.js`
10. `v1/web/shared/drive-connection.js`
11. `scripts/v1/dev.mjs`
12. `tests/v1-product-drive-connection.mjs`
13. `tests/v1-product-drive-connection-browser.mjs`
14. `tests/v1-product/drive-connection-fixtures.mjs`
15. `v1/runtime/operations.mjs`
16. `v1/services/calendar/service.mjs`
17. `docs/coordination/OWNER_DIRECTIVES.md`
18. `docs/v1/core/CENTRAL_GOOGLE_BACKUP_PLAN.md`
19. `scripts/v1/build.mjs`
20. `scripts/v1/provider-secrets.mjs`
21. `.github/workflows/v1-deploy.yml`

The remaining open PR #182 is v0.9; #183 is now merged at its reviewed head `cca9f2146f382c97468f9bb8621eb8492ec1a2d3`. The quiet-mode implementation, C-1 ambiguity correction and deployment-checklist branch have disjoint actual files. The first claim push was rejected because Claude recorded #183 approval on main; no force push was used, and the unpublished claim was reapplied to refreshed main before acceptance. This branch starts from main, not #183 or another unreviewed implementation. Current claims and all remote heads were refreshed before this claim.

## Contract sketch

The Global Admin Toolbox's System Health page offers Connect Google Drive backups. Current Global Admin access and session/CSRF checks govern start, complete and disconnect. Google consent is for the configured helper Workspace user, never a service-account impersonation. The browser receives only the consent URL and redacted connection status. Google returns an ephemeral authorization code to the Admin page; the page removes it from the address and submits it to Core with the original state and current session. Core exchanges it using PKCE and the server client secret, verifies the signed Google identity/nonce/audience/domain and expected helper email, verifies the configured private Shared Drive destination, and records the stable subject. Future reconnects cannot silently bind another subject with the same email.

Core owns the credential and flow state in its own D1. A dedicated Worker secret encrypts the refresh token and pending PKCE/nonce using AES-GCM with school and purpose bound as authenticated data. Client secret, wrapping key and plaintext refresh token never reach public config, backups, logs or browser storage; technical Core snapshots can retain encrypted ciphertext. Only one pending flow per school; flows expire after ten minutes. Operation identities, connection revision and an atomic flow-state guard govern retries/concurrency. A consumed code with an unknown exchange outcome requires reconnection, not blind replay. Completed retries return the recorded result without another exchange.

The existing direct Drive adapter remains the sole file transport. The owner subsequently directed all backend Google interactions to use helper@gsps.edu.sg primarily, including Calendar. Extend the connection to the existing Drive and Calendar scopes, with Core retaining the sole encrypted refresh token. Trusted owner Workers obtain short-lived access through the existing authenticated internal Core service path; no token is returned to a browser. Existing service-account configuration remains an explicit inactive/legacy mode, never a fallback after helper refresh failure. This reuses the existing shared-secret service trust boundary; it does not claim separate Google permissions per Worker. Revoked refresh tokens yield a reconnect-required status; provider outages remain retryable and never claim connection/file success. Re-check current Admin authority at durable connection commit, after external calls.

Alternative rejected: a browser-managed access token expires and exposes a backend credential. Alternative rejected: copying the helper refresh token into all owner Workers multiplies secret holders and conflicts with Core coordination. Existing non-helper integrations remain unchanged. No generic backup orchestrator, restore endpoint, scheduler, owner data conversion or new Drive writer is included.

## Verification and limits

Real built browser and Workers with local D1; synthetic Google signing keys, token and Drive endpoints only. Tests cover wrong/revoked actor/session/school, callback state/nonce/account/destination, expiry, replay/changed intent, concurrent completion, restart, lost response, encrypted storage, redaction, token refresh/revocation/provider failure and no automatic backup activation. Preserve existing backup/identity/authority tests; canonical build, discovery, full product and required Node/LORD exact-head CI remain mandatory. No schema change is applied to a hosted database.

Visible addition: a school Google connection/status card in Global Admin System Health, with no automatic consent or activation. Default configuration remains unconnected. The owner sets Google app, account and folder permissions; Claude will guide that separate browser setup. `drive.file` is not widened. Actual helper authorization, Shared Drive permission, conditional-write behavior and runtime UAT remain Not tested.

Pstack architect/how principles applied from cloud `c12/architect` and `c12/how`, plus design-space/subtraction guidance: inspected current Core session/admission flow, `providers.mjs` token acquisition, direct `drive-backup.mjs` and Admin health. No skill source vendored. Q01–Q08 evidence will be recorded in the package handoff and PR.

## Handoff

Implementation is on this branch, pending the required exact-head CI and Muse review. No deployment, credential provisioning, Drive activation, live reads/writes or real provider sends. Ordinary owner writes remain independent of Drive. F5 OPEN; T1B-01/T1B-02 and hosted/runtime UAT Not tested.

## Owner scope clarification before implementation

16 November: "build all google interactions to be primarily through helper@gsps.edu.sg"; existing Google resource permissions are owner-reported, not independently checked. The inventory finds Calendar event reads/writes and Drive backup/export/receipt reads in the existing backend. Staff Google sign-in and public signing-key/font fetches are not automation and keep their existing identity behavior. Add the primary helper credential route and configuration detection for these existing callers in this package; no new Gmail/Sheets/provider capability, scheduler, file orchestration or live setup. Activation requires an explicit helper-mode setting and connection; no hosted variable or credential is changed here. Record the owner rule in the two listed policy/design documents. This bounded expansion was made before product editing and is authorised by the new owner instruction.

## Configuration path refinement before editing those paths

16 November: the existing builder rejects unknown settings, and the protected deployment workflow only uploads an explicit secret allowlist. Add the five non-secret helper settings to the builder and the two Core-only OAuth/wrapping secrets to the existing opt-in upload path. This makes the authorised connection deployable through the existing browser workflow; defaults, required-reviewer protection, ownership and activation switches remain unchanged. No hosted setting is touched. Open PRs #182 and #185 and the other current claims do not own these three paths. Tests in the existing claimed package cover configuration acceptance and secret isolation. The bounded scope is now the 21 exact paths above.

## Integrated Calendar caller correction

The real built Calendar sync test reached a durable queued child but stopped with `JOB_EXECUTION_UNCONFIRMED` before any provider request: `expandSyncYear` put its renewed job-authority decision in a child whose operation ID still names the original committed request. Core correctly rejects that receipt binding (the renewed descriptor is not the original request). Within the already claimed Calendar service path, preserve the original decision reference on child jobs, just as pagination already does. Keep Core's current capability, receipt and intent checks unchanged. This is necessary to demonstrate the authorised existing Calendar writer with helper credentials; no new Calendar function or weaker check is introduced.

Reviewer update: owner 16 Nov names Muse, replacing Claude until Claude returns; directive on `claude/zealous-archimedes-4i2lv1` at `12b06eb43cb0a6f1a6eca7c787b22100c6a57875`. GPT coordinates/merges; Codex builds. No deployment authority.

## Verification checkpoint

- Q01 Pass: 21 changed paths exactly match this claim; open #182 (v0.9), #185 (quiet mode), #186 (C-1) and #187 (checklist) have disjoint files. Owner Google identity request and latest Muse role directive are recorded above.
- Q02 Pass: Core-owned encrypted credential, finite consent states, existing owner transports and durable receipt/job boundaries are described in `docs/v1/core/DRIVE_CONNECTION_PACKAGE_1.md`.
- Q03/Q04 Pass locally: `TZ=Asia/Singapore node tests/v1-product-drive-connection.mjs` drives the real built Workers/local D1, signed synthetic Google identity and direct provider paths. It covers wrong identity/subject/domain-related verification, nonce/state/session/school, missing scopes/offline credential, destination identity, expiry, revoked Admin at commit, concurrent callbacks, operation replay/changed intent, unknown exchange, encrypted-storage tampering, rotation, outage/revocation, exact lost-response recovery after full Worker restart, and offline broker refresh with every staff session revoked. Real queued Calendar sync and Drive export succeed through helper; settled jobs do not resend. Previous Core schema upgrades additively without losing a saved account. Public configuration accepts only the five non-secret settings.
- Q05 Pass locally: one flow/credential per school; ten-minute consent; bounded token/identity/provider responses and calls; existing provider/job bounds retained; no new dependency. Pstack usage and rejected alternatives are recorded above. Access-token refresh is not cached in this first package; measure real volume/latency before activation.
- Q06 Pass focused, full checks pending: `TZ=Asia/Singapore GSIS_BROWSER_EXECUTABLE=/usr/bin/chromium node tests/v1-product-drive-connection-browser.mjs` passes the actual built Admin browser → Worker → D1 path, synthetic consent, query-code removal, check/reload/disconnect and browser redaction. Existing `v1-product-core-identity.mjs`, `v1-product-providers.mjs`, `v1-product-calendar-provider.mjs`, `v1-product-drive-backup.mjs`, `v1-product-provider-secret-setup.mjs` pass unchanged. `TZ=Asia/Singapore npm run build` builds all 18 canonical components without tracked drift. Discovery: 109 product / 1210 Node programs, including both new tests. Syntax, whitespace, relative links and exact scope pass. Full product run is in progress; required exact-head Node/LORD and PR product CI will be linked in the PR.
- Q07 Pending: Muse reviews the exact final PR head; each later code change requires a new-head review. Owner sees the connection card as the visible addition. The original claim's Claude references are historical.
- Q08 Deployment not performed: migration/Google consent/setup/activation remain separate. F5 OPEN; T1B-01/T1B-02 and hosted/runtime UAT Not tested. The private root's `drive.file` adoption and real helper ACL/Calendar permissions are not established by these synthetic tests.

Failures found and fixed before handoff: Workers rejects Fetch redirect mode `error` (use manual and reject status); a losing concurrent callback's 409 let the generic operation handler abort the winning callback (unresolved exchange is now 503, no duplicate exchange); expanded Calendar jobs referenced a renewed decision instead of the original committed request (retain the original reference without weakening Core checks). Synthetic test teardown also needed one disposal per restarted Worker runtime. All focused tests pass after those corrections.
