# UAT010: LORD per-booking overdue administrative monitor

Model: Codex. Claimed19 November2026, Asia/Singapore. Reviewer: Muse at the eventual exact head.

- Status: implemented; focused actual Worker/D1 and notification regressions green; exact-head CI/Muse review pending.
- Branch: `codex/v1-lord-overdue-monitor`.
- Base: `184b8d0a52fe215c7d122a247e89e9b0289a44a8`; deployed product predecessor is v1.06 `bd77b27`. Later main changes are documentation/claims.
- Authority: coordinator explicitly assigns UAT010 as a distinct bounded sibling after UAT009, with original booking-end timing, more-than30-minute grace, open physical custody, per-booking durable deduplication and current reference authority. Publish the branch-only claim before edits. No live read/write, migration, configuration/provider activation, main write, merge or deployment.
- References: [UAT010 changelog](../../v1/accelerated-delivery/CHANGELOG_2026-11-15.md), [A18 trace](../../v1/V09_V1_TRACE_LEDGER_2026-11-15.md). v0.9 source `d9d180ced16d32c836a94d67d9cff8d3030eb21d`, `checkAndSendOverdueTelegramAlerts`, `getOverlordOverdueScan_`, `buildOverlordAlert_`, five-minute monitor bucket and30-minute grace.

## Exact four-path scope

1. `docs/coordination/tasks/v1-lord-overdue-monitor.md`
2. `v1/services/lord/jobs.mjs`
3. New `tests/v1-product-lord-overdue-monitor.mjs`
4. Existing `tests/v1-product-lord-notifications.mjs`

`jobs.mjs` changes are limited to existing `enqueueMonitor`/`dispatchMonitor` and their small local timing/custody helpers. Preserve UAT009's disjoint reminder hunks, whose frozen head is `66109e48a6ad414bd3398ac7c0677157cf0078b3`; do not stack or copy that unreviewed branch. No model/service/build/runtime/UI/schema/dependency/template changes. The old notification regression explicitly asserts an hourly Telegram summary with no overdue booking; replace only that superseded expectation with no overdue alert, retaining every existing notification/authority/recipient/uncertainty assertion.

## Contract and failure semantics

Restore the explicit administrative Telegram monitor, not a five-minute count summary. A booking is overdue only when COLLECTED custody remains and the current time is strictly later than its dated booking end plus30minutes. Use the stored period timing for its exclusive end-period predecessor and count remaining devices/accessories. Current scheduler invocation is minutely; gate the scan to the source's five-minute cadence and keep the existing100-row bound fair to due, unnotified bookings.

Each overdue booking has a durable, per-booking Telegram outbox identity independent of subsequent partial-return revisions. Duplicate scans, restarts and accepted/uncertain provider outcomes cannot send it twice. Do not manufacture provider success or retry uncertainty. Old hourly summary rows remain recorded and are withdrawn before dispatch; no automatic deletion. A queued per-booking alert must recheck its exact booking, current open custody, booking-end/grace and current admin-reference decision immediately before sending. Changed/returned/closed/withdrawn bookings suppress. Current configuration withdrawal, revoked reference authority and missing timings fail closed. Preserve sender/scheduler ownership and all provider receipt rules.

The18:00 administrative closure still runs first and does not invent a physical return; do not rewrite closure, incidents or custody. Do not add overdue WhatsApp behavior, new recipients, consent/settings, provider credentials or sender activation. Keep the current owner-supplied Telegram chat and explicit reference-refresh authority. Return/collection teacher reminder policy remains UAT009.

## Acceptance and checks

Reproduce the overdue-versus-hourly defect against the actual built Core/Contacts/LORD Workers and synthetic owning D1 before product edits. Test before/at/after30-minute grace, five-minute scan gate, wrong dates/periods, resources/accessories and zero custody, partial returns/revisions, old queued summary withdrawal, changed/closed/declared/returned bookings, authority/config withdrawal, provider ownership, accepted/uncertain evidence, concurrent/repeated scans and actual restart. Use synthetic provider interception only; real delivery/hosted cron behavior remains Not tested.

Use real native reference/settings/booking/collection where practical; exact-clock supplements may exercise the same monitor functions over real owning D1, without a new product clock hook. Keep45-second per-program limits, `TZ=Asia/Singapore`, and coordinate a runtime slot (Calendar/#212 priority on slot2, coordinator's exact-head test before slot1). Run unchanged relevant LORD regressions, canonical build/no generated drift, v1 build, syntax/scope/whitespace and exact-head CI. A draft PR follows required green CI; no merge/deploy.

Q01 scope/authority claimed; Q02 existing domain/outbox/reference ownership preserved; Q03 current admin/provider boundary unchanged; Q04 durable identity/uncertainty retained; Q05 bounded fair scan; Q06 actual red/green, synthetic provider/outbox/restart, canonical build and scope verified; required exact-head CI pending. Q07 exact-head Muse review pending; Q08 release not authorised. Root/v1 instructions, workflow, skill policy and relevant source behavior were read; domain-boundary/recovery/red-green principles applied manually, no external skill executed or copied. Hosted UAT, real delivery, T1B-01/T1B-02 and N-1 remain **Not tested**; F5 **OPEN**.

## Implementation and local evidence

- Claim `82f9c30445e0d99e5881c9f84261ef9f13e3b1c4` was published before product/test edits. Actual built-Worker/D1 red took11.094s: one hourly summary was created without open or overdue custody, expected zero. Evidence `/tmp/gsis-lord-overdue-red.log`.
- Enqueue now scans once per five-minute bucket, filters strict booking-end+30-minute grace and remaining resource/accessory custody before the100-row limit, and uses one durable Telegram identity per booking. Existing `lord_job_marks`, system admission/receipt machinery and outbox are reused, with no schema or provider change. Concurrent mark uncertainty is reported pending rather than claimed complete.
- Final dispatch verifies current reference authority/configuration and current COLLECTED custody, grace and the frozen booking end. Partial-return revisions may update remaining quantities without producing another alert; a changed booking end withdraws its old captured alert. Returned/declared/closed/empty custody suppresses. Historical hourly jobs are retained and withdrawn before sending. Accepted/uncertain sends and all recorded attempts remain; this repair does not automatically revive a previously withdrawn/failed alert.
- Actual built/native/photo-backed collection plus owning-D1 clock/provider/restart program passed17.093s under45s (`/tmp/gsis-lord-overdue-green2.log`). It proves no-summary behavior, native overdue/18:00 handling, strict grace, five-minute cadence, a101-booking non-due prefix, physical accessories, current details, final authority/config/owner checks, changed/returned/empty custody, old summary withdrawal, concurrent identity and durable accepted/uncertain evidence after actual Worker restart. Direct provider cases use intercepted synthetic Telegram responses; they do not claim real delivery.
- The first expanded green attempt failed before booking because the synthetic borrower fixture omitted the email required by the existing LORD booking contract. The fixture was corrected by supplying an accepted synthetic email; no validation was weakened. Evidence `/tmp/gsis-lord-overdue-green.log`,8.964s. The separate meaningful product red remains unchanged.
- Existing LORD notifications program passed5.913s (`/tmp/gsis-lord-overdue-notifications.log`). Only its superseded hourly-summary assertion changed; current recipients, permissions, consent, uncertainty and restart assertions remain. Canonical build18/no generated drift, v1 build9/375, syntax/scope/whitespace pass. Further unchanged programs and required exact-head checks remain for CI; no local full-suite pass is claimed.
- Changed deployment component: LORD Worker only. Visible change: explicit per-booking overdue Telegram alerts replace the periodic count summary; no frontend control or overdue WhatsApp behavior is added. UAT009 remains independently frozen at `66109e4` and is not included here. No activation/configuration/live-data action. Rollback restores code while preserving owner custody/outbox/provider history; accepted sends are not reversed or replayed.
