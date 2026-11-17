# v1 Versions: explicit radio selection for Duplicate

- Status: claimed; implementation pending.
- Owner/model: Codex; coordinator: ChatGPT; reviewer: Muse at the exact head.
- Updated: 17 November 2026, Asia/Singapore.
- Branch: `codex/v1-deploy-duplicate-selection`. Base: main `8e72c47809a61c0229bef3ae99b35e26f6736c04`.
- Owner request: “should have radio button selections so that user can select which version to duplicate”. The current authorised Subject Load fix continues separately; the coordinator permits these two disjoint bounded tasks in parallel. No backend, builder or source path overlaps.
- Exact owned files: this task; `v1/web/shared/deploy-publication.js`; `tests/v1-product-deploy-duplicate-selection-browser.mjs`; existing `tests/v1-product-deploy-save-recovery-browser.mjs` under the clarification below.
- Out of scope: v0.9 source; creation/publication policy; Contacts-refresh semantics; identity/capability/revision/lease/recovery contracts; source-version mutation; deployment/migration/live data/providers. No merge or deployment is authorised by this coding task.

## Contract

Add one accessible radio selection keyed by stable version ID to the existing v1 Versions table, separate from the loaded version. Default once to the loaded version when it is in the list; retain an explicit selection through redraw, sorting and filtering. A removed or invalid selected version clears the selection and disables Duplicate; do not silently substitute another source. Keep the existing Duplicate button name and show its selected source in adjacent guidance/title and the confirmation/name prompt, avoiding unrelated locator or UI changes. New planning version creation remains unchanged.

Use the existing v1 module to wrap Versions rendering and duplicate creation; do not add build-web text patches. Never temporarily change the loaded current version. Reuse the native creation attempt and its stable request ID/source binding for uncertain/lost-response recovery. Existing pending creation is retained and radios locked; changing selection must not alter an already-issued operation's intent. Reset selection on protected-state clearing. Server continues to refresh existing teacher facts/Memberships from current Contacts as already implemented.

## Acceptance and handoff

Exercise actual built browser, native owner request and local Worker/D1: load A/select B/duplicate B; selected ID survives sort/filter/redraw; cancel makes no new version or source edit; invalid/deleted source cannot be silently replaced; ordinary users denied; lost response retries use the same source/request and create one result; source A/B documents stay unchanged; current Contacts refresh remains covered by the existing duplicate regression. All identities and data are synthetic.

Run TZ=Asia/Singapore canonical build/no drift, targeted browser/duplicate regression and required exact-head Node/LORD/product CI before draft PR; disclose unrun checks. Model: Codex on all commits and PR. Muse independently reviews the exact functional head; release-packaging review waiver does not apply. No live UAT, provider action, hosted write or deployment. F5 OPEN; T1B-01/T1B-02 and hosted runtime UAT remain Not tested.

Publish this task-record-only claim with an expected-head, non-force update under WORKFLOW Start session4, then implement from the accepted claim. Preserve the separate load-fix and eligibility queues; no unclaimed shared file edit. Q01 scope recorded; Q02-Q05 preserve native identities/recovery; Q06/Q07 pending; Q08 no release authority.


## Claim clarification: real recovery regression diagnostics

Model: Codex. Coordinator-authorised on 17 November 2026 18:25:37 SGT. Add the exact existing `tests/v1-product-deploy-save-recovery-browser.mjs` path before editing it. The source, new browser test and task remain owned by this same Codex task; this is a four-file scope. No additional product, builder, workflow, dependency or backend path is included.

Required CI at three Versions heads has failed this unchanged regression's five-second note-attempt wait while local runs pass. The controlled readiness/pointer reproductions establish real adjacent defects but do not prove the internal CI failure branch. Capture the actual click events, current native guards and intercepted request outcome in failure diagnostics. If a fixture starts the action before genuine native readiness, strengthen its setup to wait for that existing readiness and prove the real click reached the save. Preserve every existing fifteen-scenario behavioral/security assertion and timeout; no attempt synthesis, forced click, import stripping, skipped check, relaxed result or failure waiver. Keep diagnostic values synthetic and public-safe. A different product change needs a proven cause and a coordinator scope decision first.

Publish only this task-record clarification on main through the normal expected-head claim exception. The builder then incorporates it into the existing branch, retaining both its implementation evidence and this clarification. This does not authorise a merge, deployment, live operation, provider send or separate stale-note-revision fix.
