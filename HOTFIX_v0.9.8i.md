# Install GSiS revision I

Version 0.9.8i builds on H, commit `69e0d74c569dfd7afb44f9e6bdd42968cc0382bf`. Read `SETUP.html` or `SETUP.md` before changing an existing deployment.

## Production installation

Install these three components for the I fixes, in this order:

1. Replace the combined code in the existing Roster Apps Script project with `Roster_Backend_v0.9.8i.gs`. Keep its Script Properties, data IDs and permissions. Save, then choose **Deploy > Manage deployments > pencil > New version > Deploy** for the existing web app URL.
2. Update the existing notification Worker with `Roster_Notification_Worker_v0.9.8i.txt`. Keep its bindings, secrets, routes and existing triggers. Add the audit-only cron `2-57/5 * * * *` in UTC. Preserve `* * * * *` for critical work and `15 18 * * *` for daily cleanup. The audit cron processes at most one pending day per invocation and yields to active notification work.
3. Upload `Roster_Frontend_v0.9.8i.zip` to the existing Roster Pages project using its current deployment method. An outer release ZIP is not a Pages upload.

All 17 supplied suite components have I labels. The other 14 components have matching labels or embedded shared-helper parity and are optional updates for an existing H installation. Their inventory and deployment instructions are in SETUP. Update them only in their existing projects. Use the Operations Worker only where it is already deployed. Keep Google authoritative and retain every current production storage and migration setting.

## What changes

- Confirmed suspended days ignore ordinary workload and capacity when selecting and ranking relief candidates. Assigned or performed relief still contributes to cumulative R under the existing accounting rules. The separate UT automatic employment cap and audited SMC override from H remain.
- When the configured FORM=2 consecutive rule is enabled, an actual adjacent two-period FORM block uses one relief teacher for its covered periods. A genuine single FORM lesson allocates normally. A partial absence inside a real pair does not become a new single lesson. I does not invent lessons, extend coverage or replace an SMC choice.
- Stapler says **Show baseline comparison** and starts with comparison on. Users may turn it off. Missing comparison data leaves the plan and its confirmation intact.
- Daily plaintext allocation audit exports resume at the existing Google `Allocation Audit/YYYY/MM/YYYY-MM-DD.txt` destination. Retained evidence can catch up without allocating staff or sending messages. Verbose logging off remains respected.

## Separate rehearsal package

`GSiS_v0.9.8i_Rehearsal.zip` is a separate optional package. It is not inside the production deployment ZIP and production installation does not activate it. Extract it separately and follow its `REHEARSAL_SETUP.md`. Source maintainers can use [the same guide](docs/v098i/REHEARSAL_SETUP.md).

The rehearsal uses a new Worker with its own D1 and private R2. School Google identity and a server-side administrator allowlist protect every data operation. Notifications are simulated. It supplies no production activation action, production queue consumer, live scheduler, provider credential or Google write capability. Account quotas are still shared. Live Cloudflare provisioning and storage checks remain unperformed because Cloudflare authentication was unavailable during preparation.

## Checks and rollback

Check the archive's `PATCH.json`, `SHA256SUMS.txt` and final `RELEASE_VERIFICATION.json` receipt before installation. Read `VALIDATION.md` for actual I results and the seven inherited H limits. A pending validation field is not a pass. Use sign-in, version labels and read-only System Health checks after installation. Do not create a real absence or send a message to test the upgrade.

For rollback, restore the preserved H backend, notification Worker and Roster frontend deployments. Remove only the I audit cron if H did not have it, and retain the recorded original triggers. Keep all saved evidence, receipts, messages, data and configuration. Code rollback cannot recall a provider submission or undo school records. Rehearsal resources are separate and can remain unused while production is rolled back.

Release preparation does not deploy production code, change cloud settings or send messages. No real keys, staff snapshots or private incident files belong in these archives.
