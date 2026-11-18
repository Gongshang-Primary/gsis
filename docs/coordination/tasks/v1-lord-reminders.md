# UAT009: LORD five-minute collection and return reminders

Model: Codex. Claimed 19 November 2026, Asia/Singapore. Reviewer: Muse at the eventual exact head.

- Status: bounded implementation locally green; exact-head CI and Muse review pending.
- Branch: `codex/v1-lord-reminders`.
- Base: `1abe47d039befd685a02c03ef8116278a12a2711`; product predecessor is deployed v1.06 `bd77b27deab417afce859cd80465d7c608ae0ab2`. Later base commits are claims/documentation.
- Authority: owner requested the v0.9 behavior; coordinator now explicitly assigns UAT009's bounded five-path repair, synthetic provider safety and legacy-job eligibility/replay. Publish this claim before editing. No main merge, deployment, provider activation, configuration change or live-data action.
- Evidence: [UAT009/A18](../../v1/V09_V1_TRACE_LEDGER_2026-11-15.md), [the dated changelog](../../v1/accelerated-delivery/CHANGELOG_2026-11-15.md). v0.9 reference `d9d180ced16d32c836a94d67d9cff8d3030eb21d`, `lord-suite/Source/backend/Code.gs` functions `teacherMessageEligible_`, `scheduleTeacherWhatsApp_`, `deliverTeacherWhatsApp_`.
- Active-work boundaries: Dept integration remains a separate frozen branch/CI; Calendar/Core/Venues/F07 synthetic fixtures own the current local slots. Coordinate a fixture slot before this test runs. Existing LORD cart-group behavior remains unchanged; UAT010 overdue administration/monitoring is explicitly separate.

## Exact five-path scope

1. `docs/coordination/tasks/v1-lord-reminders.md`
2. `v1/services/lord/model.mjs`
3. `v1/services/lord/jobs.mjs`
4. `v1/services/lord/service.mjs`
5. New `tests/v1-product-lord-reminders.mjs`

Use the existing model module for a shared pure reminder-window/eligibility policy; no new UI, builder patch, dependency, workflow, schema or provider-template migration. Preserve existing template keys and parameter contracts. Keep the settings write authority/revision contract and original setting values; honor explicit reminder disablement without treating an omitted optional field as a clear or enabling a provider.

## Contract and known current gap

Collection reminders apply only to an uncollected BOOKED booking in `[start−5 minutes, start)`. Return reminders apply only to genuinely open COLLECTED custody in `[end−5 minutes, end)`, with remaining resources/accessories. Recheck the same current eligibility, period window, reminder setting and booking identity immediately before dispatch. Cancelled, returned, declared-returned, closed, changed or expired jobs suppress without provider calls. The source's later collection/return follow-ups and UAT010 admin overdue monitor remain separate.

Current v1 schedules collection at start−15 minutes, teacher overdue at end+30 minutes, and a separate return job at fixed16:00. The stored `reminders` setting has no scheduling/dispatch consumer. `notificationIntent` currently checks state/revision/reference/consent without the five-minute window. Prove an actual built Worker/D1 failure before correcting this path.

Keep one scheduling contract for collection/return and handle legacy fixed-time/late jobs at send time. Preserve existing outbox rows, frozen request identities, accepted/uncertain sends and provider receipt history. Exact replay, duplicate scheduling, state changes and restart must not duplicate reminders. Keep bounded scheduling fair to eligible bookings; a non-due prefix must not hide a due booking. No automatic retry of an uncertain send and no new live provider/template assumptions.

Preserve final Core permission/current Contacts recipient checks, school agreement/preferences, sender/scheduler ownership, rate limits, channel-specific outbox states, physical custody quantities,18:00 administrative closure and audit. Do not replace UAT010's hourly summary with a five-minute summary under this task. No real provider calls.

## Acceptance and verification

The new test uses the real built Core/LORD/Contacts Worker and owning D1 route for native settings/booking actions and the existing local-only scheduler trigger, with synthetic data and sending disabled or safely stubbed. Supplemental exact synthetic-clock cases may drive existing policy/service functions over actual local D1, but do not replace built-Worker proof. No new test clock hook in product/runtime/build paths.

Cover collection/return lower and upper bounds; explicit disabled settings and a setting change while queued; wrong date/state/changed booking/closed custody/returned accessories; legacy fixed16:00 and late overdue jobs; duplicate calls and stable identity across partial return; obsolete/replayed old jobs; queued/dispatching/accepted/uncertain evidence; restart; fresh authority/recipient revocation; exact existing template choice and parameters. Preserve existing LORD notification/recovery/declaration/reference/cart regressions. Keep45-second program limits and synthetic provider interception.

Run `TZ=Asia/Singapore`, canonical build/no tracked drift, v1 build, syntax/scope checks and required exact-head Node/LORD/product CI. Coordinate heavy fixtures; no dependency installation. Report actual tests and omissions. Open a separate draft for Muse after the required gates; no merge or deployment. Hosted UAT, real delivery and provider timing remain **Not tested**; F5 **OPEN**.

Q01: exact branch claim precedes edits. Q02–Q05: one shared eligibility rule, existing native owner/receipt/provider boundaries. Q06: actual built-Worker red/green, real D1 exact-clock supplements, restart, canonical build and scoped syntax pass; exact-head CI pending. Q07: Muse exact-head review pending. Q08 not applicable to release. Repository boundary/recovery/red-green principles applied manually; no external skill invoked or copied.

## Reproduction, implementation and local verification

- Published claim `d969eaf7751a2abd1a7ec570473911329ea7b33d` preceded all product/test edits.
- Actual nine-Worker/D1 scheduler reproduction failed in 10.310s: collection starting ten minutes ahead produced two reminder channel jobs instead of zero. Evidence `/tmp/gsis-lord-reminders-red.log`; the fixture closed and its runtime slot was released. No provider credentials or sends.
- One shared five-minute eligibility policy now gates enqueue and each final notification check. The existing writable `reminders.enabled` flag is honored (missing retains the scheduler default; false/legacy0 disables). Native collection no longer adds a fixed16:00 return job. The due query filters windows, open custody and existing work before its bounded100 rows.
- Immutable queued reminder payloads bind phase/window and original booking revision; scheduler identities also include the reminder-setting and period-timing revisions. Exact accepted/uncertain evidence in the same window blocks duplicate scheduling across partial-return revisions; existing outbox/provider rows are retained. Legacy fixed-time/overdue rows are rechecked before sending. No new template key, schema, frontend control, owner switch, provider configuration or UAT010 monitor change.
- New synthetic fixture drives native settings, booking, scheduler, queued setting revocation and photo-backed collection on actual built Workers. Supplemental precise clocks use those same owning D1 tables and exported scheduler/service functions, including due filtering beyond100 non-due bookings, physical accessories, old jobs, concurrency and restart. First green passed all three groups in16.476s under the unchanged45s ceiling: actual built scheduling/queued revocation/native collection, precise real-D1 policy/scheduling supplements, and real Worker restart. Evidence `/tmp/gsis-lord-reminders-green.log`. No hosted UAT or real delivery is claimed.

- Canonical `TZ=Asia/Singapore npm run build`:18 components, no generated drift. `node scripts/v1/build.mjs`:9 services/375 artifacts. Syntax and whitespace pass. Only the five claimed paths changed. No dependency/workflow/schema changes or dry-run deployment was needed for this service-only contract repair.
- Unchanged local LORD programs `v1-product-lord`, `-notifications` and `-recovery` passed before the source push, including final Core/Contacts revocation, uncertainty and restart. Declarations/reference/cart-group checks were running sequentially when this bounded head was queued; their later actual outcomes belong in the PR handoff. Further required CI remains pending.
- Changed deploy component: LORD Worker. No frontend assets or visible control changes. The user-visible behavior is the corrected five-minute collection/return reminder timing and honoring explicit disablement; no additional notification template or automatic provider activation. UAT010 administrative overdue monitoring stays open/separate.
- Rollback restores the prior code. Existing outbox rows and provider evidence remain; accepted/uncertain sends are never replayed automatically. New reminder rows carry their frozen phase/window, while legacy rows receive the current eligibility check at dispatch. Local acceptance does not establish hosted scheduler frequency, approved provider template readiness or real delivery timing. Hosted UAT, real sends and provider timing remain **Not tested**; F5 **OPEN**.
