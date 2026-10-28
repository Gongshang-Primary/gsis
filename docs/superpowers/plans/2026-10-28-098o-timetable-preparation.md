# O timetable preparation and Calendar repair implementation plan

> For agentic workers: use subagent-driven development with independent review.

**Goal:** Prepare verified native timetable snapshots in existing rehearsal Cloudflare storage while Google remains the production authority; complete the separately requested Calendar sync repair.

**Architecture:** Read-only admin exports bracket a 31-day source snapshot. A separate rehearsal Worker stores compressed immutable native parts and dated projections in R2, then commits D1 pointers with compare-and-swap after readback. No production reader or writer changes authority. Calendar repair remains a separately installable component.

**Tech stack:** Apps Script, existing Roster same-origin Worker/session, private R2, D1 transactional batches, Web Crypto, gzip streams, neutral esbuild bundle.

**Spec:** User requests of 28 October 2026 and docs/v098o/TIMETABLE_EXPORT_CONTRACT.md. Live I rehearsal report is user evidence, not proof of native source migration.

## Global constraints

- Google remains authoritative; no ROSTER_EDGE_AUTHORITY changes, ledger migration, cron, provider sends or production cutover.
- Reuse existing rehearsal bindings/markers; new prep-only tables and R2 prefix never mutate the synthetic ledger.
- SG today through today+30 inclusive. Confirmed intended Stapler content remains independent of baseline changes and can stand alone.
- Exclude drafts, absences, private notes, contacts, relief assignments and transport. Admin-only source export and import.
- Server JWKS fetch uses manual redirect and rejects non-OK; browser fetch keeps redirect:error.
- Imported JSON and its final source check are supplied evidence, not cryptographic proof of live Google freshness.
- No cleanup/deletion until the later retention/cutover design is implemented.

## Review focus

- Source changes or SG midnight during bounded multi-request export: reject mixed snapshots.
- Confirmed plan plus newer unconfirmed draft: export only the proven confirmed intended schedule.
- Blob success with failed/competing D1 commit: head unchanged; exact retry recovers committed receipt.
- Corrupt/oversized/unknown-field parts and auth failures: fail closed before pointer movement.
- Pending Calendar mutation for one event: preserve its unknown outcome and skip only that event; report partial progress honestly.

## Tasks

- [x] Backend exporter: red tests for admin gates, strict schema/privacy, confirmations, standalone dates, stable fingerprints; implement manifest/part/check and confirm tests pass.
- [x] Root integration: expose only three read operations; add admin export/download page without Calendar/intake dependencies; browser tests verify no mutation or external upload and source-change abort.
- [x] Rehearsal Worker: red tests for CAS, retry, bounds, R2 verification, native reconstruction, namespace and auth; implement import/read only and confirm tests pass.
- [x] Packaging: deterministic self-contained Worker, additive SQL and setup/rollback guide; test tamper detection and no production capabilities.
- [x] Calendar: preflight missing required headers before provider access; isolate unknown per-event mutations, retain year fences, truthful partial completion; targeted concurrency/native storage tests.
- [x] Independent review and adversarial tests; fix findings, run relevant retained regressions; package committed source, recovery and separate prep build; save deliverables.

## Later authority cutover (not this package)

Fence every baseline/Stapler writer; final delta/source check and single-writer handover; route all consumers with role-specific projections; implement change-driven refresh, SG rollover, protected retention/pruning, asynchronous Google backup and rollback. Calendar parity must be explicitly verified before actual dated baseline authority. A supplied-file comparison is not a freshness proof.
