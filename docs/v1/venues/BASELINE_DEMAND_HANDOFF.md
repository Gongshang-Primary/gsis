# Baseline venue demand preservation

Model: Codex. Branch: `codex/v1-roster-venue-demands`. Accepted claim/base: `963ea2dcbd0388286ad4240b58bb6142e761c02f`, following main `30559ad8ceefe8eb79126713d1892ec2a7189b11`. Reviewer: Muse at the exact PR head under the owner's 16 November role decision (`claude/zealous-archimedes-4i2lv1`, `12b06eb43cb0a6f1a6eca7c787b22100c6a57875`).

This is the first bounded implementation under the [venue lifecycle design](VENUE_ALLOCATION_LIFECYCLE_DESIGN.md) and its [controlling owner answers](../../coordination/review/v1-venue-allocation-design-claude-review.md). It preserves source demand; it does not implement the complete two-slot booking policy.

## Demonstrated defect and change

On main `30559ad`, a built Roster browser imported two synthetic teachers with different classes, using two explicitly mapped source room labels for one physical venue. The real local Workers returned a committed receipt and `occupancyComplete:true`. Venues D1 retained only one row for each period: Roster's key was physical venue/start/end. A separate non-staged Venues projector also collapsed distinct source IDs at the same interval.

Roster now derives a deterministic `lesson:` SHA-256 source ID from the physical venue, interval, class/TG, group and subject. Two different classes survive in one venue. Identical identified lesson cells repeated across co-teachers count once. All contributing raw room labels and stable Staff IDs remain in the digest-bound Roster R2 chunk. When both class/TG and group are blank, the source identity also contains the teacher-row identity; the evidence is marked `unresolved` rather than merging equal subject labels into one class.

Mappings remain explicit. `ISH-1A` and `ISH-1B` can map to one physical venue without creating two rooms. No suffix stripping or spelling inference is introduced. One source label mapped to multiple physical rooms produces a distinct demand in each room. Reordering source teacher blocks does not change these source IDs.

The staged Venues table already keeps separate rows. For the older non-staged path, adoption now keeps distinct source IDs too. The physical reservation/fence contract, operation intent digest, SQL budget and scope count retain their previous semantics; source completion compares physical intervals separately from lesson demand. The original security, revision, booking/closure conflict and pending-recovery checks remain in force.

## Evidence contract and limits

`venues_projection_rows` keeps source ID, physical venue and interval; it does **not** copy `sourceLabels`, `lesson`, `staffIds` or `demandEvidence` into new columns. The immutable owner chunk remains recoverable through `roster_projection_chunks` (school, operation, index, artifact key and digest). Tests read and verify that actual chunk after a full local Worker restart. Consumers needing ambiguity/provenance must retrieve that evidence instead of assuming extra fields survived the SQL projector.

The imported cell format has no independent aSc activity UUID. Its class/TG + group + subject tuple identifies the logical lesson used here. Two simultaneous source activities with identical tuples cannot be distinguished by these cells alone. Unlabelled split groups and other ambiguous source content are not proven exact class-capacity evidence. Later capacity admission must address that limit explicitly; this package does not claim that a row count is sufficient to admit a one-slot booking.

Historical immutable projections are not rewritten. A later authorised import/publication uses the corrected projection; an existing committed receipt still returns its original result. There is no data migration or live repair in this package.

Still separate work: capacity units and one-slot/whole-venue choices, the full retained-booking conflict workflow, the uncovered-date notice, and Layout's timed baseline source view. No booking is displaced. Existing Boolean booking admission is unchanged, including its current limitations.

## Verification

- New `tests/v1-product-roster-venue-demands.mjs`: actual built Roster browser → nine Workers → local D1/R2. The two-class assertion first failed on main (one row instead of two), then passed. The test covers distinct classes, co-teacher deduplication, recoverable raw aliases, unresolved empty targets, multi-room mapping, stable IDs across reordered input, exact retry/changed intent, stale revision, foreign room, unauthorized/anonymous access, and restart/lost-response receipt replay without another baseline. A supplementary non-staged handler test uses real D1 with synthetic Core/source replies and proves two adopted IDs plus exact-duplicate deduplication.
- Unchanged Roster baseline mapping, Roster/Venues staging, Venues concurrency/fences, source-fence budget and staged projection regressions are required. The budget regression caught an intermediate change to the fence intent digest; retaining the original physical scope contract fixes that compatibility issue without changing the test.
- Canonical build, runner discovery, exact five-file scope, whitespace and required exact-head CI are recorded in the task/PR. The product runner discovers the new program. Missing or unfinished checks remain pending.

Visible change: existing source data can retain both class demands instead of losing one. No new UI control, screen layout change, booking policy or removed control. No dependency or migration. F5 **OPEN**; official T1B-01/T1B-02 and hosted/runtime UAT **Not tested**. No deployment, provider operation or live data access occurred.
