# v1-calendar-multi-venue: B-CA02 Calendar room selection

- Status: implemented; focused local verification passed; final regressions, CI and exact-head review pending.
- Owner/model: Codex; coordinator ChatGPT; independent exact-head reviewer Muse (current owner substitution).
- Last updated (Asia/Singapore): 19 November 2026, 06:20.
- Branch: `codex/v1-calendar-multi-venue`.
- Refreshed base: `360853c32ce5f0a07b5e385fea3647fea5c63b6e`.
- Authority: owner-authorised v1 changelog work; coordinator selected the bounded remaining B-CA02 repair. No merge, deployment, migration, live access or provider send.
- Requirements: B03/B-CA02 in `docs/v1/V09_V1_TRACE_LEDGER_2026-11-15.md`, the owner strict/lenient validation rule, and the existing Calendar six-location picker contract. The historical Run B workbook is evidence of a report, not fixture data or permission to read live records.

## Exact four-path scope

1. `v1/services/calendar/service.mjs`
2. `tests/v1-product-calendar-venues.mjs`
3. `tests/v1-product-calendar-venues-browser.mjs`
4. `docs/coordination/tasks/v1-calendar-multi-venue.md`

Calendar owns its event and revision-guarded operation; Venues owns the school-scoped room directory. Validate each selected venue ID instead of comparing the comma-joined field with one ID. Preserve selection order, grouped room labels, custom/free-text location and omitted fields. Bound selections to the existing six-room contract, reject invalid IDs atomically, and preserve provider-failure, capability, impersonation, revision and receipt semantics. A Calendar selection does not reserve a room. The existing cross-service observation-to-commit interval is unchanged; no cross-D1 atomicity is claimed.

No shared builder, native v0.9 source, Venues service, schema, migration, authentication, publication or provider implementation changes. B-CA01/H06 year generation and week-zero semantics, the inherited picker blur/refocus race, archive preview mismatch and F14 legacy Calendar job transport remain separate; this task does not remove or close them.

## Start gates and source evidence

Read root/v1 instructions, workflow, lanes, status, owner directives, deployment and engineering policies. Refreshed main, remote branches and actual open PR files. The only open PR at claim, v0.9 #182 at `57ab791db80c28f647f1ec03aee73e67cc981b90`, has no overlap. The active `v1-venues-physical-register` claim and coordinator-owned Deploy builder work are disjoint from these four paths.

At the refreshed base, `eventMutation` in Calendar checks `catalogue.venues.some(v => v.id === e.VenueID)`. The native `bindCalendarVenuePicker` emits ordered comma-separated IDs from up to six selected chips, with `Location` maintained separately; room labels may themselves contain commas. This rejects two individually valid rooms. Reproduce through synthetic local Workers/D1 before the product edit, then retain that case as a regression. No historical school workbook data will be copied into fixtures.

## Acceptance and verification

- Actual local service/D1: one and multiple current school rooms; six-room bound; selection order and comma-bearing labels; custom-only text; mixed rooms/custom text; save, partial edit, copy and relocate; exact operation replay and stale revision; duplicate, empty, seventh, unknown and foreign-school IDs; capability/impersonation and provider outage; no partial event/year/outbox write on rejection.
- Built native browser: select two room chips, submit through the real local API, reload and reopen with the same IDs/labels. Preserve free text and demonstrate that this changes no Venues booking or occupancy. No shared builder change.
- Use `TZ=Asia/Singapore`. Record meaningful failing proof, focused unchanged Calendar/Venues and boundary regressions, canonical build/no tracked drift, runner discovery, and exact-head required Node/LORD/product CI. Local Worker/browser fixtures are coordinated to avoid resource contention.
- Skill catalog checked; project debugging, ownership and simplicity principles applied. No skill package is claimed executed; no new dependency or abstraction is required.

## Gates, review and release

Claim published to main by non-force update at `1abe47d`; this implementation branch starts there. `eventMutation` now splits and trims only `VenueID`, requires at most six distinct nonempty IDs, checks every ID against the existing authenticated school catalogue and persists the selected order. It neither parses nor rewrites `Location`. No new call, table, dependency or provider behaviour is introduced.

Pre-fix actual nine-Worker/D1 proof at the claim: one current school room saved HTTP 200; two current school rooms returned HTTP 409 `INVALID_VENUE`; exactly one event was durable. `/tmp/gsis-calendar-multi-venue-red.mjs` is a local diagnostic, not a reproducible repository prerequisite; the committed browser test exercises that same real multi-room path and fails against the original service predicate.

Local verification on the implementation working tree based on the claim (the final exact tested commit and CI links are recorded in the PR to avoid self-reference):

- `TZ=Asia/Singapore timeout 45s node tests/v1-product-calendar-venues.mjs` — pass. Actual D1 with injected directory; 1/2/6 ordered IDs, literal labels/custom text, malformed/unknown/foreign IDs, atomic rejection, partial edit, copy/move, stale revision, changed-intent refusal, idempotent replay/restart, capability/impersonation and provider failure.
- `TZ=Asia/Singapore GSIS_BROWSER_EXECUTABLE=/usr/bin/chromium timeout 45s node tests/v1-product-calendar-venues-browser.mjs` — pass. Unchanged native picker, real local Core/Calendar/Venues and D1; two rooms plus custom text save/reload/reopen, comma-bearing labels preserved, foreign-school directory row refused, Venue records/occupancy unchanged. All external requests blocked except a locally served inert Google script.
- `TZ=Asia/Singapore npm run build` — pass, all 18 canonical components; no tracked generated changes. `node --check` for the service and both new tests and `git diff --check` — pass.
- `node scripts/v1/test.mjs --list` and `node tests/run.cjs --list` — both discover the two new programs (135 product / 1,236 canonical Node programs). Discovery is not a full-suite pass.
- Unchanged boundary regressions and final-head CI: pending here; actual outcomes will be recorded in the PR. Full Node/LORD and full product suites have not been run locally for this head. No previously green run is transferred to this repair.

Q01–Q05: pass for this bounded repair, supported by the claim, disjoint inventory and focused negative/recovery evidence. No skill package executed. Q06: focused/build/discovery pass; required regression/CI pending. Q07: independent exact-head review pending. Q08: no merge/deployment authorised. F5 OPEN; official T1B-01/T1B-02 and unperformed hosted/runtime UAT remain **Not tested**.

Rollback is a reviewed code revert. Already stored ordered room IDs and operation/audit history must be retained; no live-data rewrite or reservation rollback is part of this repair. Final evidence and PR head will be recorded here/on the PR before handoff.
