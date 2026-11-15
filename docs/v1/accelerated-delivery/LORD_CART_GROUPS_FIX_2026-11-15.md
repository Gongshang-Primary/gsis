# UAT008 / UAT021–UAT023 — cart booking and physical trolley custody

Model: Codex. Coordinator: ChatGPT (v1). Independent reviewer: Claude at the exact implementation head. [Task and exact eight-path scope](../../coordination/tasks/v1-lord-cart-groups.md).

Status: implemented; focused and regression verification passed. Refreshed main was `34543928ad758f01d217573378e0651233e7c376`; the claim alone was accepted on main at `1db6b686b72a1bf54f0bc935982c2aed6cb4f560`. The parent is frozen ASC repair `5a2affa6a99ac4511644d0b3e01bcae827774dae`, branch `codex/v1-deploy-asc-subject-identity`. The accepted claim was immediately merged into the child before edits at `a205e885a4921cbe895217781084c3597acaf75e`. Clean exact-head full verification, published head, PR and Claude review are pending at this source commit; the PR records the final exact tested head. The published claim-merge tree is checked against the local merge before publication.

## Report and reproduced cause

The supplied UAT ledger reports thirty physical trolleys grouped into ten source carts. Existing future bookings preserve three trolley items per cart, but v1 displays physical IDs as booking resources. Replacing thirty physical records with ten records would destroy custody structure; adding duplicate cart inventory would double-count capacity. Neither is part of this repair.

At hosted source `26bbccd229962700409bb6e9c80b1e9bec170d20`, the owner reference maps each physical inventory row into bookingResources. bookingView labels a booking with its first physical item, and the STARLORD board emits a row per item. Create/availability parse a physical resource ID, so cart labels are not accepted. The native user editor permits independent reservation quantities for physical members. These paths were unchanged at investigation main `57c9223b532d5bf6c84ef6b5ffdb79059a5e3cc1`; the same LORD implementation remains in the frozen parent.

Disposable actual Worker/D1 probes passed as defect reproductions:

| Probe | Observed result |
| --- | --- |
| Thirty synthetic trolley rows, ten metadata.cart groups | Reference returns thirty bookable resources of capacity 14, while retaining thirty trolley references. |
| Existing three-item reservation | Booking displays its first physical ID, with quantity 42. |
| Cart-name create and availability | Both return 400 INVALID_INPUT. |
| Quantity 42 against a physical capacity-14 resource | Returns 409 RESOURCE_CAPACITY. |
| Add a member after a cart booking | Resource write returns 200 committed; the booking has three members while current membership becomes four. |

Commands: `TZ=Asia/Singapore node /tmp/gsis-lord-cart-probe.mjs` and `TZ=Asia/Singapore node /tmp/gsis-lord-cart-membership-probe.mjs`, each exit 0. Logs have the same basenames with `.log`. These fixtures used synthetic LORD reference rows and actual local Workers; they did not verify the Contacts producer, hosted migration or real inventory. Temporary files are preliminary evidence, to be replaced by committed red/green regressions.

## Implemented behavior

LORD owns both the cart projection and physical inventory. Derive groups from its existing metadata, preserving resource IDs, booking IDs, item/event/photo records and quantities. Show grouped booking resources; retain physical trolley references for actual collection and return. Preserve explicit source device types and the existing tablet/iPad/laptop natural ordering; do not hard-code cart letters, ten groups, three members or capacity 42.

A selected cart carries its exact viewed member/revision evidence. The owner resolves and reserves the complete active membership atomically, checks both changed members and unexpected additional members, and uses existing capacity/buffer and authority guards. Membership-changing inventory writes use the corresponding guard against BOOKED/COLLECTED reservations. These are transactions within LORD's D1 database, not cross-D1 atomicity.

Requested quantity is separate from reserved capacity. Source permits a request for 20 while reserving a 42-device cart; physical collection and return may record independently confirmed actual quantities. Preserve the request in booking details and the physical reservation/custody values in their owning records. New booking details retain the selected group snapshot; do not backfill or rewrite historical bookings merely to display them.

Retain the existing 200 limit for each physical resource and requested quantity, and the twenty-member/twenty-booking input limits. Aggregate cart capacity can exceed 200: six capacity-50 members can reserve 300 while the request remains 20. A captured cart name stays part of the historical booking even if those resources move to another cart after cancellation or completion; current membership evidence governs a new edit, not the past label. When old records have no requested-quantity evidence, display that as unknown rather than relabelling reserved capacity as the request.

Existing bookings project a cart only when their physical items consistently support that association. Ambiguous membership is reported honestly rather than selecting the first trolley. Reads do not repair inventory, change statuses or queue messages. Preserve cancelled and future bookings, complete/partial custody, issues, photographs and administrative-closure distinctions.

The LORD-specific client adapter freezes the viewed group evidence for an original operation. Retry cannot silently adopt new membership. The native user editor presents cart-level requested quantity; server enforcement rejects incomplete or mixed membership even through a constructed request. Generic pending-map/Deploy recovery changes remain outside this task.

Booking/day/dashboard/STARLORD views use consistent group labels. Signage applies its existing physical-resource scope before grouping and does not gain access to other members' private booking/photo data. Collection and return continue to identify exact booked trolley IDs and existing revision/phase-bound evidence.

## Scope and remaining limits

The eight-path claim contains the model, owner service, LORD-specific client adaptation, native user editor, two focused tests and two documentation records. No schema, migration, canonical builder, legacy frontend, authoritative cart store, duplicated inventory, configuration or provider change was made.

Notification/reminder behavior, REIGN reporting and the separate reference-refresh rejection of provisional `active:null` staff are excluded. Preserve existing outbox identities; do not replay notifications while verifying migrated bookings. The current REIGN report's physical reserved-device statistics do not become cart-level reporting merely because booking screens are repaired. Do not claim that limitation closed here.

## Verification and exact-head review

All commands below ran with `TZ=Asia/Singapore`; browser commands also used `GSIS_BROWSER_EXECUTABLE=/usr/bin/chromium`, `ROSTER_TEST_CHROMIUM=/usr/bin/chromium` and `LORD_TEST_CHROMIUM=/usr/bin/chromium`. Evidence is synthetic/local, not hosted UAT.

| Command / check | Result before source commit |
| --- | --- |
| `node tests/v1-product-lord-cart-groups.mjs` | 13 groups pass, 16.05 seconds; actual local Worker/D1. |
| `node tests/v1-product-lord-cart-groups-browser.mjs` | 10 groups pass, 14.05 seconds after final formatting and pending-slot fix. One group exercises the native create/edit UI through actual local Workers/D1; failure injection is synthetic transport. |
| Existing `v1-product-lord.mjs`, `v1-product-lord-recovery.mjs`, `v1-product-lord-declarations.mjs`, `v1-product-lord-notifications.mjs`, `v1-product-lord-reference.mjs` | All five unchanged programs pass. |
| Existing `tests/v1-core-*.mjs` and `tests/v1-contacts-*.mjs` | All twelve programs / 56 cases pass. |
| `npm run build` and `git diff --check` | Canonical build passes without tracked generated drift; whitespace passes. |
| `node scripts/v1/test.mjs --list` and `node tests/run.cjs --list` | Both new programs must be discovered; expected complete inventories 80 product and 1,179 Node. Final counts and exact head are recorded in the PR. |
| Clean-head `node scripts/v1/test.mjs`, full Node/LORD and PR product/build CI | Pending publication at this commit. Do not interpret focused results as full-suite completion. Exact commands, source SHA, counts, artifacts and failures are recorded in the PR. |

Committed tests cover thirty physical resources/ten carts and other sizes, 29 historical bookings/five cancellations/87 items without read mutation, full-cart reserve versus request versus actual custody, API/schema negatives, ten controlled membership race schedules, overlapping booking winners, current authorization and school isolation, phase-bound photo access, reply loss, original-operation replay and actual Worker restart. Temporary negative controls removed only the final membership guard and, separately, the reciprocal inventory guard; each made the corresponding expected-409 test fail. No control mutation remains in the branch.

Browser checks cover viewed-vector retention across a reference refresh, exact enriched-wire receipt digest, wrong operation/digest rejection, lost-response reload, bounded storage and terminal-only eviction, concurrent hash preparation, delayed JSON decoding, account/school changes, narrow physical collection and historical unknown quantity. The final local-failure test proves no POST and no new generic pending entry after fresh preparation rejects, while preserving an older unknown entry.

Initial red evidence reproduced the ungrouped reference and missing request group. Two first-pass service failures were fixture defects (availability omitted required class/subject, and a mixed-type negative fixture contaminated a later batch); fixtures were corrected without weakening assertions. Internal review additionally found and fixed an inappropriate aggregate capacity-200 limit, historical labels following a moved cart, and the fresh pending-slot leak. Final logs: `/tmp/gsis-lord-cart-groups-final.log`, `/tmp/gsis-lord-groups-browser-final.log`, `/tmp/gsis-lord-cart-contracts.log` and `/tmp/gsis-lord-cart-final-canonical.log`. These temporary paths are supporting local evidence, not substitutes for the committed reproducible tests or exact-head CI.

Two follow-ups remain explicit. The reused native UI can persist an attempt before local cart preparation rejects and then treat that attempt as unknown. B-R01 will add safe preflight-before-persistence for genuinely new attempts without forgetting restored or reused operation IDs; this PR does not infer non-commit from a missing receipt or storage entry. At 390px, the existing owned-editor fieldset can overflow around a long booking ID; the upcoming UI recovery scope will fix wrapping and add a narrow-width assertion. Desktop cart grid and narrow physical collection were visually inspected locally. Neither remaining issue changes the backend's complete-group reservation guards.

Claude reviews the exact final head without editing the branch. Subsequent changes require updated-head review. No merge/deployment approval is implied by tests or model review. F5 remains OPEN. Official T1B-01/T1B-02 and unperformed runtime UAT remain **Not tested**.

## Rollback and next action

Rollback restores the prior code and its grouping defect; it does not undo committed bookings, custody movements, audit, receipts or immutable evidence. Additive group details remain stored. Older readers may again show a first-trolley label or a reserved-capacity total instead of requested quantity; record that limit before any release. Do not delete physical records or rewrite bookings as a rollback shortcut.

Start gates passed: all remote branches, claims, actual 25 open PR file inventories and review/discovery records were refreshed; no competing work touches this scope. The accepted eight-path implementation is frozen. Complete clean exact-head full verification, then publish one bounded PR for Claude. No owner policy question is required for the source-parity design. Implementation, verification, Claude review and separately authorised release follow that accepted claim.
