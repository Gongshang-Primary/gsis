# v1-calendar-year-structure: B-CA01/H06 generation and Week 0

- Status: claimed before product edits.
- Owner/model: Codex; coordinator ChatGPT; independent exact-head reviewer Muse (owner substitution).
- Last updated (Asia/Singapore): 19 November 2026, 06:23.
- Branch: `codex/v1-calendar-year-structure`.
- Refreshed base: `1abe47d039befd685a02c03ef8116278a12a2711`.
- Authority: approved v1 changelog work; coordinator explicitly authorized this bounded follow-up after synthetic proof. No merge, deployment, migration, live data or sync/provider jobs.

## Exact five-path scope

1. `v1/services/calendar/service.mjs`
2. `scripts/v1/build-web.mjs` — Calendar copied-source adaptations only
3. `tests/v1-product-calendar-year-structure.mjs`
4. `tests/v1-product-calendar-year-structure-browser.mjs`
5. `docs/coordination/tasks/v1-calendar-year-structure.md`

Read root/v1 instructions, workflow, lanes, current claims, owner directives and engineering policies; refreshed main/PRs. Calendar service generation/date/metadata-token functions and Calendar builder hunk are explicitly assigned by the coordinator. PR213 `4f959c5e2fde2bc0ce06701c85b96226683faaf4` remains frozen and separate; its `eventMutation` hunk is untouched. Deploy and Venues builder hunks remain with their implementers. v0.9 PR182 does not overlap these five paths.

## Controlling contract and failing evidence

B-CA01/H06 in `docs/v1/V09_V1_TRACE_LEDGER_2026-11-15.md` remains open. Native `calendar-backend/Code.gs` generator creates optional opening W0 before the first Monday, exactly ten full Monday–Sunday weeks per term and four explicit vacations. It leaves gaps; literal rejection is a required week's start at/after its following vacation. W0 is metadata only;40 regular week events plus four vacation events are materialised. Monday January1 has no W0. Native source is a read-only reference, not a production writer to import.

Pre-change synthetic actual local Calendar/D1 proof at PR213 (generator identical to base):2027 gives46 structures/0 events, Jan1=W1, Jan4=W2, Nov22–26=W11. Extracted native functions with synthetic Sheets adapters give45 structures/44 events, Jan1–3=W0, Jan4=W1 and no Nov22–26 term week;2024 Monday January1 gives44/44 with no W0. Current mutation measured74 logical local D1 statements, largest batch59, with synthetic admission. This is not a hosted invocation measurement. Proof is local `/tmp/gsis-calendar-year-structure-proof.mjs`; committed tests will independently reproduce the behavior using only synthetic dates/data.

Week0 parity and school-day classification differ: native positive weeks alone have odd/even parity; v1 currently assigns even to0. Correct zero rendering and parity without making a released weekday W0 a closure. Preserve the existing independent v1 school-day predicate, explicit weekend/holiday behavior and access checks.

## Ownership, guards and bounded writes

Calendar owns all affected rows and the operation receipt. Build a validated date/event plan; record owner-created structure/event provenance in existing Calendar metadata and the committed generation receipt. No new store or migration. Rerun changes only proven generator-owned rows; retain IDs, custom labels, visibility, parent fields and unrelated fields. Imported/manual rows and marker-like descriptions are not proof of generator ownership. Reject unmanaged overlapping term/vacation structures or conflicting marker identities atomically, rather than adopting, deleting or overwriting them. If a proven generated event's dates were independently edited, retain that edit and reject regeneration until explicitly resolved.

Bind the existing opaque structure token to the owning year revision and complete generation snapshot. Commit-time set equality/revision guards prevent changed/inserted/deleted source rows, event edits, source pins or active dispatch locks from being overwritten. Reuse the existing year update so `protectCalendarChanges` retains admission/source protection. Keep original operation identity and immutable publications.

Use bounded set-based D1 guards/writes for metadata/events, one year revision, audit and receipt in one owner transaction. Do not add per-event API calls. Measure full invocation, bind/payload and batch bounds, targeting at most50 logical D1 statements including real authority/source guards. No sync outbox job, provider call, publication, sender activation or cross-D1 atomicity claim. A saved internal event is not an externally delivered Calendar event.

## Verification and acceptance

- Actual local D1/Worker:2027 optional W0, exactly40 regular weeks/four vacations/44 events, full W10 and deliberate gap; Monday-start and leap/date boundaries; invalid/too-early/overlapping/out-of-year inputs leave every affected row/audit/receipt unchanged.
- Built unchanged-native UI with bounded v1 adaptation: Year Setup submits the actual owner contract, displays receipt-backed counts, Events/Weekly/exports show numeric0 and correct labels; progress does not fabricate44 delivered events. No legacy F14 job transport.
- Regeneration preserves unmanaged/manual/imported rows and labels, owned IDs/visibility/parent settings and immutable publications. Test conflicting markers, altered owned dates, stale form, concurrent event/year/structure insertion/deletion, held source pins and dispatch locks. No new outbox/provider job.
- Lost response/restart/original operation replay yields one intended effect; changed intent rejects. Inject atomic write failure. Measure first generation and rerun through real Worker/D1 boundaries, including source/admission costs and retained manual content.
- Run focused unchanged Calendar/Core/Contacts/Roster date-consumer regressions, canonical build/no tracked drift, runner discovery and required exact-head Node/LORD/product CI before review. Use `TZ=Asia/Singapore`; report actual failures/omissions. No skill package is claimed executed.

Q01/Q02 claim/design recorded; Q03–Q07 pending implementation and verification. Q08 deployment not authorized. F5 OPEN; official T1B-01/T1B-02 and unperformed hosted/runtime UAT **Not tested**. Rollback is a reviewed code revert preserving saved records, generator provenance and operation/audit history; no data deletion or migration rollback is authorized.
