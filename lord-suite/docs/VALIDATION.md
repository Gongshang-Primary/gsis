> Current release: GSiS Suite v0.9.1. For the Contacts and published Deploy reference bridge, also follow [gsis-integration/SETUP.md](gsis-integration/SETUP.md). Historical function names and provider template names remain compatibility identifiers.

# LORD acceptance before production reliance

Fresh GSiS v0.9.1 results are recorded in the enclosing suite’s `VALIDATION.md`; the steps below are installed acceptance criteria, not a claim that production checks have passed.

Offline verification is automated by `python3 tests/run_all_checks.py` from the extracted full package. Node and Python 3 are required. Google services are simulated. The browser check reports blocked when Chromium is unavailable; that is not a pass. No production transactions were created during release preparation.

Use a separate instance and synthetic people/equipment for these deployment checks:

1. Create the schema from blank workbooks, populate valid reference data and run the self-test; repeat schema setup and confirm no rows change.
2. Place two simultaneous bookings for the same cart/time: one succeeds and the other is rejected; different valid bookings both succeed.
3. Retry a successful booking with the same request ID and confirm there is one booking and one logical result.
4. Collect while another administrator changes accessory requirements; collection should reject the changed booking without creating custody records.
5. Complete a normal return and an issue return, including all photos and declarations; confirm counts and evidence in OVERLORD.
6. Interrupt a response after commit and recover with the original ID; inspect for duplicates before any manual action.
7. Open multiple STARLORD displays; test cold cache, warm cache, an upstream failure, and the shared OVERLORD refresh while ordinary reads are pending.
8. Confirm ordinary reference reads are shared only within an active Worker isolate; an older pending response must not overwrite a newer cache generation. Direct public forceRefresh requests must be rejected.
9. Test queue retry after an acknowledgement failure, email failure, expired task and active lease; inspect the Event Log and maintenance warning.
10. Verify both existing upgrade and clean-install configuration paths, and practise rollback of saved backend source as well as published versions.

Measure before and after with the same date, data volume and client location. Record first display, live refresh and sign-in separately; use Worker Server-Timing and Apps Script logs for attribution. Synthetic operation counts are not seconds and do not establish global concurrent capacity.

A/B/C/E are approved; D remains deferred. Execute the corresponding criteria in `Review/UI_CRITIQUE.md` on real desktop, phone, keyboard and school-display surfaces before calling those revisions accepted.

## Added administrator and WhatsApp acceptance

1. On the test instance, confirm ordinary staff and forged admin identity fields cannot read settings or grant access. Revoke the actor just before a grant; it must fail without changes.
2. Grant a unique Contacts colleague with a valid mobile and explicit agreement. Confirm one admin row and one audit, preserved remarks/role/subject, and working access after verified re-sign-in. Repeat the same grant without duplicating the audit.
3. Edit a reference list, use the sole OVERLORD shared-data command, and verify the three online apps adopt it within about two minutes. Reopen forms to display updated lists; retain unsent quantities and photos. Inject a read failure and ensure the previous generation remains usable.
4. With approved templates and consenting test recipients, trigger overdue and administrative-close cases. Confirm Telegram remains independent, failed recipients do not block others, and accepted-message audits are recorded. Revoke one recipient before delivery; skip them.
5. Interrupt the force-close queue handoff, acceptance audit and queue acknowledgement separately. Check durable intent recovery and ordinary deduplication. Reconcile the documented provider-acceptance/checkpoint crash window; do not assume exactly-once delivery.
6. With all three trolleys on a phone, switch panels, change quantities, attach photos, cancel dialogs and recover a failed submission. Check state retention, one final action, keyboard appearance, safe focus and 44px touch targets. Check OVERLORD at 320, 390, 1024 and 1366px.

Template approval, credentials, Meta account restrictions and real delivery are independent gates. Offline tests do not satisfy them. Do not send test alerts to production recipients without their agreement.
