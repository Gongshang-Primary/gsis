# PAR-04: one department and confirmed moves

- Status: implemented and locally verified on the isolated task branch. Push/PR, exact-head CI and independent review remain pending.
- Owner/model: Codex; coordinator: ChatGPT; reviewer: Muse at the eventual exact head.
- Updated: 18 November 2026, Asia/Singapore.
- Branch: `codex/v1-deploy-department-move`.
- Base SHA: `066fcdda7a00242008938ad4aa67d14e83eab7fa`.
- Claim head: `1bcee4c4158e92e8ec0aff800a01fdada473fbdc`. The implementation head will be reported with the coordinator/PR handoff; this record does not assert its own commit hash.
- PR: none. The coordinator authorised this branch-only claim after direct-main claim publication was rejected. Do not push or open a PR until coordination authorises that handoff.
- Owner instruction: commit the logged changes so far. This bounded piece implements PAR-04 from [the parity audit](v1-deploy-v09-frontend-parity-audit.md). A teacher cannot join two distinct departments. Selecting someone already assigned elsewhere offers **Move to this department**, showing affected positions and requiring confirmation. Cancel preserves saved assignments and existing drafts.
- Exact scope: this task; `v1/web/shared/deploy-departments.mjs`; `v1/web/shared/deploy-departments-ui.js`; `v1/services/deploy/model.mjs`; `v1/services/deploy/workbooks.mjs`; `scripts/v1/build-web.mjs`; `tests/v1-product-deploy-departments.mjs`; `tests/v1-product-deploy-departments-browser.mjs`.
- Shared-file coordination: PAR-03 froze its disjoint `model.mjs` addition at `0bc58d5561f41c6d5d26fa7a1fb6b2d3ad4763b8` and explicitly handed over the Dept region. Its helper is beside `fixedGroupSlots`; this branch changes only an import and the `setOrganisation` guard. This branch remains based on accepted main and contains none of PAR-03's unreviewed product code. Stop for another uncoordinated overlapping scope. PR205 remains separate and untouched.
- Out of scope: CCA/PLT/Events cardinality decisions; generic group/TL/Duty validator repairs; new-version inheritance; global compact presentation; Teachers/IP visual changes; permission policy; provider, live data, migration, merge or deployment actions.

## Contract and smallest mutation

Use a pure v1 Dept helper for distinct-department references, a proposed move and the final before/after guard. Count Department IDs across `slots`, `additionalDeputies` and `tls`, not the number of positions occupied inside one department. Preserve the existing role model, optional leadership blanks, extra deputy/TL representations and per-group member-compaction behavior. Keep current within-Dept UI and canonical-import validation; do not use this cardinality rule to change that separate policy.

Retain and flag pre-existing multi-Dept data on load and unrelated saves. When the final state still has more than one Dept, its Dept-ID set must be a subset of that staff member's prior set. Exact no-op and reductions are allowed; A+B to A+C is rejected even though its count is unchanged. Any explicit final single-Dept move is allowed by this cardinality rule. A confirmed UI move resolves that staff member to the chosen department: remove only their references in every other department, preserve fixed leadership holes and other people's fields, compact only affected member suffixes, and add the selected destination position once. Never infer an SMC/EO/School Leader grant, reactivate someone, change another organisation kind or rewrite immutable history.

Own the interaction in a new v1 frontend module, with only the necessary script inclusion in the builder. Keep the native draft queue and explicit Save. A move stages one existing `setOrganisation` intent; use its captured full Dept expected value for confirmed moves so a changed Dept graph cannot silently pass a field-only patch. Preserve ordinary edits' existing transport. Check the selected version and proposed Dept snapshot again before staging confirmation. A changed graph requires current assignments to be reviewed and confirmed again. Keep actor/school/current capability, known identity, lease/fence, revision, operation-identity and original-outcome recovery guards unchanged.

Both direct native `setOrganisation` and encoded `patchPlanning` must enforce the final Dept rule. Canonical Dept preview/apply must use the same final-document check. Import cannot guess a destination from conflicting rows; an explicit one-Dept final move can apply atomically, while historical no-worse data remains reviewable. Keep stable IDs, existing column/role semantics, foreign/stale/readonly guards and rejected-import atomicity.

Several committees remain allowed with a visual notice. CCA/PLT/Events policy remains pending owner clarification; do not change it here. Preserve existing excluded-reference retention/removal and all other ordinary role/capacity and permission fields. An untouched field never clears saved data. Page open performs no data write.

## Acceptance and verification

Extend only the two existing Dept programs. They already exercise real built browser/owner Worker/D1 and canonical export, preview, apply and receipt paths. Capture a meaningful current-behavior failure before product edits where practical.

- Ordinary first Dept assignment needs no move confirmation. Choosing an additional Dept offers the named move action with old/target department and affected roles. Cancel preserves the complete existing draft and saved document, with no request.
- Confirm stages one atomic move across all relevant Dept arrays. No network write occurs before explicit Save; save/reload retains only the target. Member compaction does not promote other people's fixed roles or duplicate a reference.
- Native direct and actual browser patch-wire requests cannot add a new Dept while leaving more than one distinct Dept; historical after-sets must be subsets of prior sets. Invalid staff/target/eligibility, stale expected value/revision or a changed reused operation identity cannot partly clear the original Dept.
- Existing historical multi-Dept state remains unchanged on open, note saves and unrelated/no-worse edits; explicit removal or confirmed repair is possible. Within-Dept role changes are not misclassified as cross-Dept moves.
- Canonical export/preview/apply preserves roles, Staff IDs and untouched values. A valid move imports atomically; an invalid increase is rejected without writes. Keep the existing within-Dept duplicate rejection.
- Exact retries, a lost response and restart recover the original operation without duplicate mutation. Wrong school/current capabilities/fence/revision retain their negative coverage.
- Multiple committees still save and remain visibly flagged. Other group kinds, accepted Contacts/Core facts, another version and immutable publication rows remain unchanged.

Use `TZ=Asia/Singapore`, locked Chromium 151 and isolated temporary XDG/log paths. Run the two changed programs and unchanged planning-eligibility native/browser, canonical workbook, save-recovery, Membership and duplicate-Contacts regressions as relevant. Run canonical build/no production-generated drift, v1 build, nine dry-runs/local migration upgrade, syntax/scope/whitespace and the required exact-head Node/LORD/product CI before review handoff. No weakened/skipped assertion, timeout increase, dependency or workflow change belongs to this task.

## Implementation and visible changes

The pure Dept helper counts supported stored references by stable Staff ID and Department ID. The native owner and canonical Dept importer apply its same final-state rule after their existing shape/identity checks. The owning save/import transactions, leases, receipts, revision fences and actor decisions are unchanged. No new persistence table, permission field or migration is introduced.

The new v1 module wraps the existing Dept picker and draft queue. A proposed second Dept opens **Move to this department**, showing source/target positions. Cancel keeps the complete prior draft. Confirmation stages one normal draft intent; Save remains explicit. Confirmed moves use the full captured Dept graph as the native expected value, including when a later ordinary Dept edit coalesces into that intent. Changing the version, current graph, session or capability prevents a late confirmation from staging stale intent. Opening a page does not write.

Existing multi-Dept records receive a review notice and explicit buttons to retain one existing destination. This also permits an inactive historical teacher's unchanged destination to remain while removing their other Dept references; it does not reactivate the teacher or add them to new choices. Fixed leadership holes and other people's roles remain in place. The original controls and Committee notice remain unchanged. Imports reject ambiguous new multi-Dept results rather than choosing a target.

Visible changes needing owner review are the move dialog/action, retained-history notice/repair buttons and updated Dept instruction text. Other organisation policies and their presentation remain unchanged.

## Local evidence

All data and provider boundaries are synthetic/local. Locked Chromium is 151.0.7922.34 at `/tmp/gsis-duplicate-locked-browser/chromium-1234/chrome-linux64/chrome`. Commands use `TZ=Asia/Singapore`; browser runs set `GSIS_BROWSER_EXECUTABLE` to that executable and isolated temporary `XDG_CONFIG_HOME`/`WRANGLER_LOG_PATH` values.

| Check | Result and evidence |
| --- | --- |
| Meaningful native red | Before the guard, the actual built Worker/D1 accepted a second Dept with 200 instead of the required 409. `/tmp/gsis-par04-worker-red2.log`. The earlier red attempt used a mismatched fixture object-key order; reading the actual saved baseline corrected the fixture without weakening an assertion. |
| Meaningful browser red | Before the module, selecting a second Dept produced no confirmation dialog. `/tmp/gsis-par04-browser-red.log`. |
| `node tests/v1-product-deploy-departments.mjs` | Pass, standalone 20.064 seconds against the unchanged 45-second programme ceiling. Real direct/encoded native routes, same-Dept role arrays, atomic moves/retries, historical subset retention/equal-count swap rejection, canonical invalid/valid imports, strict school/capability/fence/revision/operation guards, unchanged Contacts/Core/other versions/publication history, and replay after an actual Worker restart. `/tmp/gsis-par04-native-green.log`. |
| `node tests/v1-product-deploy-departments-browser.mjs` | Pass. Real built browser/Worker/D1 covers Cancel preserving prior drafts, no write until Save, confirmed source-array removal/target assignment, ordinary rename coalescing retaining the original full expected graph, repeated move baselines and inactive non-TL historical repair. Existing add/rename/leadership/deletion/committee-default assertions remain. `/tmp/gsis-par04-browser-green4.log`. |
| Unchanged `node tests/v1-product-deploy-planning-eligibility.mjs` | Pass, 28.838 seconds including build/runtime disposal. Version planning matrix and authoritative publication/receipt derivation remain covered. |
| Unchanged `node tests/v1-product-deploy-planning-eligibility-browser.mjs` | Pass, 14.866 seconds; all seven existing browser groups. |
| Unchanged `node tests/v1-product-deploy-workbooks.mjs` | Pass, 0.111 seconds. |
| Unchanged `node tests/v1-product-deploy-save-recovery-browser.mjs` | Pass, 14.908 seconds; all fifteen existing recovery groups. |
| Unchanged `node tests/v1-product-deploy-memberships-browser.mjs` | Pass, 13.903 seconds; real publish/Contacts application and recovery. |
| Unchanged `node tests/v1-product-deploy-duplicate-contacts.mjs` | Pass, 16.303 seconds; eleven-tag refresh, isolation and restart replay. |
| `npm run build` | Pass; all eighteen production components generated with no tracked production drift. `/tmp/gsis-par04-canonical.log`. |
| `node scripts/v1/build.mjs` | Pass; nine services built, 375 artifacts. `/tmp/gsis-par04-build.log`. |
| `node scripts/v1/verify-build.mjs` | Pass; all nine Wrangler dry-runs and real local additive migration upgrade. No hosted migration. `/tmp/gsis-par04-verify.log`. |
| Syntax/scope/whitespace | Pass for all seven product/test/build paths; exact eight-path task scope, no tracked generated drift, `git diff --check` clean. |

The six unchanged regressions ran sequentially with the same locked browser and a 45-second per-programme limit; combined evidence is `/tmp/gsis-par04-regressions.log`. No new dependency or workflow was installed or changed.

Corrected local implementation failures are retained: green1 exposed an incorrect `window.v()` reference to the copied app's lexical `v`; green2 used Playwright `.check()` even though a pending confirmation intentionally leaves the checkbox unchanged. The implementation now uses `v()`; the test clicks and explicitly verifies no draft change until confirmation. No timeout, security assertion or product acceptance requirement was relaxed. A timing wrapper attempt used unavailable `/usr/bin/time` and ran no test; the actual native timing above used the shell timer.

Skill-use record: the available catalog and repository skill policy were inspected. No external skill package was invoked or copied. Applied the repository's documented boundary, red/green, simplicity, browser-proof and recovery principles directly: one pure shared predicate, one v1 interaction module, existing authoritative commands/queue/transaction, meaningful real-artifact failures and local synthetic checks. The internal same-Codex peer review is implementation assistance, not Muse's independent exact-head review.

## Gates and handoff

| Gate | Status |
| --- | --- |
| Q01 | Pass: branch-only claim precedes product edits; exactly eight paths; disjoint model hunk explicitly handed over. |
| Q02 | Pass: Dept owner rows remain the authority; helper only counts ordinary references; UI is a draft projection and uses existing commands. |
| Q03 | Pass locally: real negative actor/school/fence/identity/eligibility checks remain; accepted Contacts/Core facts unchanged. |
| Q04 | Pass locally: atomic confirmed save/import, full-graph expected binding, native retry/reused-intent/stale/restart coverage; no new unknown-outcome protocol. |
| Q05 | Pass locally: no dependencies, schema or provider changes; unchanged 45-second programme bound, native run 20.064 seconds; bounded eight-path scope. |
| Q06 | Pass for the local real-artifact/regression/build checks above; exact-head required CI remains pending. |
| Q07 | Pending coordinator-authorised push/PR and Muse exact-head review. |
| Q08 | Not applicable: no merge, deployment, migration, provider or live-data authority exercised. |

Rollback is a code rollback of the module/inclusion/guards; no stored data migration is required. Saved moves remain ordinary auditable Dept revisions and are not automatically reversed. Existing multi-Dept history is retained until an explicit edit; unrelated historical duplicates and other group policies are not silently repaired. Hosted runtime UAT, T1B-01/T1B-02 remain **Not tested** and F5 remains **OPEN**. The eventual PR must report its exact head/base and **Model: Codex**. No CI or local result is hosted proof.
