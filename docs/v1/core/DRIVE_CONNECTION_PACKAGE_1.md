# School Google connection — package 1

Model: Codex. Branch: `codex/v1-drive-connection-package-1`. Accepted scope/configuration claim: `30559ad8ceefe8eb79126713d1892ec2a7189b11`, based on main after #183/#184. Review: **Muse at the exact head**, under the owner directive on `claude/zealous-archimedes-4i2lv1` at `12b06eb43cb0a6f1a6eca7c787b22100c6a57875`. No activation or deployment.

## Contract and ownership

This implements the account connection in the [approved direct Drive plan](CENTRAL_GOOGLE_BACKUP_PLAN.md) plus the owner's 16 November instruction to make **helper@gsps.edu.sg** primary for existing backend Google interactions. It is a Workspace user, not an IAM service-account JSON key. Existing Google sharing is owner-reported and is not independently verified here.

| Caller | Credential route | Unchanged owner responsibilities |
| --- | --- | --- |
| Eight owner backup adapters, Deploy/Roster exports and verification, Calendar exports | Existing direct Drive transports → Core helper token broker → Google Drive API | Dataset identity, school boundary, durable file IDs, scheduling, conditional writes and result verification |
| Calendar event reads and sync writes | Existing Calendar transport → Core helper token broker → Calendar API | Current user/queued-job authority, target calendar, event identity, revision/tombstone and notification deduplication |
| Staff Google sign-in | Existing personal Google identity verification | Each staff member signs in as themselves; helper confers no application role |

Core alone retains the encrypted refresh token in its D1. The wrapping key and OAuth client secret are Core-only Worker secret bindings. Trusted owner Workers receive a short-lived bearer over the existing authenticated internal Core service path; the public gateway refuses that path. The bearer carries the helper account's consented scopes, not separately downscoped per-Worker Google ACLs. Existing shared-secret service trust remains the boundary. No credential is returned to the browser, serialized into human-readable exports, or put into build output. A technical encrypted D1 snapshot can contain ciphertext; it must never contain the wrapping key or plaintext tokens.

`GOOGLE_HELPER_ENABLED=true` selects helper before any legacy credential. Missing, revoked, mismatched or unavailable helper authorization fails without legacy fallback. Without the explicit setting, existing legacy behavior is retained. No default or hosted setting is changed. There are no existing Gmail/Sheets automation callers to migrate in this package; no new capability is introduced.

## Consent, storage and recovery

The new System Health card offers connect, read-only check and disconnect. Start requires the current Global Admin, a normal non-preview session, CSRF, school and connection revision. Google consent uses authorization code, PKCE S256, state, nonce, the configured HTTPS callback and offline access. Consent must return the configured helper email, a verified signed identity with the expected audience/domain/nonce, and both approved scopes. The initial stable Google subject remains pinned across reconnects, including after disconnect; a recreated account with the same email cannot silently replace it.

Core checks the registered root's exact folder/Shared Drive IDs and `canAddChildren`. A folder URL does not grant Drive access. Drive requests use Shared Drive support parameters. Consent exchanges and Drive verification reject redirects rather than forwarding credentials to a new endpoint.

`pending → exchanging → completed/failed/cancelled` is a single bounded flow per school, expiring after ten minutes. State is bound to the initiating actor/session, configuration digest and connection revision. AES-GCM authenticates school and purpose; refresh credentials and pending PKCE/nonce are encrypted separately. On completion, Core rechecks current Admin access and revision inside the same D1 batch as the connection, operation receipt and audit. There is no cross-D1 transaction claim.

Exact completed retries return the original receipt. A concurrent callback observes an unresolved result (503) and does not abort the request already exchanging the one-use code. A crash/timeout after code consumption requires checking status and, if no committed connection exists, cancelling/reconnecting; it never blindly exchanges the code again. Failed reconnects preserve the prior connected credential. Disconnect clears the local ciphertext and cancels pending consent; it does not revoke the account's other Google applications. Browser callback code is removed from the URL immediately and kept in memory only for the attempt.

Refresh failures distinguish transient provider outage from reconnection required. Refresh rotation uses a compare-and-set against the current credential. The server rechecks connection state/revision before returning a bearer. This package uses bounded refresh calls rather than persistent access-token caching; external call volume/latency still needs hosted measurement before activation.

Calendar integration testing also found that expanded sync children inherited a renewed job decision instead of the original committed request reference. They now retain that original reference, as pagination already does. Core still rechecks the original receipt/intent and current capability for each child. No security check is removed. The existing direct Drive upload path now explicitly supports Shared Drives.

## Browser-only configuration, later

All setup can be done through GitHub, Google and Cloudflare web interfaces. No school-machine CLI is required. Do not perform it merely because this code is merged.

| Location | Value | Purpose |
| --- | --- | --- |
| Protected GitHub environment `gsis-v1-owner-approved`: secret `GOOGLE_HELPER_CLIENT_SECRET` | Google OAuth web client secret | Core code exchange only |
| Same environment: secret `GOOGLE_HELPER_WRAP_KEY` | Independently generated 32 random bytes, base64url without padding (43 characters) | Core encryption; keep separate from `GSIS_SECRET` |
| `GSIS_V1_SCHOOL_CONFIG.settings.GOOGLE_HELPER_CLIENT_ID` | Approved web client ID | Consent audience |
| `.GOOGLE_HELPER_EMAIL` | `helper@gsps.edu.sg` | Expected dedicated user |
| `.GOOGLE_HELPER_ROOT_ID` | Approved root folder ID | Fixed private destination |
| `.GOOGLE_HELPER_DRIVE_ID` | Actual Shared Drive ID, not assumed equal to the folder ID | Destination ownership check |
| `.GOOGLE_HELPER_ENABLED` | String `true` only when separately approved | Select helper credential route |

Use the existing protected, owner-triggered deployment's optional credential upload to send the two secrets **only to Core**. The builder accepts these five public settings, rejects secret settings, and does not embed secret values. Upload remains opt-in and does not change sender, webhook, scheduler or backup ownership. Preserve the separate v1 `GSIS_SECRET`.

The OAuth web client must allow `PUBLIC_ORIGIN + /admin/` as its redirect (the approved v1 site is `https://gsis.gsps.edu.sg/admin/`). The helper account must consent to `openid`, `email`, `drive.file` and `calendar.events`. Actual school OAuth policy, durable offline consent and the configured staff/parent calendar permissions require the approved browser setup. Do not infer permission merely from a successful sign-in.

**Drive setup gate:** retain `drive.file`. Existing folders/historical files must have been adopted through a supported app authorization path. Pasting an ID or existing helper ACL does not accomplish that. This package verifies and refuses inaccessible destinations; it does not implement a Picker/adoption flow or broaden to full Drive access. An unmet adoption requirement is separate bounded setup work before activation. No permission, sharing or retention decision is changed.

## Evidence and release boundary

The two new test programs drive built Workers and local D1; the browser test also drives the actual built Admin UI. All Google responses/signing keys/accounts/files/events are synthetic, and unexpected outbound routes are rejected. Coverage includes current identity/role/CSRF/school, wrong account/subject/state/nonce/scope/destination, expiry, concurrent/lost-response recovery, restart, encrypted storage, refresh outage/revocation, real Calendar reads and queued writes, and direct Drive exports. Existing identity, provider, Calendar, backup and secret-isolation regressions remain required. Commands and final exact-head CI are recorded in the PR/task; absent evidence is pending.

An additive `v1/migrations/core/0005_drive_connection.sql` is required on a future approved deployment. Take the Core D1 backup first alongside the deployment checklist's other owner snapshots. Do not run a migration, consent, activation, provider write or deployment in this task. Rollback can retain the additive tables; never drop credential/history tables as a rollback shortcut. Loss/rotation of the wrapping key requires controlled reconnection; encrypted backups are not plaintext credential recovery.

Visible changes: one Global Admin System Health connection card; no staff sign-in or application layout change. No backup orchestrator, scheduler activation, generic restore, Drive pruning or Gmail/Sheets integration. F5 **OPEN**; T1B-01/T1B-02 and hosted/runtime UAT **Not tested**. Synthetic delivery does not prove school permissions, Google conditional-write behavior, real folder adoption, live Calendar behavior or hosted recovery.
