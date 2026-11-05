# Roster Drive backup and restore drill

Model: Codex. Prepared implementation; not deployed or live verified. The owner decides when to deploy and enable it. Claude reviews the exact PR head.

## Before enabling

1. Deploy the matching Roster backend, Roster Pages and notification Worker builds. Keep existing authority, secrets, bindings and frozen archive pointers. The signed output service uses the existing service secret and Drive/Sheets OAuth scopes.
2. Under the school's GSiS home base, create `01 Live Data/Roster/Backups`. Its parent must be the configured `ROSTER_ROOT_FOLDER_ID`. Restrict this folder to school Admin and the service account. Check inherited access. Do not use a personal account or any frozen archive folder/file.
3. In Admin System Config, enter the home base ID and Backups folder ID. Optionally create `Roster continuity` directly under `01 Live Data/Roster` and enter its Sheet ID. Give SMC read access to this Sheet only. With a blank ID the writer creates that named Sheet; share it and confirm SMC can open it before accepting the setup.
4. Bind `ROSTER_BACKUP_SCRATCH_DB` to a dedicated disposable D1 and `ROSTER_BACKUP_SCRATCH_BUCKET` to its separate R2 bucket on the notification Worker. Do not point either at production. The weekly drill labels this database and resets only the labelled, inactive scratch scopes. All drill outcomes remain in the production ledger.
5. Bind `ROSTER_BACKUP_RESTORE_DB` and `ROSTER_BACKUP_RESTORE_BUCKET` to a second, empty recovery D1/R2 pair when a manual restore is required. It must not be the scratch pair or the production pair. The Admin restore refuses existing operational rows or active scopes; it never resets a target.
6. Turn scheduled backups on. Verify the first full run, continuity Sheet and weekly drill in System Health and `/backup-ledger.html`. Refresh explicitly; the page does not poll. Check a staff account cannot open the ledger or backup folder. Check SMC can open continuity but cannot queue restore.

## Schedule and evidence

A dedicated two-minute Worker timer (`1-59/2 * * * *`, including 02:15 SGT) owns this work, outside the notification/allocation invocation. Restore stages at most 40 parts or evidence/object checks per turn and retains its session for the next timer. The weekly drill resets scratch only at the beginning of a new drill. No browser save performs a Drive call. A 15 minute lease skips concurrent invocations; provider calls stop starting after 12 minutes so the invocation cannot run past its lease. Failed work is retained and retried. Apps Script output calls take no Roster lock and do not open or modify frozen Google records.

Tier 1 runs hourly by captured D1 revision, including deletion tombstones. At 02:15 SGT, a full Tier 1 and Tier 2 snapshot replaces the increment. An overdue full runs at the next available timer invocation. Tier 3 and all private links, tokens and capabilities are excluded, including packed audit evidence and referenced objects. Restricted Tier 1 JSON retains absence reasons. Each tier is gzip JSON; its immutable filename contains its SHA-256. A manifest records each file ID, hash, byte size, count per collection and source revision. Every write is downloaded and verified before the ledger says `verified`.

Backup subfolders are `Backups/YYYY/MM`. All Drive versions and all `gsis_backup_ledger` rows are kept. Only transient captured copies may be cleared after their retained outcome. Full backups also capture audit objects, quiet-mode logs and job-health evidence. R2 recovery day packages are verified and embedded; restore retains them in `gsis_backup_restored_evidence`. Operational caches are rebuilt from restored timetable/register/Stapler records rather than trusting old cache authority keys.

Continuity is rewritten after a committed publication and at 02:15. It contains today plus five verified school days, teacher/period/class/relief/status, a Stapler flag, and quota/done/R%. It excludes absence reasons and medical types. Missing calendar authority fails visibly rather than guessing school dates. A single Sheets batch preserves the last view if the update fails.

System Health warns when no verified increment/full exists, the last capture is over 2 hours old, the last full is over 26 hours old, or two successive runs of a kind fail. SMC/Admin alerts use the existing alert route. Size alerts use the Admin threshold. The ledger filters by kind, date and status and exports all matching rows to CSV.

Transfer bounds are 32 MiB raw and 8 MiB compressed per tier, a 1 MiB manifest, and 128 MiB across a restore chain (maximum 72 manifests). The import machinery also caps a restore at 40 MiB of staged transport, 2,048 parts and 1.9 MB per logical record. Every verified backup preflights a conservative full restore envelope, including the last full Tier 2 budget for increments. Exceeding any bound records failure, never a truncated success. Check actual production size on the first enabled run; raise/split transport only through a reviewed change if needed. RPO target is one hour and RTO target is two hours; the timed manual drill must establish the actual recovery time.

## Verify and drill

Within two weeks of go-live, then each term:

1. Record the latest native D1 Time Travel bookmark. Time Travel remains the first recovery option. Record the incident/drill ID, source revision and selected backup manifest from the ledger.
2. Choose the latest verified full/increment in the Admin ledger and queue **Verify backup**. It reads the whole chain, checks hashes, count manifests, revision continuity, deletion records and every referenced object. If D1 advanced, it records that a current-count comparison is inapplicable, not a false match.
3. Confirm the recovery bindings refer to empty, separate targets. Queue **Restore into empty recovery D1**. The Worker stages R2 objects and D1 records with the existing import machinery, verifies final scope digests and records the result. The target remains `imported`, not active. Retry an unconfirmed queue request with its retained request ID; completed staging parts replay safely.
4. Inspect both target scope digests and record counts, representative absences, relief, entitlement/opening-balance records and independent Stapler days. Confirm the retained evidence table includes cached day packages and audit history. Confirm secrets and `privateLinks` are absent. Nonterminal historical notification/email and outbound inbox rows are marked `archived`, pending peer requests expire, and original statuses remain recorded; restoring cannot replay an uncertain or queued send.
5. For a drill, stop here. Do not route traffic, activate authority, or enable sends. Record elapsed time, selected manifest, source and restored digests, ledger run IDs, test dates and any discrepancy. The weekly automated Sunday 02:15 drill follows the same read/stage/digest checks in the labelled scratch pair.

## Actual recovery activation (separate owner action)

Pause the old production writer and notification Worker before routing any service to the restored pair. Verify Google remains fenced. Rebind Roster Pages and the notification Worker together to the restored D1/R2; retain old bindings and data for reversal. Refresh Contacts/calendar/Deploy references through ownership setup. With notifications and allocation still disabled, use the existing explicit activation action and the restored source digest. For a verified backup restore it checks the existing Google write fence, not a new Google source export. Both target scopes must carry the exact restore digest. Fresh-start archive identity remains preserved, so ordinary mirroring remains off.

Check the restored timetable, absences, published relief, permissions and continuity before allowing edits. Review uncertainty evidence; do not resend archived messages automatically. Re-enable jobs only after the owner accepts the recovery. Record changed bindings, package hashes, activation result and timing in `docs/coordination/DEPLOYMENTS.md`. No activation or binding change is part of this implementation PR.

Rollback before activation means keeping traffic on the old pair and retaining the inactive target. After activation, use the incident recovery procedure; never run two writable Roster authorities. Turning scheduled outputs off stops future scheduled backup/continuity work and retains all prior files and ledger rows.
