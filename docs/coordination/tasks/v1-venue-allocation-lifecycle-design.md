# v1-venue-allocation-lifecycle-design

- Status: claimed; documentation and read-only investigation. Five owner answers and the aSc pipeline correction received; no implementation claim.
- Owner/model: Codex. Coordinator: ChatGPT v1. Independent reviewer: Claude, exact document head.
- Updated: 16 November 2026, 10:46 Asia/Singapore.
- Initial refreshed main: `d84a38ce907e7866f9331003ef4f26bb5a08851f`. Expected-head check detected an intervening documentation-only review update before any claim commit. Inspected it and fast-forwarded to claim base `47b2d2c5da3d2cbb551259b44e2aa7536a2f79f9`.
- Branch after the accepted claim: `codex/v1-venue-allocation-lifecycle-design`.
- Owner instruction: specify the split-timetable-room and Deploy/Venues/Layout allocation lifecycle in a Markdown document **on main**, asking genuine workflow/policy questions. This authorises this design record on main, not implementation, unrelated merges, deployment, migration or live-data operations.

## Exact documentation scope

1. `docs/coordination/tasks/v1-venue-allocation-lifecycle-design.md`
2. `docs/v1/venues/VENUE_ALLOCATION_LIFECYCLE_DESIGN.md`

Publish this task record alone as the claim using a non-force expected-head main update; start the documentation branch from the accepted claim. The owner's direct-main documentation instruction is the scoped exception to the normal implementation PR route. Preserve existing specifications as history and state any new supersession explicitly in the new design. Do not change `OWNER_DIRECTIVES.md`, owned by open PR183.

## Refreshed scope and evidence

Fetched main and all remote heads; read root/v1 instructions, coordination, engineering policy and relevant source/reviews. Actual open-PR file inventories were checked: PR182 `592fac9982b8935b1d14b8bbff500a1af78aa2c7` (v0.9 absence hotfix), PR183 `9d6db12edf510a34a19516e901e9fb9531b703e4` (Roster workload copy), PR184 `720fe385adaabde05fe2908c0fcf2968a3861d90` (direct Drive backup design). Neither claimed path overlaps them. Existing venue-publication/import implementation claims are not reopened. Main's latest addition is Claude's Contacts/backup review; it changes documentation only.

Read-only source scope: `v1/services/deploy/service.mjs`, `v1/services/roster/service.mjs`, `v1/services/venues/domain.mjs`, `v1/services/venues/service.mjs`, `v1/services/venues/projection.mjs`, `v1/services/layout/publication.mjs`, `shared/venues.js`, relevant v0.9 frontend aliases and accelerated-delivery requirements. Static source findings are not behavioural test results.

## Deliverable and acceptance

Record the owner's confirmed version ownership and local-copy rules, split labels versus physical rooms, dated occupancy provenance, immutable publication and app-owned overlay boundaries. Separate engineering recommendations from unresolved owner choices. Preserve current identity, capability, revision, audit and recovery safeguards. Do not claim atomic transactions across D1 databases or fabricate occupancy from a planning-room reference.

Owner answers: ISH-1A/B are two interchangeable class slots in one physical venue; offer one-slot and whole-venue bookings, default whole; Deploy publication replaces its allocation set immediately for all dates; retain existing bookings and flag new conflicts; baseline import updates Venues/Layout immediately. The owner then clarified that Deploy must not be tightly coupled to Venues: Deploy informs aSc, aSc exports the timetable, and Venues/Roster consume that export. Do not require a matching Deploy publication, attachment to a Deploy draft, or another Publish/Republish to activate an import. Keep planning allocations and imported timed occupancy distinct.

Acceptance checks: exact two-path documentation inventory; relative links; whitespace; confirmed/pending wording; synthetic future acceptance cases; no application/test/build/CI/configuration/generated changes. Record exact commands and outcome after authoring. Build, product/Node/LORD suites, hosted UAT and live recovery are not run by this design task. F5 remains **OPEN**; official T1B-01/T1B-02 and runtime UAT remain **Not tested**.

## Handoff

Claim publication first, then author the design and incorporate owner answers when received. Claude's exact-head design review remains pending. No skill package executed or vendored; apply the repository's ownership, simplicity and evidence principles directly. No product behavior, active claims, provider credentials or live school data are changed.
