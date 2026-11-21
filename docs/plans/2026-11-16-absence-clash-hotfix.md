# Received-report recovery, absence clash and WhatsApp menu hotfix on v0.9.9y

Model: Codex. Owner-requested D1/frontend hotfix. The owner waived Claude review for v0.9 hotfixes; build, local tests and CI remain gates. The owner merges and deploys. Nothing in this record claims deployment or live verification.

## Behaviour

Disjoint absence periods save without confirmation. Overlapping periods show the current reports and require acknowledgement before replacing only those reports. Replacement retains superseded rows, instruction history and completed duties. A stale confirmation requires a new review; a lost response uses the existing request receipt. No automatic allocation or publication is added.

The owner also requested the WhatsApp notice and all five public menu actions for every sender. Urgent Message alone requires a unique Contacts roster record; both active and inactive staff/relief-teacher records qualify. Identity is checked again when the urgent text arrives. Unknown or ambiguous numbers cannot submit an urgent message. Existing active duty recipients, rate limits, expiry and duplicate suppression stay in place. This is a D1-path Worker change, not a D1 row edit, Apps Script change or Meta template change.

Received-report recovery: the D1 capture Worker makes a bounded local attempt even when the remote notification wake is accepted or fails. An authorized intake status check also resumes retained captures in that same namespace. This protects intake progress when the background consumer stalls or checks a different namespace. Each attempt uses the original command and the existing atomic claim/receipt protocol; there is no resubmission, namespace migration or direct database repair. Delayed delivery preserves the trusted capture date. An observed applied receipt refreshes a clean Assign Relief view; unsaved work remains protected.

## Package and deployment order

Preserve the current v0.9.9y deployment versions for rollback. The build label stays v0.9.9y; identify this hotfix by its exact source commit and package SHA-256 sums.

1. Update `gsis-roster-notifications` with `gsis-roster-notifications_worker.js` (canonical source: `notification-worker/dashboard-worker.mjs`).
2. Update `gsis-operations` with `gsis-operations_worker.js` (canonical source: `operations-worker/dashboard-worker.mjs`). Both Workers embed the D1 handler and must retain replacement confirmation fields in the durable transport.
3. Publish `Roster_Frontend.zip` to the existing Roster Pages project. It is the canonical `Roster_Frontend_v0.9.9.zip`, with files at the ZIP root and a bundled Pages `_worker.js`. Refresh the browser after publication.

No Apps Script files, Deploy frontend, migrations, secrets, authority flags, bindings, URLs, cron settings or WhatsApp templates change. Keep all existing configuration. The builder does not deploy or run live checks.

## Owner checks

- A second report for disjoint periods saves without a replacement prompt.
- An overlapping report shows the existing date, periods, type and reason. Cancel keeps the old record and the new form draft.
- Confirm replaces only overlapping records. Verify the applied receipt, not merely a received acknowledgement.
- If another edit changes the conflict while the report waits, Review replacement must show the current entries before another confirmation.
- Check completed duties and unrelated reports remain intact. Do not send duplicate test notifications or resubmit a request whose outcome is uncertain; check its receipt.
- Open the received-report list and use **Check status**. Retained queued captures are attempted one at a time; pending lists poll again. Confirm **Absence saved** and the corresponding Absent Teachers entry, rather than treating the initial received acknowledgement as success. If editing relief, finish or retain that draft before refreshing the board. An active lease or retry backoff remains respected.
- The old background timestamps are not proof that the newly applied receipt failed. If scheduled processing still stalls, inspect the notification Worker's invocation outcome and existing bindings separately; this build does not change them. Synthetic evidence reproduces idle from differing backend URLs, but no live configuration mismatch has been asserted or verified.

- For an unknown number, verify the exact unmanned-number notice and five numbered choices. Public links and the General Office contact are available; Urgent Message is denied. For a unique active or inactive staff/relief record, the urgent prompt is available. Do not send a real urgent test message or replay notifications without owner authorization.

## Rollback

Restore the previous matching y versions of both Workers and the Roster Pages deployment. Preserve D1/R2 data and all configuration. Rollback does not undo already confirmed report replacements; use retained history and the normal authorized absence editor for an owner-requested correction. Pending requests and receipts remain retained; inspect outcomes before retrying.

## Evidence

The three new synthetic tests exercise the D1 adapter, actual SQLite-backed D1 intake/receipts and the real report form. They cover disjoint saves, cancellation, atomic replacement, stale confirmation, validation rollback, permissions, queued review and exact replay. The core test also retains completed/unrelated duties and old instructions. No live data, Google reads or provider delivery is used. Exact-head local-suite/CI results and package checksums belong in the final handoff.
