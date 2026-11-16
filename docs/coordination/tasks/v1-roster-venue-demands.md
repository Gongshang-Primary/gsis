# v1 baseline venue demand preservation — first implementation

Model: Codex. Status: claimed. Coordinator: ChatGPT v1. Reviewer: Muse, exact head (owner role directive `claude/zealous-archimedes-4i2lv1` at `12b06eb43cb0a6f1a6eca7c787b22100c6a57875`). Branch: `codex/v1-roster-venue-demands`. Base: main `30559ad8ceefe8eb79126713d1892ec2a7189b11`. Updated: 16 November 2026.

Authority: owner 16 November work order 3(e), first claim only; `docs/v1/venues/VENUE_ALLOCATION_LIFECYCLE_DESIGN.md` and controlling owner answers in `docs/coordination/review/v1-venue-allocation-design-claude-review.md`, most recent `dc68df083cd905b8527813ee4b89dc9ac2a99c49`. No displacement is authorised. Blank timetable time remains bookable subject to ordinary checks; this package does not change booking admission or coverage policy.

## Exact file scope

1. `docs/coordination/tasks/v1-roster-venue-demands.md`
2. `docs/v1/venues/BASELINE_DEMAND_HANDOFF.md`
3. `v1/services/roster/service.mjs`
4. `v1/services/venues/service.mjs`
5. `tests/v1-product-roster-venue-demands.mjs`

Main, remote heads and open PRs #182/#185/#186/#187 were refreshed. Those files and the active Google connection claim are disjoint. Work starts from this accepted main claim, not another unreviewed implementation.

## Real path proof before editing product code

At main `30559ad`, an actual built Roster browser sent `/upload` to the real local Workers/D1 with synthetic data: two teachers, different class/subject cells, source labels `Synthetic ISH-1A` and `Synthetic ISH-1B`, both explicitly mapped to one physical venue. The upload returned 200, a committed receipt and `occupancyComplete:true`; every affected period in `venues_projection_rows` had one row instead of two. The existing Roster map key is venue/start/end. The non-staged Venues scope projector also deduplicates by those three fields. No hosted read/write was used.

## Bounded change

Preserve distinct lesson demands within the same physical venue/time. Freeze a deterministic source identity from the actual cell's class/TG, group, subject and interval plus physical venue. Identical identified lesson cells repeated across co-teachers count once, with their source labels retained in the immutable Roster projection. If there is no class/TG or group to establish that relationship, retain separate teacher-row identities and explicitly mark their demand evidence unresolved; do not silently merge or claim exact class capacity. No room-name suffix stripping or alias inference: the existing explicit mapping binds each aSc label to the physical venue, including several labels to one venue and one label to several rooms.

The staged projection already retains distinct source IDs and keys per row. Preserve IDs through the non-staged scope projector too. Do not add physical rooms for interchangeable slots. This first package preserves data/provenance for the later two-slot booking model; it does not introduce slot selection, change Boolean booking guards, displace a booking, or claim Layout's future timed-source view is complete. Known ambiguous demand remains unavailable as a capacity proof; later capacity admission must consume that evidence explicitly.

## Acceptance and boundaries

One real built-browser/Worker/D1 regression must first fail on main, then pass with two distinct simultaneous classes; repeated same-lesson co-teacher rows do not double-count; raw split labels remain recoverable; multi-room mapping preserves each physical demand; empty target evidence is retained and flagged; foreign venue, stale revision and unauthorized import still fail. Exact retry/restart retain source identity and do not create another import. Run canonical build, existing Roster mapping/Venues regressions, runner discovery and required exact-head CI; record all omissions. Changed display: existing source lists can retain both class demands; no layout/control removal.

No new migration, shared v0.9 edit, allocation policy, provider operation, live data, deployment or activation. No security guard is weakened. F5 OPEN; official T1B-01/T1B-02 and runtime UAT Not tested. Pending PR and Muse review; no completion claim yet.
