# v1 Drive backup package 1: helper-account connection

- Status: claimed.
- Owner/model: Codex. Coordinator: ChatGPT v1. Independent reviewer: Claude at the exact head.
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

The remaining open PR #182 is v0.9; #183 is now merged at its reviewed head `cca9f2146f382c97468f9bb8621eb8492ec1a2d3`. The quiet-mode implementation, C-1 ambiguity correction and deployment-checklist branch have disjoint actual files. The first claim push was rejected because Claude recorded #183 approval on main; no force push was used, and the unpublished claim was reapplied to refreshed main before acceptance. This branch starts from main, not #183 or another unreviewed implementation. Current claims and all remote heads were refreshed before this claim.

## Contract sketch

The Global Admin Toolbox's System Health page offers Connect Google Drive backups. Current Global Admin access and session/CSRF checks govern start, complete and disconnect. Google consent is for the configured helper Workspace user, never a service-account impersonation. The browser receives only the consent URL and redacted connection status. Google returns an ephemeral authorization code to the Admin page; the page removes it from the address and submits it to Core with the original state and current session. Core exchanges it using PKCE and the server client secret, verifies the signed Google identity/nonce/audience/domain and expected helper email, verifies the configured private Shared Drive destination, and records the stable subject. Future reconnects cannot silently bind another subject with the same email.

Core owns the credential and flow state in its own D1. A dedicated Worker secret encrypts the refresh token and pending PKCE/nonce using AES-GCM with school and purpose bound as authenticated data. Client secret, wrapping key and refresh token never reach public config, backups, logs or browser storage. Only one pending flow per school; flows expire after ten minutes. Operation identities, connection revision and an atomic flow-state guard govern retries/concurrency. A consumed code with an unknown exchange outcome requires reconnection, not blind replay. Completed retries return the recorded result without another exchange.

The existing direct Drive adapter remains the sole file transport. Extend its credential source only for Core's explicit helper connection; do not distribute refresh tokens to other domains. Keep existing service-account behavior for existing integrations. Revoked refresh tokens yield a reconnect-required status; provider outages remain retryable and never claim connection/file success. Re-check current Admin authority at durable connection commit, after external calls.

Alternative rejected: a browser-managed access token expires and exposes a backend credential. Alternative rejected: copying the helper refresh token into all owner Workers multiplies secret holders and conflicts with Core coordination. Existing non-helper integrations remain unchanged. No generic backup orchestrator, restore endpoint, scheduler, owner data conversion or new Drive writer is included.

## Verification and limits

Real built browser and Workers with local D1; synthetic Google signing keys, token and Drive endpoints only. Tests cover wrong/revoked actor/session/school, callback state/nonce/account/destination, expiry, replay/changed intent, concurrent completion, restart, lost response, encrypted storage, redaction, token refresh/revocation/provider failure and no automatic backup activation. Preserve existing backup/identity/authority tests; canonical build, discovery, full product and required Node/LORD exact-head CI remain mandatory. No schema change is applied to a hosted database.

Visible addition: a connection/status card in Global Admin System Health, with no automatic consent or activation. Default configuration remains unconnected. The owner sets Google app, account and folder permissions; Claude will guide that separate browser setup. `drive.file` is not widened. Actual helper authorization, Shared Drive permission, conditional-write behavior and runtime UAT remain Not tested.

Pstack architect/how principles applied from cloud `c12/architect` and `c12/how`, plus design-space/subtraction guidance: inspected current Core session/admission flow, `providers.mjs` token acquisition, direct `drive-backup.mjs` and Admin health. No skill source vendored. Q01–Q08 evidence will be recorded in the package handoff and PR.

## Handoff

Implementation pending. No merge, deployment, credential provisioning, Drive activation, live reads/writes or provider sends. Ordinary owner writes remain independent of Drive. F5 OPEN; T1B-01/T1B-02 and hosted/runtime UAT Not tested.
