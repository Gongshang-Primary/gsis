# v1-roster-v09-adhoc-parity: Integrate reviewed dated ad hoc relief behaviour into v1

- Status: claimed
- Owner/model: Codex; v1 coordinator ChatGPT; independent reviewer Claude
- Last updated (Asia/Singapore): 15 November 2026
- Branch: codex/v1-roster-v09-adhoc-parity
- Base: main a6c08379a6acc5911f2c37821d7da434f7d36ad2, including PR153 merge 7c9315124344e204819538697f1369edcc5ace31 and the separate frontend-inventory claim.
- User-authorised scope: "read v0.9 repo. capture all updates done today. ensure that the updates are also integrated into v1 where applicable". Integrate the reviewed PR153 behaviour through v1-owned adapters; no merge, deployment, live data or messaging authority is inferred.
- Exact file allowlist: `v1/services/roster/eligibility.mjs`; `v1/services/roster/context.mjs`; `v1/services/roster/allocation-snapshot.mjs`; `v1/services/roster/service.mjs`; `tests/v1-product-roster-adhoc-parity.mjs`; `tests/v1-product-roster-adhoc-delivery.mjs`; `tests/v1-product-roster-adhoc-browser.mjs`; `tests/v1-product-roster-service.mjs`; `docs/v1/product/ROSTER_V09_PARITY.md`; this task record.
- Current head/PR: claim first; exact tested head and PR evidence recorded at handoff.

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
