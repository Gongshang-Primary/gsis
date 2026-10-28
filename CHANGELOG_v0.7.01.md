# GSiS v0.7.01 changelog

Baseline: v0.7.00. R01–R20 frozen specification plus authorised R20 amendments and R21.

## Roster follow-up, 15 October 2026

Revised from the supplied v0.7.01 Deployment Ready ZIP.

1. Replace the full top navigation list with breadcrumbs. Place SMC functions first on Home, with Assign Relief first.
2. Open Timetable with a names-only response and no selected timetable. Download the model after an explicit teacher, class, TG, or export choice.
3. Fix Availability mouse selection. Remove its redundant timetable read and retain keyboard controls.
4. Remove Home's eager timetable and absence reads. Omit Calendar, model, and quota work from saved-record views that do not need them.
5. Cache immutable uploaded models and names. Keep authority, current timetable validity, and operational records fresh.
6. Build eligibility context once per query. Remove the duplicate allocation projection and repeated candidate ranking during filtering.
7. Protect new views from older responses. Block stale controls during reload. Preserve identical retry payloads for uncertain saves.
8. Prevent partial read contexts from writing false workload warnings. Preserve unknown R as unknown.
9. Preserve the supplied assets, existing schemas, single-document operational commits, revision checks, and request receipts.

Local checks and limits are recorded in `VALIDATION.md` and `PERFORMANCE_v0.7.01.md`.

## R01

Scoped operational reads, timetable/context reuse and measured local loading checks.

## R02

Breadcrumb navigation and two home columns on mobile. The 15 October follow-up replaces the original hamburger navigation.

## R03

Compact forms, controls and period cells; preserve readable touch targets.

## R04

Single-field searchable teacher selection.

## R05

Immediate local absence-period preview from preloaded timetable; no false saved state.

## R06

No-instructions fast completion without implicitly removing relief demand.

## R07

Normalised identity for consecutive lesson display grouping.

## R08

Single mutual-arrangement matrix, per-period selection, blank free cells and filtered colleagues.

## R09

Period confirmation label: I'm not around during the highlighted periods.

## R10

Visible pending save, idempotent retry, atomic authoritative mutations and reduced redundant work.

## R11

Teacher-scoped relief duties instead of full operational payload.

## R12

Others absence reason with required separate detail.

## R13

Stage diagnostics and service failure isolation.

## R14

Known external teachers separated from maroon Add New action.

## R15

Availability results limited to selected teachers.

## R16

Inline removable light-grey teacher chips.

## R17

Historical weekly R, annual utilisation, maximum-coverage optimiser, fairness/reallocation safeguards, health, alerts and daily scheduling.

## R18

SMC ranked timetable matrix, override reasons, atomic one-click saves, persistent Undo, protected assignments and class combinations.

## R19

SMC operational instruction rules, versioned published snapshots and conditional per-period notices.

## R20

Daily Excel matrix; explicit reason-free No Relief Needed; atomic publication; teacher timetable overlay; acknowledgement and read-only exact instruction history.

## R21

Level/date-range Recess Regression vacancies through ordinary relief flow, priority reuse of recess-duty teachers, publication and selective cancellation.

## WhatsApp v1.2 integration

Per-template positional builders replace the incompatible universal four-field sender. Evening v2 is the sole intended evening route; v1 is retired without fallback. The gateway validates approval and exact contracts before claim/send, resolves current recipient authority, rechecks acknowledgement and publication state, and validates signed incoming/delivery callbacks.

Three definitive delivery attempts occur at initial, +1 and +3 minutes. Uncertain prepared sends require reconciliation, not blind retry. Expired unprepared leases are safely returned to the queue. Full instructions are preserved; over-budget template content fails visibly instead of being silently truncated.

The four-option contact menu, immediate urgent forwarding with sender metadata and explicit recipient exclusions, and per-rule/per-period conditional instructions are included behind configuration/approval gates. Proposed templates are provided as JSON but were not submitted or approved by this release.

## Deliberate release boundaries

No live deployment, school database migration, teacher messages or external staffing activation. No guessed school links or General Office number. A bounded optimiser retains a valid incumbent if its runtime budget is reached; it exposes search/completion diagnostics rather than claiming an unproved optimum. The operational store remains an atomic Drive JSON document; writes are not true per-record Drive patches. See validation and performance notes.
