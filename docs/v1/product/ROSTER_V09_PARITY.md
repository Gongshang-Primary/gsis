# Dated ad hoc relief: v0.9 to v1 integration

Source window: **14 November 2026, Asia/Singapore**. Implementation prepared on 15 November. The reviewed source is PR153 at [`39728a23dd5db2bc44a1cac8216caace2dd4c735`](https://github.com/helper-gsps/gsis/commit/39728a23dd5db2bc44a1cac8216caace2dd4c735), merged as [`7c9315124344e204819538697f1369edcc5ace31`](https://github.com/helper-gsps/gsis/commit/7c9315124344e204819538697f1369edcc5ace31). See the [source review](../../coordination/review/adhoc-inactive-hotfix-claude-review.md) and [implementation claim](../../coordination/tasks/v1-roster-v09-adhoc-parity.md). Exact tested implementation head, CI and independent review belong in the PR evidence linked by the claim.

## Behaviour and ownership

An existing Contacts person may be inactive for ordinary school operations but explicitly available for relief on a particular date and set of periods. Contacts owns the permanent Staff ID, employment activity, accepted EO/explicit ad hoc qualification and contact/consent facts. Roster owns the dated activation and its selected periods. An activation changes relief availability; it does not change employment activity, application permissions or authority records.

v1 builds the reviewed shared Roster domain and frontend directly. The remaining adapter discrepancy was that a single-day view changed an activated person's projected `active` to true, while a multi-day view did not. That hid the `(ad hoc)` label and the person from the single-day external-teacher report. It also made final dispatch depend on a fabricated active flag. The adapter now preserves the actual Contacts fact in every context, including a prospective `saveAdhoc` operation.

The v1 predicate requires an existing current Contacts identity, exact permanent Staff ID, accepted `eo=true` or explicit `adhocEligible=true`, and a nondeleted Roster activation for the requested date with valid, nonempty periods. A period-specific check must match one of those periods. Names, tags, aliases and phone numbers cannot establish qualification. This retains v1's accepted-fact boundary; it does not import legacy role inference.

Manual relief, automatic allocation, shared cover, retained-duty reconciliation, current capacity and the weekly outlook use the inherited domain rules and the truthful adapter projection. A missing Contacts identity remains an error rather than being fabricated as inactive. An inactive person stays excluded from ordinary absence reporting and general report recipients. Active staff continue through their existing routes.

## Notification boundary

Only these existing relief message kinds may use dated eligibility: `relief_publication`, `relief_reminder`, `conditional_relief_instruction`, `stapler_timetable`, `mutual_request` and `mutual_override`. General inbox/webhook access, email report recipients, SMC/Admin/sponsor checks and other notification kinds retain their existing active-only requirements.

Before provider dispatch, the service checks the current Contacts identity, qualification and channel consent, the current Roster activation and the current referenced relief content. Positive duties must fit the activated periods. Conditional instructions use the publication resolved by the current-content check, so an old queued P2 reference cannot authorise a newer P3 duty. A source-verified cancellation or peer-override notice can describe a withdrawn arrangement without granting a new duty period; it still needs a current dated activation. Stale or missing references fail closed through existing notification-current checks; deletion, the wrong date, an out-of-period duty or revoked qualification/consent cancels delivery. Existing provider uncertainty and operation identities are preserved. No provider credential, template, webhook or scheduler is activated by this change.

Contacts reads and Roster reads are separate observations. No cross-D1 transaction is claimed: source facts can still change after the final check and before a provider accepts a message. This patch adds no distributed locking or new delivery/recovery protocol.

## Verification and release limits

The new local owner D1/R2 regressions use synthetic Contacts/Calendar/Deploy projections and controlled clocks. They exercise the actual context, allocator snapshots, service dispatch and built browser, rather than treating a helper result as integration proof.

- `tests/v1-product-roster-adhoc-parity.mjs`: truthful single/multi-day activity, report/label parity, explicit qualification, date/period restrictions, manual and automatic relief, capacity/outlook, shared cover, retained duties and missing-identity failures.
- `tests/v1-product-roster-adhoc-delivery.mjs`: all six eligible relief kinds, ordinary active-recipient control, invalid/stale/missing evidence, rechecks during dispatch, non-relief exclusion and synthetic provider call counts.
- `tests/v1-product-roster-adhoc-browser.mjs`: real built Roster UI backed by local owner reads; `(ad hoc)` label, P2 enabled, P3/next-day/deleted activation excluded.
- `tests/v1-product-roster-service.mjs`: the pre-existing activation test now expects actual `active=false` and explicit dated relief evidence, instead of asserting the adapter defect.

Actual command outcomes, failures, runner discovery, canonical build/no tracked drift and full exact-head CI are recorded in the task and PR. The dispatch tests do not send messages to a real provider. No hosted recovery or live school UAT has been performed.

There is no schema change or migration. Rollback reverts these v1 adapter/dispatch changes and their tests without deleting activations, staff records, publications or operation identities. Independent Claude review and owner merge/deployment decisions remain separate. **F5 remains OPEN. Official T1B-01/T1B-02 and unperformed runtime UAT remain Not tested.**
