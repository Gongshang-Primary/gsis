# v1-venues-physical-register: B-V01 physical register administration

- Status: claimed, before product edits.
- Owner/model: Codex; coordinator ChatGPT; independent exact-head reviewer Muse (current owner substitution).
- Branch: `codex/v1-venues-physical-register`.
- Refreshed baseline: `bd77b27deab417afce859cd80465d7c608ae0ab2`, GitHub main read on 18 November 2026.
- Authority: owner-authorised v1 work queue; coordinator selected the bounded missing physical-register frontend and import path. No merge, deployment, migration, live access or provider send.
- Requirements: Run B B-V01 and PAR-06; `docs/v1/venues/VENUE_ALLOCATION_LIFECYCLE_DESIGN.md` at `25b6687` and its owner clarifications in `docs/coordination/review/v1-venue-allocation-design-claude-review.md`. This claim does not implement split slots, timetable adoption, uncovered-date booking or retained-conflict policy.

## Exact eight-path scope

1. `v1/services/venues/service.mjs`
2. `v1/services/venues/register.mjs`
3. `v1/web/shared/venues-register.js`
4. `scripts/v1/build-web.mjs`
5. `tests/v1-product-venues-register.mjs`
6. `tests/v1-product-venues-register-ui.mjs`
7. `docs/coordination/tasks/v1-venues-physical-register.md`
8. `docs/v1/venues/PHYSICAL_REGISTER_HANDOFF.md`

Reuse the existing guarded `importVenues` and `saveRoomMetadata` operations and bounded canonical Excel codec. Add physical rooms, edit physical metadata and preview/confirm a canonical Excel register. Preserve stable school-scoped IDs, explicit aliases, unknown seating capacity, existing policy/owners, bookings and immutable occupancy. Partial metadata changes must not replace unrelated fields or create permissions. No competing store, default authority, new parser/dependency, original v0.9 source edit or database migration. The builder's changes are confined to Venues injection/adaptation, separate from the coordinator's concurrent Deploy/Department hunk.

## Start gates and pre-change evidence

Root/v1 instructions, workflow, lanes, status, owner directives, engineering policy, approved venue design and owner/reviewer clarifications were read. GitHub main agrees with origin/main at the baseline above. The actual file inventory of the only currently open PR, v0.9 #182 at `57ab791db80c28f647f1ec03aee73e67cc981b90`, has no overlap with the eight claimed paths. Existing Venue navigation/Deploy metadata fixes and #189 distinct-demand preservation are merged; their tests are not evidence for this repair.

Real local nine-Worker/D1 synthetic probe at the baseline: admin `/read` has no `register` property, hiding the existing physical metadata editor; `importVenues` with `capacity:null` returns HTTP400 `INVALID_VENUE`; zero rooms are stored. No live data or provider was contacted. The service's old replacement loop also resets omitted existing policy/metadata fields to defaults. Validate preservation and revision guards rather than adding a browser over that unsafe replacement behavior.

## Acceptance and verification plan

- Built browser: empty register Add room; unknown capacity stays null; canonical Excel export/template and preview/confirm; edit existing physical fields; readable validation; no write before confirmation; stable operation/receipt recovery; admin-only and read-only preview boundaries; narrow viewport and account-change clearing.
- Actual local Worker/D1: create/update with exact revisions; duplicate/invalid IDs and capacities, wrong school, missing capability, impersonation, stale preview and changed intent reject atomically; omitted policy/aliases/owners/occupancy survive; exact retry/restart produces one intended durable change. Template/import metadata binds school and schema; no inferred identity or deletion-by-omission.
- Regressions: unchanged Venues, navigation, staged source, source-fence budget, notifications/receipts and Roster/Deploy catalogue consumers; canonical build without tracked drift, runner discovery, required full Node/LORD and product CI at the final exact head.
- Record commands, failures, exclusions and final SHAs in the handoff. F5 OPEN; T1B-01/T1B-02 and unperformed hosted/runtime UAT Not tested.

## Release boundary

Code rollback is a reviewed revert; preserve already created stable room IDs and their audit/receipt history. No deletion, migration or live rollback is part of this task. The approved future venue design is not claimed complete by this register repair.
