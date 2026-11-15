# v1-roster-v09-adhoc-parity: Integrate reviewed dated ad hoc relief behaviour into v1

- Status: merged as PR155 and deployed at `26bbccd229962700409bb6e9c80b1e9bec170d20`; Claude approved exact head `a37869acd1ebf4e85a9a9f8f29741fe96214531f`; unperformed runtime UAT remains Not tested (closure evidence below)
- Owner/model: Codex; v1 coordinator ChatGPT; independent reviewer Claude
- Last updated (Asia/Singapore): 15 November 2026
- Branch: codex/v1-roster-v09-adhoc-parity
- Base: main a6c08379a6acc5911f2c37821d7da434f7d36ad2, including PR153 merge 7c9315124344e204819538697f1369edcc5ace31 and the separate frontend-inventory claim.
- User-authorised scope: "read v0.9 repo. capture all updates done today. ensure that the updates are also integrated into v1 where applicable". Integrate the reviewed PR153 behaviour through v1-owned adapters; no merge, deployment, live data or messaging authority is inferred.
- Exact file allowlist: `v1/services/roster/eligibility.mjs`; `v1/services/roster/context.mjs`; `v1/services/roster/allocation-snapshot.mjs`; `v1/services/roster/service.mjs`; `tests/v1-product-roster-adhoc-parity.mjs`; `tests/v1-product-roster-adhoc-delivery.mjs`; `tests/v1-product-roster-adhoc-browser.mjs`; `tests/v1-product-roster-service.mjs`; `docs/v1/product/ROSTER_V09_PARITY.md`; this task record.
- Current head/PR: claim c3b4aa2aa99e0ae4f29203dcd07d359c7d666de4 and refinement 8335c133d425d99704ca6b74303c165200407d9f were published to main before the corresponding edits and incorporated into this branch. Exact tested head and CI are recorded in the implementation PR.

## Source contract and boundaries

PR153 reviewed head 39728a23dd5db2bc44a1cac8216caace2dd4c735 restores relief eligibility for an existing inactive Contacts person explicitly activated for the selected date/period. Missing people still fail, deleted/wrong-date/out-of-period activations do not grant eligibility, saved/protected work and quotas remain intact. Review: `docs/coordination/review/adhoc-inactive-hotfix-claude-review.md` on main. The source is merged; its historical claimed task status does not denote an outstanding implementation conflict.

v1 inherits the changed shared domain and frontend code at build time, but `context.mjs` currently fabricates `active=true` for single-date ad hoc views. That masks dated labels and external-teacher reports and diverges from multi-date views. Preserve actual Contacts employment status and use a narrowly scoped dated eligibility predicate. Existing v1 accepted EO/explicit `adhocEligible` qualification remains mandatory; do not infer roles from names, tags, mobiles or legacy category labels. The permanent Staff ID remains the v1 identity key.

The final notification check currently depends on the fabricated active flag. Update it with the same fresh, date/period-scoped qualification only for relief publication/reminder/instruction, Stapler timetable and mutual request/override kinds. Keep report-email recipients, generic inbox/webhook, SMC/Admin/sponsor recipients and absence reporting active-only. Core/Contacts contracts, application grants and permission policies are untouched. No cross-D1 atomicity claim is added.

Out of scope: shared/v0.9 sources, generated legacy bundles, release assembly, root package/CI/dependencies, Core/Contacts libraries or stores, general onboarding/Admin email proposals, provider configuration or activation, Drive/pruning operations, infrastructure and live records. Parked PR40/72/103 and v0.9 coordinator release work are not taken over. The separate frontend claim owns build-label normalization and the all-day update inventory; there is no file overlap.

## Acceptance and verification

- Reproduce the current single-day/multi-day ad hoc report and label discrepancy before the fix; preserve actual Contacts `active` in both contexts.
- Existing inactive accepted-EO staff with a current explicit activation are candidates and assignable only in allowed periods/dates; auto allocation, current capacity, weekly outlook, shared cover, retained duties and external-teacher reports use the same facts. Next-day/deleted/out-of-period/unqualified/missing identities remain denied as applicable.
- Real built-browser regression covers dated ad hoc presentation and period eligibility. Inherited Stapler behaviour is not duplicated or rewritten.
- Actual local service/dispatch tests with synthetic providers cover all six relief message kinds, wrong/deleted/date/period activation, qualification revoked between reads, missing identity and missing consent. Generic/non-relief and SMC/Admin/report-recipient gates remain active-only. No real provider sends.
- Use controlled clocks and synthetic identities; TZ=Asia/Singapore. Run focused regressions, discovery, canonical build/no tracked drift, product suite and required full Node/LORD exact-head CI. Record failures/omissions and exact tested head. No assertion weakening or hidden test skips.
- Exact allowlist, documentation links and whitespace verified. Claude reviews the exact final head. Rollback reverts v1 adapter/helper changes without schema migration; preserve existing records and operation identities.

## Skill and handoff

Pstack blast-radius (`skill://plugins_6a85a87df50c8191bd7f010bb7b17794/blast-radius/SKILL.md`) used to trace source status through adapters, allocator snapshots, browsers and final dispatch. No new dependency or copied skill code.

F5 remains OPEN; official T1B-01/T1B-02, live provider delivery, hosted recovery and unperformed runtime UAT remain Not tested. Owner controls later merge/deployment. Claim-only publication precedes implementation.

## Claim refinement before the existing-test edit

The existing service regression at `tests/v1-product-roster-service.mjs` expects directory `active=true` after dated activation, although Contacts remains inactive. Add only this test path to the implementation allowlist to replace that obsolete assertion with truthful `active=false` and explicit dated-period evidence. This is routine verification within the owner-authorised v0.9 integration, not a permission-policy expansion. No production path is added.

## Implementation and evidence

The actual Contacts `active` fact is now preserved for all ranges and prospective activations. A small pure predicate binds accepted EO/explicit eligibility to permanent Staff ID, date and valid selected periods; allocator snapshots and final relief dispatch reuse it. The six existing relief kinds alone may use this route. Final dispatch rechecks current Contacts consent/qualification and rereads the owning D1 activation after service IO. Periods come from the current referenced owner publication/request/timetable; cancellation-only notices do not assign a new period. No Core/Contacts, shared domain, provider integration, schema, migration, dependency or configuration file changed. See [contract and limits](../../v1/product/ROSTER_V09_PARITY.md).

Red evidence: the new context test first failed on the existing `active=true` promotion. The delivery test first failed because a recipient's consent could be revoked between Contacts reads and still be sent a message. Both reproduced against the actual adapter/service with local owner D1/R2 and synthetic projections/providers. An existing service assertion explicitly required the fabricated active status; the refined claim permits replacing it with `active=false` and checks of the actual saved activation's allowed/denied periods. No test is skipped.

Focused commands below passed with `TZ=Asia/Singapore`; browser execution uses `GSIS_BROWSER_EXECUTABLE=/usr/bin/chromium`:

- `node tests/v1-product-roster-adhoc-parity.mjs` — actual context, reports/labels, manual/automatic relief, shared cover, retained duties, current/weekly capacity and negative identity/date/period/qualification cases.
- `node tests/v1-product-roster-adhoc-delivery.mjs` — synthetic sends through actual dispatch, six kinds, fresh evidence, durable private links and one local owner restart; real provider delivery is Not tested.
- `node tests/v1-product-roster-adhoc-browser.mjs` — built UI with local owner reads, allowed P2 and denied P3/next-day/deleted activation.
- `node tests/v1-product-roster-service.mjs` — all 14 existing service acceptance groups pass after the explicit obsolete-assertion correction.
- `node tests/v1-product-roster-accounting.mjs` — all ten accounting/source-race groups pass.
- `node tests/v1-product-roster-capacity.mjs` and `node tests/v1-product-capacity-notifications.mjs` — pass, including final D1 refresh and stale cancellation.
- `node tests/roster-adhoc-inactive-regression.cjs` and `node tests/roster-adhoc-inactive-parity.cjs` — pass against inherited source and local legacy adapters; no production operation.
- `npm run build` — pass with no tracked generated drift.
- `node tests/run.cjs --list` — all three new programs discovered (1,171 programs on this branch; the separate frontend PR adds one more).

One root browser invocation used the wrong environment variable and failed before Chromium launch because no cached Playwright browser existed. Rerunning with the repository's `GSIS_BROWSER_EXECUTABLE=/usr/bin/chromium` passed (6.5 seconds). This was an environment setup failure, not a hidden pass. An optional baseline browser load-hook probe stalled and was stopped; it supplies no red evidence. The actual context/service reproductions above do.

Internal working-tree review and the independent local parity rerun found no blocker in the helper/context/snapshot. This is not Claude approval. Full required product and Node/LORD exact-head CI is pending until the PR run links report results; no prior head's result is substituted.

Q01/Q02 Pass: owner-authorised integration, claim/refinement, source review and exact domain/field ownership. Q03/Q04 Pass for bounded local evidence: current identity/consent/activation and retained active-only gates, period/source checks, restart/revocation tests; check-to-send interval remains explicit. Q05 Pass: no new dependency, bounded date/staff activation lookup (10,000 rows/8 MiB), existing owner/service boundaries. Q06 focused/canonical Pass, full CI Pending. Q07 Claude exact-head review Pending. Q08 deployment Not applicable; live provider/hosted recovery/runtime UAT Not tested. F5 OPEN and official T1B-01/T1B-02 Not tested.

Internal review also reproduced a conditional-instruction source mismatch in the first patch: current duty P3 was sent while only original duty P2 was activated. The final code checks `notificationCurrent`'s resolved `checkedPublicationId` for non-personal instructions; personal instructions use its rewritten eligible snapshot IDs. Added negative and positive controls prove current P3 is denied with P2-only activation and allowed with P3-only activation. The original probe now cancels with zero synthetic provider calls. This finding is resolved in the submitted code; Claude has not yet reviewed it.

## Merge closure, 15 November 2026

The owner subsequently instructed “merge and deploy, i approve”, superseding this task's earlier no-merge/no-deploy limits for the reviewed release. [PR155](https://github.com/helper-gsps/gsis/pull/155) head `a37869acd1ebf4e85a9a9f8f29741fe96214531f` received [Claude's exact-head approval](https://github.com/helper-gsps/gsis/blob/29915fbe6a33329bf7f9bf1a998aca9aaf33bd52/docs/coordination/review/pr154-155-claude-review.md), recorded on main commit `29915fbe6a33329bf7f9bf1a998aca9aaf33bd52`. Codex merged it without hand edits at [`26bbccd229962700409bb6e9c80b1e9bec170d20`](https://github.com/helper-gsps/gsis/commit/26bbccd229962700409bb6e9c80b1e9bec170d20), 15 November 06:41:10 SGT, after PR154. Implementation ownership is closed; the earlier pending-review statements are retained as historical handoff evidence.

Combined-main [full regression CI](https://github.com/helper-gsps/gsis/actions/runs/43649420498) passed 1,172/1,172 Node programs and 40/40 LORD checks per shard; [product CI](https://github.com/helper-gsps/gsis/actions/runs/43649422660) passed 73/73 programs, build/no drift, nine Worker dry runs and local migration-upgrade checks. Both passed on attempt 1 at the exact merge head `26bbccd229962700409bb6e9c80b1e9bec170d20`. [Deployment run 43650254322](https://github.com/helper-gsps/gsis/actions/runs/43650254322) succeeded at 15 November 06:55:04 SGT after owner browser approval. All nine Worker settings report that exact deployed SHA with unchanged resource bindings, service graph and activation flags; all eight D1 checks reported no pending migrations. All 16 public HTTP checks and four Roster asset byte/hash comparisons passed at 06:57:18–06:57:22 SGT; authenticated runtime acceptance is not claimed. The [product task](v1-product.md#reviewed-v09-integration-15-november-2026) and [deployment log](../DEPLOYMENTS.md) own the subsequent release evidence. No additional code, provider activation or live-data operation follows from closing this claim. F5 remains **OPEN**; official T1B-01/T1B-02, live provider delivery, hosted durable recovery and unperformed runtime UAT remain **Not tested**.
