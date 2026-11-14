# Activated ad hoc relief hotfix on v0.9.9x

Model: Codex. Prepared code only; Claude reviews the exact PR head and builds the release after owner approval. The owner merges and deploys. This is not evidence of deployment or live verification.

## What changes

#38 excluded inactive Contacts even when explicitly activated for relief. The hotfix restores date/period eligibility for search, manual and automatic allocation, shared cover, reports and duty WhatsApp. It keeps Contacts `Active:N`, inactive-without-activation safeguards, allocation constraints and saved-work protections. Publication and explicit Notify remain separate; a queued message is not a delivered message.

## Files and order

1. Assemble the reviewed hotfix with the x release using the coordinator release procedure. Preserve the x label/configuration until the coordinator cuts its successor; do not deploy unrelated source snapshots as a release.
2. Update the mirrored Google code from regenerated `Roster_Backend_v0.9.9.gs` and `Deploy_Backend_v0.9.9.gs` in their existing projects/deployments. `backend/RosterOperations.gs` changed the final delivery guard, and shared domain code is embedded in both backends. Keep existing deployment URLs and role configuration.
3. Update `gsis-roster-notifications` from `notification-worker/dashboard-worker.mjs` and `gsis-operations` from `operations-worker/dashboard-worker.mjs`.
4. Publish the Roster Pages package from `roster-update/public/`, including regenerated domain/allocation/model files and the operations UI. Refresh browser assets before checking.

No cron, binding, authority flag, secret, template or live data changes are required. Preserve all existing values and schedules. Do not enable templates or replay messages as a deployment step. Any reversal of the temporary Contacts workaround is a separate owner action after verification, never part of this code build.

## Owner checks after deployment

- On the needed school date, an inactive Contacts teacher with an existing activation appears in Assign Relief, labelled ad hoc. A free activated period can be assigned; an unactivated date/period cannot.
- Auto-allocate respects existing priority 1, employment limits and protected duties. Check the proposal before publishing; this build does not initiate allocation.
- The daily report includes activated external teachers and retained valid duties have no obsolete inactive warning.
- On the normal publish/Notify workflow, confirm the dated teacher is included, and inspect the delivery result separately. Do not send duplicate test messages. Truly inactive, unactivated staff remain excluded.
- Verify existing absence, report-recipient and administrative permissions still hold.

## Rollback

Restore the matching x backend deployments, both Worker scripts and Pages package together using the recorded previous versions; preserve configuration and data. This restores the known ad hoc regression, so stop automated retries and coordinate the owner's existing temporary workaround. Do not delete assignments, notifications, activation rows or history. Inspect existing receipts before any retry; do not infer delivery from queue admission.

## Testing boundary

Synthetic local and CI tests only. No live D1/Google reads, provider delivery, real staff records, deployment or live smoke checks are part of the builder's verification. Exact test counts, head and CI run are in the PR handoff.
