# PAR-04: one department and confirmed moves

- Status: claimed on an isolated task branch; implementation pending.
- Owner/model: Codex; coordinator: ChatGPT; reviewer: Muse at the eventual exact head.
- Updated: 18 November 2026, Asia/Singapore.
- Branch: `codex/v1-deploy-department-move`.
- Base SHA: `066fcdda7a00242008938ad4aa67d14e83eab7fa`.
- Current head: the commit containing this branch-only claim; no self-referential hash is asserted.
- PR: none. The coordinator authorised this branch-only claim after direct-main claim publication was rejected. Do not push or open a PR until coordination authorises that handoff.
- Owner instruction: commit the logged changes so far. This bounded piece implements PAR-04 from [the parity audit](v1-deploy-v09-frontend-parity-audit.md). A teacher cannot join two distinct departments. Selecting someone already assigned elsewhere offers **Move to this department**, showing affected positions and requiring confirmation. Cancel preserves saved assignments and existing drafts.
- Exact scope: this task; `v1/web/shared/deploy-departments.mjs`; `v1/web/shared/deploy-departments-ui.js`; `v1/services/deploy/model.mjs`; `v1/services/deploy/workbooks.mjs`; `scripts/v1/build-web.mjs`; `tests/v1-product-deploy-departments.mjs`; `tests/v1-product-deploy-departments-browser.mjs`.
- Shared-file coordination: the PAR-03 inheritance task currently owns `model.mjs` on its separate branch. No Dept edit to that file until its implementer explicitly freezes the changes and hands over the disjoint hunk. Keep this task based on accepted main, not stacked on unreviewed inheritance product code. Stop for another uncoordinated overlapping scope. PR205 remains separate and untouched.
- Out of scope: CCA/PLT/Events cardinality decisions; generic group/TL/Duty validator repairs; new-version inheritance; global compact presentation; Teachers/IP visual changes; permission policy; provider, live data, migration, merge or deployment actions.

## Contract and smallest mutation

Use a pure v1 Dept helper for distinct-department references, a proposed move and the final before/after guard. Count Department IDs across `slots`, `additionalDeputies` and `tls`, not the number of positions occupied inside one department. Preserve the existing role model, optional leadership blanks, extra deputy/TL representations and per-group member-compaction behavior. Keep current within-Dept UI and canonical-import validation; do not use this cardinality rule to change that separate policy.

Retain and flag pre-existing multi-Dept data on load and unrelated saves. The native and workbook guards reject an increase in net distinct memberships beyond the prior legacy count or one, whichever is greater. A confirmed UI move resolves that staff member to the chosen department: remove only their references in every other department, preserve fixed leadership holes and other people's fields, compact only affected member suffixes, and add the selected destination position once. Never infer an SMC/EO/School Leader grant, reactivate someone, change another organisation kind or rewrite immutable history.

Own the interaction in a new v1 frontend module, with only the necessary script inclusion in the builder. Keep the native draft queue and explicit Save. A move stages one existing `setOrganisation` intent; use its captured full Dept expected value for confirmed moves so a changed Dept graph cannot silently pass a field-only patch. Preserve ordinary edits' existing transport. Check the selected version and proposed Dept snapshot again before staging confirmation. A changed graph requires current assignments to be reviewed and confirmed again. Keep actor/school/current capability, known identity, lease/fence, revision, operation-identity and original-outcome recovery guards unchanged.

Both direct native `setOrganisation` and encoded `patchPlanning` must enforce the final Dept rule. Canonical Dept preview/apply must use the same final-document check. Import cannot guess a destination from conflicting rows; an explicit one-Dept final move can apply atomically, while historical no-worse data remains reviewable. Keep stable IDs, existing column/role semantics, foreign/stale/readonly guards and rejected-import atomicity.

Several committees remain allowed with a visual notice. CCA/PLT/Events policy remains pending owner clarification; do not change it here. Preserve existing excluded-reference retention/removal and all other ordinary role/capacity and permission fields. An untouched field never clears saved data. Page open performs no data write.

## Acceptance and verification

Extend only the two existing Dept programs. They already exercise real built browser/owner Worker/D1 and canonical export, preview, apply and receipt paths. Capture a meaningful current-behavior failure before product edits where practical.

- Ordinary first Dept assignment needs no move confirmation. Choosing an additional Dept offers the named move action with old/target department and affected roles. Cancel preserves the complete existing draft and saved document, with no request.
- Confirm stages one atomic move across all relevant Dept arrays. No network write occurs before explicit Save; save/reload retains only the target. Member compaction does not promote other people's fixed roles or duplicate a reference.
- Native direct and actual browser patch-wire requests cannot increase distinct Dept membership above the allowed before/after count. Invalid staff/target/eligibility, stale expected value/revision or a changed reused operation identity cannot partly clear the original Dept.
- Existing historical multi-Dept state remains unchanged on open, note saves and unrelated/no-worse edits; explicit removal or confirmed repair is possible. Within-Dept role changes are not misclassified as cross-Dept moves.
- Canonical export/preview/apply preserves roles, Staff IDs and untouched values. A valid move imports atomically; an invalid increase is rejected without writes. Keep the existing within-Dept duplicate rejection.
- Exact retries, a lost response and restart recover the original operation without duplicate mutation. Wrong school/current capabilities/fence/revision retain their negative coverage.
- Multiple committees still save and remain visibly flagged. Other group kinds, accepted Contacts/Core facts, another version and immutable publication rows remain unchanged.

Use `TZ=Asia/Singapore`, locked Chromium 151 and isolated temporary XDG/log paths. Run the two changed programs and unchanged planning-eligibility native/browser, canonical workbook, save-recovery, Membership and duplicate-Contacts regressions as relevant. Run canonical build/no production-generated drift, v1 build, nine dry-runs/local migration upgrade, syntax/scope/whitespace and the required exact-head Node/LORD/product CI before review handoff. No weakened/skipped assertion, timeout increase, dependency or workflow change belongs to this task.

## Gates and handoff

Q01 branch-only claim and exact scope recorded. Q02-Q05 preserve the Dept owner and existing native atomic/recovery boundaries; no competing database or permission source is introduced. Q06/Q07 pending local checks, coordinator-authorised push/PR and Muse exact-head review. Q08 no release authority exercised. F5 remains OPEN; hosted runtime UAT, T1B-01/T1B-02 remain Not tested. Commit attribution and the eventual PR description must say Model: Codex. Publish no credentials, real staff data or provider payloads.
