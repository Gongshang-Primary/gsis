# Roster administrative settings — implementation handoff

Status: implementation and local verification complete; child publication, full exact-head CI and Claude review pending. Updated 15 November 2026, 14:48 Asia/Singapore. Codex builds; ChatGPT coordinates v1; Claude reviews the exact published head. This handoff does not authorise merge, deployment or live settings changes.

## Exact references

| Record | Reference |
| --- | --- |
| Frozen parent | [`eb63f820b3d9a78fdeec528bfe0c0d990bc17db0`](https://github.com/helper-gsps/gsis/commit/eb63f820b3d9a78fdeec528bfe0c0d990bc17db0), `codex/v1-venues-subpath-navigation` |
| Accepted main claim | [`52468a2c6573aaf77a803c88346a09100c0b4590`](https://github.com/helper-gsps/gsis/commit/52468a2c6573aaf77a803c88346a09100c0b4590) |
| Incorporation before code edits | Local `25064ad70549906fc898be6032545f0345101be0`; public equivalent [`07fe38f5ef50c9cdf1e796112b23f042b5ee8f2f`](https://github.com/helper-gsps/gsis/commit/07fe38f5ef50c9cdf1e796112b23f042b5ee8f2f); identical tree `303caed5baf3a5d82655161dc01813b88ac365af` |
| Implementation branch / contract | `codex/v1-roster-admin-settings`; [accepted task and complete acceptance criteria](../../coordination/tasks/v1-roster-admin-settings.md) |
| Discovery | [Run B at `ec6267b62cbca6c774e4895dfab7a422e56af804`](https://github.com/helper-gsps/gsis/blob/ec6267b62cbca6c774e4895dfab7a422e56af804/docs/v1/accelerated-delivery/UAT_RUN_B_2026-11-15.md), B-R03 and RUN-B-020 |
| Controlling policy | [Accelerated spec at `f39b671ac6da3f389c58345ce4f5c035f1cb3f65`](https://github.com/helper-gsps/gsis/blob/f39b671ac6da3f389c58345ce4f5c035f1cb3f65/docs/v1/accelerated-delivery/GSIS_V1_ACCELERATED_IMPLEMENTATION_SPEC_2026-11-13.md), sections 8.3–8.5; current root/v1 instructions |
| Final head / PR / child CI | Pending publication; exact tested commit and CI must be recorded in the PR |

Before claiming, the coordinator refreshed all refs/claims and actual files of 30 open PRs at 14:24 SGT. Main was `56391d911d8ba24bd1235111380871bb7ca772f4`; Claude's review branch remained `58e22a7bf7ba4a49caa2caabe877605153b098db`. Existing builder overlaps were frozen inherited changes; no competing implementation was identified. Parent full CI43684583219 was pending and its PR deliberately held at claim time. The coordinator explicitly permitted this serial successor after source freeze while automated checks continued. No parent verification is transferred to this child.

Subsequent coordinator checkpoint: [PR171](https://github.com/helper-gsps/gsis/pull/171) is now open at the same frozen `eb63f820…`. [Full CI43684583219](https://github.com/helper-gsps/gsis/actions/runs/43684583219) completed green at 14:25:27 SGT with 1,186 Node programs and 40 LORD checks per shard; parent product/build CI targeting 87 programs and Claude review remain pending. After opening it, the coordinator refreshed all refs and the combined actual inventories of 31 open PRs, including PR171's exact four files. Main is `52468a2c6573aaf77a803c88346a09100c0b4590`; Run B and Claude's review head are unchanged. No new overlap appeared. This later checkpoint preserves the earlier fact that this claim was published before the parent PR while automated checks ran. Current parent checkpoint: PR171 is ready for Claude at the same `eb63f820…`; full 1,186-Node/40-LORD and product87 CI are green, with product artifact `14150702273`. Its review remains pending. Earlier pending statements describe claim/PR-opening time, not current parent status.

## Exact eight-path scope

- `v1/services/calendar/service.mjs`
- `v1/services/roster/service.mjs`
- `v1/services/roster/repository.mjs`
- `scripts/v1/build-web.mjs`
- `tests/v1-product-roster-admin-settings.mjs`
- `tests/v1-product-roster-admin-settings-browser.mjs`
- `docs/coordination/tasks/v1-roster-admin-settings.md`
- `docs/v1/accelerated-delivery/ROSTER_ADMIN_SETTINGS_HANDOFF.md`

Calendar owns its dates projection and inspected decision boundary. Roster owns configuration, absence types, order, revision checks, accounting, audit and receipts. The builder adapts only the copied v1 controls. Core, Contacts, allocator, shared domain, native v0.9 source, runtime/client, schema, configuration, dependencies and CI remain outside this claim.

## Implemented contract

1. **Delegated date read:** accept the existing verified `roster.admin` action at Calendar `/internal/dates`, retaining all current decision/service/school/operation checks. This removes an accidental dependency rejection; it grants no caller-supplied authority and adds no Calendar feature.
2. **Active settings and retained compatibility:** preserve hidden legacy allocation fields unchanged, including PAL3 with no baseline. Reject attempted changes to those fields and keep active validation effective. Restore the still-active consecutive-count-exclusions control and visible errors. The compatibility context is a separate validated copy: it may permit retained legacy rule names only after proving those fields unchanged. Independently validate edited shared-cover subjects against the original current subjects plus existing shared-cover selections, using the existing exact normalization. Retained PAL must not become fabricated current-baseline evidence or authorise a new shared-cover subject.
3. **Complete confirmation:** for `saveSystemConfig` and `saveTypes` only, place the required native post-save view in the existing durable owner receipt, derived from next state and the original real context. Return committed config revision and original operation/request identity. Native confirmation must reject incomplete/mismatched replies before pending-request cleanup; uncertain outcomes retain the original request. Do not add a second reread/write race, new generic hashing/recovery system or page-reload draft-persistence claim.
4. **Durable type order:** retain stable type IDs and add types-only `position` metadata outside domain data in the existing record wrapper. An explicit `saveTypes` stamps the complete next order atomically under config CAS. All-absent positions use the documented record-ID fallback; mixed, duplicate, gapped or malformed order evidence fails closed. Unrelated operations must not stamp/reorder types, and existing absence references remain unchanged.
5. **Two-operation budget:** the agreed repository boundary is an explicit `recordChanges` administrative-save mode and `compactAdministrativeSave` applied to the final complete plan. Only these two operations opt in. Consolidate bounded record guards/upserts/deletes without dropping config CAS, membership checks, source/deadline predicates, accounting guards, audit, receipt or legitimate outbox work. Do not broaden `compactOpeningSave`, generic runtime or other operations. Validate total query/bind/UTF-8 argument bounds, including repeated receipt/audit bindings, before an atomic batch. Keep the existing 1–80 type bound; no hidden partial commits.

The source annual-utilisation rule remains historical compatibility data. Approved v1 daily-capacity ranking and annual ledger statistics remain unchanged. Scheduler/backup/daily flags, notification settings and other values change only when explicitly requested through permitted active controls. No source values, identities or live migration actions are copied by this repair.

## Six preflight counterexamples

These probes inspected frozen `01c1db1d3eb9d0edd99a6e5a46ee772cb09a6cef` before the navigation-only parent. They are local evidence for the claim, not successful implementation tests or proof of the hosted request's cause. Commands use `TZ=Asia/Singapore node /tmp/<probe>.mjs`; logs share each probe stem.

| Probe | Actual observation and limit |
| --- | --- |
| `gsis-roster-settings-discovery` | Actual nine-Worker Admin config read 200; both save operations 403 SERVICE_DENIED before any Roster operation. Minimal invalid payloads never reached business validation. This proves the earlier authority rejection only. |
| `gsis-roster-settings-browser-probe` hidden validation | Actual built renderer/Chromium, explicitly synthetic `ctx.api`: lag 10→11 with unchanged PAL3/no baseline makes no save request, leaves Unsaved changes and hides its validation error. Invalid visible summary time still produces visible validation. Three browser scenarios together took 3.737s. |
| `gsis-roster-settings-domain-probe` | Pure imported operation also rejects unchanged PAL3/no baseline after an otherwise valid lag edit, leaving stored values unchanged. Skipping browser validation alone is insufficient. |
| `gsis-roster-type-order-probe` | Actual owner D1 reloads requested `[z-last-id,a-first-id]` lexicographically; reversing the loaded array creates zero record writes; restart retains that wrong order. Stable row data survives, but order does not. |
| `gsis-roster-settings-browser-probe` response shape | With current PAL supplied to pass validation, the exact present owner success shape lacks `config`; native confirmation fails with `"undefined" is not valid JSON` after its pending button disappears. Missing types in the analogous native flow was source-traced and still needs the claimed test. No actual Worker success is claimed by this synthetic response. |
| `gsis-roster-types-budget-probe`; `gsis-roster-config-budget-probe` | Real owner D1 with synthetic admission/strict 50 counter: 80 changed types yield 81 guards/81 writes and a 249-statement batch; 254 attempted/4 dispatched, zero changed rows, prepared operation, 3.450s. Separately, pure domain/repository planning changes 14 config-related records and needs at least 51 commit statements before reads/admission; that second probe executes no D1 batch. These are explicit local limits, not measured live account quotas. |

The older November 14 opening-balance/admission probe belongs to a different historical task and is not evidence or scope for this repair. Local artifacts are not a substitute for the new checked-in tests and exact-head CI.

## Verification ledger

| Check | Status at this checkpoint |
| --- | --- |
| Accepted claim/incorporation before edits | Pass; exact references above |
| Baseline `TZ=Asia/Singapore npm run build` | Pass: 18 canonical components, no tracked drift; `/tmp/gsis-roster-settings-canonical-base.log` |
| `TZ=Asia/Singapore node tests/v1-product-roster-admin-settings.mjs` | **Final 17/17 Pass**, exit 0, 28.465s under the unchanged 45s runner limit; every owner call enforces the strict 50 bound. Six groups use actual nine Workers; eleven use actual owner D1 with three explicitly synthetic peer authorization/pin services. `/tmp/gsis-roster-admin-settings-final.log` and `-final-time.log`. |
| New built-browser red/green | Test-first red in 2.849s at hidden PAL validation; first seven-group green in 9.069s; **final 8/8 Pass in 10.935s**. Actual native built renderer/Chromium, explicitly synthetic `ctx.api`; no Worker/live success implied. `/tmp/gsis-roster-admin-ui-red.log`, `-green-1.log`, `-final.log`. |
| Owner request budget, rollback, races and restart | Pass: all success and failure calls enforce strict 50, with explicit failure/recovery counts below. Actual nine-Worker permission/save/replay groups remain separate. |
| 33 unchanged regression programs | **33/33 Pass**, process exit 0; 21 product programs plus 12 Core/Contacts contract programs (56 cases). `/tmp/gsis-roster-settings-regressions.log`; exact selections below. |
| Final `TZ=Asia/Singapore npm run build`; scope/whitespace | Pass: 18 canonical components, no tracked generated drift, exactly the eight allowed paths; `git diff --check` passes. `/tmp/gsis-roster-settings-canonical-final.log`. |
| `node --check` on all six changed JavaScript files; Prettier check | Pass. Formatting check covers the repository module and two new test programs; no broad formatting pass was applied. |
| `node scripts/v1/test.mjs --list`; `node tests/run.cjs --list` | 89 product / 1,188 Node programs; both new tests appear in both lists. `/tmp/gsis-roster-settings-{product,node}-list.json`. Discovery is not a full-suite execution. |
| Full required Node/LORD and product CI at exact child head | Pending publication |
| Claude independent exact-head review | Pending |

The focused owner-D1 counter includes the full local service handler, preparation/admission/commit and cleanup, with three synthetic peer pin services. First stamps of 1/16/80 types, 80-type reorder/relabel and all active settings each use 41 attempted/dispatched SQL statements; insertion/deletion/removal uses 42. Maximum 11 binds per statement; maximum aggregate repeated JSON argument bytes 86,487; commit batches contain 10 or 11 statements. All four config/member/deletion/addition races and both revision-zero presence/absence races use 45 attempted/dispatched queries with batches of 10 and 2, return REVISION_CONFLICT, leave a terminal aborted operation and no success audit. Exact original receipt replay after actual owner process restart uses 15 queries and no commit batch. These measurements do not claim arbitrary production peer/dependency counts or a cross-D1 transaction.

The 17 groups also cover hidden-field preservation/attempted edits, active exclusions, invalid visible/type input, oversized complete audit/receipt plans, exact retained annotation and audit representation, config/member/delete/membership races, malformed stored positions, revision-zero presence versus absence, authority/preview/school denial and unchanged historical type references. Compacted guards retained those invariants; no partial owner effect or invented successful audit is accepted.

Failure retained: the first service run failed after 9.870s because a save/reload omitted previously missing unchanged config fields (`noReliefSubjects`, `scheduledAllocationEnabled`); `/tmp/gsis-roster-admin-settings.log` and `-time.log`. The fix materializes missing fields only during an explicit administrative config save with atomic absence guards; it does not change generic repository behavior. Administrative reads now return the config-scope revision so a subsequent save uses the correct CAS. Saved-view construction runs on a clone with `nameBridgesSeeded=true`, preventing helper initialization from fabricating name links in the receipt or persisting them. Valid retained lowercase/annotated PAL is normalized only for private validation, then its exact representation is restored in next state and new audit while historical audit stays untouched. An intermediate 17-group pass in 28.240s had two failing-race fixtures allowing 80 statements and omitted failure counters; those overrides were removed and all failure/recovery counts added. The final 17-group pass in 28.465s covers these corrections with strict 50 on every owner call. Product source did not change for that harness correction.

The final browser program uses actual built native settings/type renderers, CSS and Chromium with explicitly synthetic `ctx.api`, not Worker transport. It covers visible exclusions and validation, unchanged hidden policy despite DOM tampering, malformed/missing config and type confirmations, response loss/original retries, stale revision/preview denial presentation, type-order/detail preservation, SMC view-only and narrow layout. Backend authorization is established by the separate service program, not the synthetic denial reply. Screenshots and results are in ignored `deliverables/v1/evidence/roster-admin-settings/`: `settings-desktop.png`, `settings-narrow.png`, `settings-narrow-alert.png`, `results.json`. No new page-reload request persistence is claimed.

Each unchanged regression ran as `TZ=Asia/Singapore node tests/<file>`; browser programs also used `GSIS_BROWSER_EXECUTABLE=/usr/bin/chromium`. All 33 exit codes were zero. Exact filenames:

| Group | Files |
| --- | --- |
| Roster (11) | `v1-product-roster-service.mjs`, `v1-product-roster-storage.mjs`, `v1-product-roster-accounting.mjs`, `v1-product-roster-opening-budget.mjs`, `v1-product-roster-capacity.mjs`, `v1-product-roster-adhoc-parity.mjs`, `v1-product-roster-adhoc-delivery.mjs`, `v1-product-roster-tables.mjs`, `v1-product-roster-venues.mjs`, `v1-product-roster-capacity-browser.mjs`, `v1-product-roster-adhoc-browser.mjs` |
| Calendar (3) | `v1-product-calendar.mjs`, `v1-product-calendar-pins.mjs`, `v1-product-calendar-ui.mjs` |
| Shared frontend (4) | `v1-product-web.mjs` (25 cases), `v1-product-web-browser.mjs`, `v1-product-navigation.mjs`, `v1-product-v09-frontend-parity.mjs` |
| Deploy recovery (2) | `v1-product-deploy-save-recovery.mjs`, `v1-product-deploy-save-recovery-browser.mjs` |
| Product Core/Contacts (1) | `v1-product-core-contacts.mjs` |
| Core contracts (5) | `v1-core-authority.mjs`, `v1-core-identity.mjs`, `v1-core-isolation.mjs`, `v1-core-races.mjs`, `v1-core-session.mjs` |
| Contacts contracts (7) | `v1-contacts-catalogues.mjs`, `v1-contacts-contracts.mjs`, `v1-contacts-core-provider.mjs`, `v1-contacts-isolation.mjs`, `v1-contacts-races.mjs`, `v1-contacts-recovery.mjs`, `v1-contacts-snapshots.mjs` |

No complete local 89-product or 1,188-Node/LORD run is claimed. The required child full suites, including further unchanged allocator coverage, remain exact-head CI gates. No tests, discovery rules, required assertions or timeouts were weakened. Final source/test SHA-256 values identify the tested working tree, not an invented implementation commit:

| File | SHA-256 |
| --- | --- |
| `v1/services/calendar/service.mjs` | `4139024ac91afba5ae7ec0239210a035e74b74e5b24f154ce071632d9e2bb07c` |
| `v1/services/roster/service.mjs` | `f0dcc3ff01442d64170bd071aaae3f7b8c43f032dc89a513cc820a6220fc5412` |
| `v1/services/roster/repository.mjs` | `8a64c86351cd7e958a45f9f9264093db6d9747f3eb487a5d71b6b77cac47aa71` |
| `scripts/v1/build-web.mjs` | `5ca178afd72e70c82964c1253d4548a4cfa39cf72d668a15615b5ab620b45339` |
| `tests/v1-product-roster-admin-settings.mjs` | `dfa59c03a65fbef432e305eba19bc034674784815257673df74a46a557dd5cd9` |
| `tests/v1-product-roster-admin-settings-browser.mjs` | `150599e6c2ac6e04d61b04b74fc0cea1ec34b922afea9edf47953cc6a7859d4d` |

## Gates and remaining limits

Q01 Pass: authority, accepted claim and overlap decision. Q02–Q05 Pass locally for the bounded implemented ownership/compatibility design, actual authority negatives, CAS/order/receipt/restart invariants and measured strict 50-query/byte budgets. The synthetic peer boundary and unresolved cross-owner intervals remain explicit. Q06 local checks Pass; full child exact-head CI Pending. Q07 Pending publication and Claude review. Q08 Not applicable to deployment. Repository engineering/skill principles were applied; no optional skill execution or third-party copying is claimed by this documentation work.

Rollback limitation: old builds can read the existing type records, but display them in record-ID order. Their old `recordChanges` writer strips wrapper `position` from changed rows. Insertions, mixed positioned/unpositioned rows or deletion gaps can therefore cause `TYPE_ORDER_INTEGRITY` when returning to this build; rewriting every row can lose the accepted order into the all-absent legacy ID fallback. Preserve an ordered backup before rollback and **freeze all absence-type writes** while the old build is in use, including create, delete, relabel, flags, timing rules and reorder. Return to the current build before any such edit. If old-build writes already occurred, stop type writes and use separately authorised recovery from preserved evidence; never infer or automatically repair the intended order. Keep strict forward integrity validation. Do not erase committed settings, order evidence, audit or receipts. No cross-D1 atomicity, hosted recovery, migration or provider-delivery claim is made. B-R02 multi-room mapping, B-R04 inactive-reference migration, Contacts work and Venues deep links remain separate. F5 stays **OPEN**; official T1B-01/T1B-02 and unperformed runtime UAT stay **Not tested**. Release label remains v1.01 under separate authority.
