# v1-lord-cart-groups: book carts while retaining physical trolley custody

- Status: claimed; implementation pending.
- Owner/model: Codex; coordinator ChatGPT (v1); independent reviewer Claude.
- Last updated (Asia/Singapore): 15 November 2026, 11:14.
- Branch: `codex/v1-lord-cart-groups`.
- Refreshed main: `34543928ad758f01d217573378e0651233e7c376`.
- Implementation parent: frozen ASC fix `5a2affa6a99ac4511644d0b3e01bcae827774dae`, branch `codex/v1-deploy-asc-subject-identity`. Its full CI is running; parent source is frozen.
- Accepted claim SHA, implementation head and PR: pending.
- Owner authority: work through the frontend/data-clone UAT bug queue one bounded group at a time. UAT008 and UAT021–UAT023 require cart-level booking while retaining individual trolley collection and return. Historical migration/live-write instructions in the ledger are evidence, not new permissions.

## Exact eight-path scope

1. `v1/services/lord/model.mjs`
2. `v1/services/lord/service.mjs`
3. `v1/web/shared/client.js`
4. `v1/web/shared/lord-user.js`
5. `tests/v1-product-lord-cart-groups.mjs`
6. `tests/v1-product-lord-cart-groups-browser.mjs`
7. `docs/coordination/tasks/v1-lord-cart-groups.md`
8. `docs/v1/accelerated-delivery/LORD_CART_GROUPS_FIX_2026-11-15.md`

No schema/migration, inventory rewrite, production v0.9 source, builder, shared runtime, Core/Contacts policy, dependency, configuration, provider or generated-output edits. No merge, deployment or live-data operations. Notifications/reminders, REIGN reporting changes and the separate provisional `active:null` Contacts-reference failure are excluded. Generic shared pending-map changes and B-R01 Deploy recovery remain separate. A LORD-specific frozen group-selection adapter is in scope; it must not redesign other modules' recovery.

## Start gates and sequencing

Read root/v1 instructions, coordination workflow, lanes, status, owner directives, deployments, engineering policy and applicable source/specification. The controlling accelerated specification is `f39b671ac6da3f389c58345ce4f5c035f1cb3f65`; current owner decisions take precedence.

ASC is frozen at the exact parent above. Refreshed all remote branches, main, claims, CI and all 25 open PR file inventories. No external branch advanced. Run B remains `8317d8a033b2bae443f2e8cbff79b5c010754435` and Claude review branch remains `58e22a7bf7ba4a49caa2caabe877605153b098db`. None of the actual open PR diffs edits these LORD/client paths. Current root/v1 instructions and ownership records have been read. The coordinator permits this sequential task while frozen predecessors await CI/review; their code will not be edited. The intended same-builder sequential handoff preserves the parent tree. `client.js` is not reserved for B-R01 merely by its read-only proposal; recheck actual claims before editing it. Publish this task alone using the existing non-force expected-head claim exception, re-read claims, create the implementation branch from the frozen parent, and immediately incorporate the accepted claim. Do not edit the frozen parent or take over an overlapping task. Parent changes require child revalidation and exact-head review.

## Evidence and cause

The private uploaded UAT ledger has SHA-256 `c4c0cb8786eced24b5ef3143c7d113369ddaf81dcba8728e27fb0a2a34c5a0f8`. Its normalized public handoff and Run B (`8317d8a033b2bae443f2e8cbff79b5c010754435`, `docs/v1/accelerated-delivery/UAT_RUN_B_2026-11-15.md`) identify the grouping defect. No private names or booking IDs belong in fixtures.

At hosted source `26bbccd229962700409bb6e9c80b1e9bec170d20`, `v1/services/lord/service.mjs` reference() emits one booking resource per physical row; bookingView() uses the first item as the resource label; board() emits one signage row per physical item. bookingInput()/saveBookings()/availability accept physical resource lines rather than a versioned cart selection. The native user editor exposes per-trolley reservation quantities. These relevant LORD paths are unchanged at refreshed main and the frozen ASC parent; prior Contacts client work in the parent is preserved.

Source `lord-suite/Source/backend/Code.gs` lines 6082–6183 defines physical trolleys and derives cart groups, aggregate capacity, consistent device type and accessory flags. Source requested quantity (lines 2916–2922) is distinct from exclusive cart reservation (conflict matching around line 3306). Physical collection records actual trolley quantities and evidence separately. Existing LORD/OVERLORD sorting uses explicit device types: ordinary tablets, iPads, then laptops, followed by natural resource name. Do not infer types from letters or hard-code the reported T–Z, E, A, B sequence.

Read-only investigation used disposable local Worker/D1 probes with synthetic inventory and synthetic LORD reference rows, not live data or a Contacts producer test:

- `TZ=Asia/Singapore node /tmp/gsis-lord-cart-probe.mjs` exited 0, evidence `/tmp/gsis-lord-cart-probe.log`: thirty physical rows form ten carts, but reference returns thirty capacity-14 booking resources; a three-item/42-device booking shows its first trolley ID; cart-name create/availability return 400; quantity 42 against one physical resource returns 409. One BOOKED and one CANCELLED booking retain six physical item rows.
- `TZ=Asia/Singapore node /tmp/gsis-lord-cart-membership-probe.mjs` exited 0, evidence `/tmp/gsis-lord-cart-membership-probe.log`: adding a fourth member to an already-booked three-member cart commits. This establishes the need for inventory-side membership guards too.

Temporary probe paths are preliminary evidence only. Reproduce the failures in the two committed test files before fixing; do not claim those probes satisfy implementation verification or hosted UAT.

## Design and ownership

LORD remains the sole owner of inventory, cart membership, reservations, custody and audit. Derive cart projections from its existing `metadata.cart`; retain all physical resource IDs and existing booking/item/event/photo records. Ungrouped resources remain supported as standalone inventory.

Expose grouped bookingResources with consistent cart names, explicit device type, aggregate capacity and combined accessory options. Keep trolleys physical. Use an explicit group selector and exact member/revision evidence, scoped to school; names are display/selection data, never authority. Derive existing booking display only when its items consistently prove a group, otherwise expose an honest unresolved/multiple-resource state rather than choosing the first item. Reads perform no repair writes.

The owner resolves a selected cart to its complete active member set and reserves each member in one existing D1 transaction. Preserve requested device quantity separately in existing booking details JSON; reserving a capacity-42 cart must not turn a request for 20 into a displayed request for 42. Preserve actual collected/returned quantities and per-trolley evidence. New booking details may retain the versioned group snapshot; existing bookings are not rewritten or relabelled in storage.

At the same commit as booking writes, verify member IDs/revisions, activity and exact set membership, including a negative check for newly added/activated/moved members. Reuse existing resource revision, quantity, buffer, booking revision, authority and receipt guards. Inventory create/update/batch/deactivation must symmetrically protect membership-changing operations while affected carts have BOOKED/COLLECTED reservations. If inventory wins first, stale booking membership fails; if booking wins first, conflicting membership changes fail. No cross-D1 transaction is claimed.

The shared client attaches the exact viewed group evidence once and retains it for the same operation; retry must not silently resolve a different group. The native user editor changes cart-level requested quantity rather than independently shrinking the reserved member set. Server validation rejects incomplete, duplicate, mixed, forged or stale group selections, including direct API requests. Preserve committed replay, unknown outcomes and original operation identities.

Group booking/day/dashboard/STARLORD presentation consistently. Filter signage by its existing physical-resource scope before aggregation; grouping never broadens photo or booking visibility. Collection/return continues to match exact booked physical IDs, quantities, revisions and photo phases. Do not turn cancelled or future reservations into new bookings, replay outbox jobs, or infer a physical return from administrative closure.

Keep existing input/resource/transaction bounds. Test boundary failures explicitly; do not remove limits to accommodate grouping. Add no cart store, generic framework, or duplicate authoritative inventory.

## Acceptance and verification

1. Red/green: actual local Worker/D1 reproduces thirty physical booking resources and rejected cart requests; after repair, thirty physical records produce ten correctly named capacity-42 carts. Also test different member counts/capacities so fixture numbers are not hard-coded.
2. Existing synthetic future and cancelled bookings retain booking IDs, dates, statuses, item IDs/quantities and history. A ledger-shaped fixture includes 29 bookings, five cancelled, and 87 physical items. Reference/day/dashboard reads enqueue nothing.
3. Whole-cart create, batch, update and advisory availability agree. A request for 20 reserves the whole cart but displays 20; full member reservations and actual custody quantities remain distinct. Incomplete, mixed, duplicate, unknown, malformed, inactive and stale selections fail without partial writes.
4. Controlled owning-D1 races cover overlapping cart bookings and membership addition, activation, move, deactivation and batch replacement against a booking. Both winning interleavings must be evidenced; an existing member revision check alone is insufficient.
5. Actual collection and partial return preserve physical IDs, actual quantities, accessories, issues and revision/phase-bound photos. Unknown or unbooked trolley IDs deny. Cancelled/future bookings and other carts remain unchanged.
6. Identical retry, changed-intent conflict, lost response and Worker restart preserve the original operation and group snapshot. A retry never silently adopts newer membership. Terminal/unknown outcomes remain distinct.
7. Borrower/Admin/on-behalf, school isolation, impersonation, revoked capability and signage/photo-scope negatives pass. A token limited to one physical member does not expose the whole cart's private evidence.
8. Built browser evidence covers source cart order/types, booking grid and existing occupancy, cart-level edit, exact trolley selection and return at desktop/narrow widths. No legacy frontend or builder change is expected.
9. Run canonical `npm run build` before tests after branch switch; use `TZ=Asia/Singapore`. Run both focused files, unchanged LORD/service/recovery/declaration/reference/notification/browser regressions, Core/Contacts contracts, runner discovery, full required product and Node/LORD suites, build drift checks and exact-head CI. Record actual commands, counts, failures, omissions, tested SHA and the eight-path inventory.

## Quality, review and handoff

Apply the already selected Pstack root-cause approach; no skill repository or dependency copied. Q01 scope, parent and overlap refresh pass; accepted claim publication must complete before implementation. Q02–Q06 remain pending implementation evidence; Q07 awaits Claude exact-head review; Q08 does not authorise release. Link the implementation evidence in [the handoff](../../v1/accelerated-delivery/LORD_CART_GROUPS_FIX_2026-11-15.md) and PR rather than duplicating stale counts.

Rollback restores old code but cannot erase committed bookings or custody evidence. New details fields are additive; older code may again display first-trolley labels or misleading requested quantities. Do not apply data rollback, delete member rows or rewrite historical bookings. Record any incompatible fallback before release.

No policy question is open in this bounded design. The next action is to publish this claim alone with an expected-main non-force update, re-read it, and immediately merge it into the child before any implementation. Implementation, exact-head Claude review and any separately authorised release remain distinct. F5 stays OPEN; official T1B-01/T1B-02 and unperformed runtime UAT remain Not tested.
