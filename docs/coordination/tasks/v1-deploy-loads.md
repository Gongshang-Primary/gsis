# v1 Deploy Subject Load, LSP and FORM save fixes

- Status: implemented; local verification passed; exact-head CI and Muse review pending. Not deployed.
- Owner/model: Codex. Coordinator: ChatGPT. Reviewer: Muse at the exact functional head.
- Updated: 17 November 2026, Asia/Singapore.
- Branch: `codex/v1-deploy-loads`. Base: main `06d71e5852076903f708abda264c4e8682d815d8`.
- Owner authority: after the Subject Load/LSP/FORM investigation, the owner explicitly instructed **“commit code changes”**. The later Versions radio-selection request is queued separately on disjoint paths. No merge, deployment, migration, live-data edit or provider send is authorised by this coding instruction.
- Exact file scope: this task; `docs/v1/DEPLOY_SUBJECT_LOAD_UAT_2026-11-17.md`; `v1/web/shared/deploy-loads.mjs`; `v1/web/shared/deploy-loads-ui.js`; `v1/web/shared/deploy-ui-tables.js`; `v1/services/deploy/model.mjs`; `scripts/v1/build-web.mjs`; `tests/v1-product-deploy-loads.mjs`; `tests/v1-product-deploy-loads-browser.mjs`.
- Overlap check: main is released v1.04; only PR182 is open, a v0.9 draft. The prior audit is a documentation-only branch `84e1f2882160cf9755be52c832f37a111073304f`. No v0.9 source or release workflow is owned here.

## Contract and bounded design

The investigation reproduced 18 diagnostic cases through actual built local Workers/D1 and the browser. Missing per-level subject keys reject visible n/a cells; legacy string n/a mismatches parsed expected null; PD is editable despite reference-only semantics; FORM is an independent zero-rate default while FT is the derived aggregate; workbook parsers disagree with the editor and can coerce blanks/booleans into numbers.

Add one pure v1 load-policy module reused by backend and browser. Keep null/not-offered distinct from offered zero; accept only supported legacy load representations, finite half periods and existing bounds. Recognize standard and globally configured subjects when a level's property is absent; update only explicitly edited fields and retain raw stored rows/CAS semantics. Do not normalize every database row or rewrite assignments on read. Missing request fields never clear stored data. Preserve identity/current capability, school, lease/revision, operation identity, atomic batching and recovery.

Keep FT internally as the existing class aggregate and label it FORM in v1. New versions do not create a second standalone FORM subject. Preserve all existing FORM values/assignment/TG identities and immutable publication documents; ambiguous historical standalone FORM remains visibly distinguished for review rather than silently migrated, merged, deleted or recounted. Exclude an unused legacy FORM rate from new derived aggregate demand/exports while retaining its raw data. Make PD a reference-only display. Implement the editor in a v1-owned module, with only script inclusion/type wiring in the builder, not new source text patches.

Align Subject Load and Fortnight workbook parsing with the visible editor; no boolean-to-number or blank-to-zero coercion. Keep workbook identity, school/version/revision, row/column and bounded atomic import guards. Match fortnight exported rows to the existing visible teaching-row policy; preserve hidden/inactive stored values and explicit blank semantics. No new allocation policy or subject retirement.

## Acceptance and verification

Tests must exercise the real built browser, native save/receipt path and owning local D1: sparse LSP, known n/a/null/zero/half periods, supported legacy strings and expected values, unknown labels/bounds/prototype inputs, all-or-none mixed batches, stale/current capability and exact retries, save/reload, PD read-only, FORM aggregate and retained legacy FORM records. Drive real workbook import/preview/save with typed Excel values, metadata/revision guards and blank/null handling; compare visible/exported fortnight rows. Verify no unrelated load/assignment migration from a note-only save and no immutable publication rewrite. Reuse relevant existing export/workbook/recovery regressions.

Run TZ=Asia/Singapore canonical build/no tracked drift, relevant local product checks, pinned Worker dry runs/local upgrade and required exact-head Node/LORD and full product CI before opening the draft PR. Record actual commands/counts, failures and omissions. All identities/fixtures must be synthetic. Functional head needs Muse review; the owner's waiver for release-label/documentation packaging does not cover this fix. Full hosted runtime UAT, restore, T1B-01/T1B-02 remain Not tested; F5 OPEN. No hosted operations or new release-label increment belongs to this task.

## Gates and handoff

Q01 claimed scope and fresh owner instruction recorded. Q02-Q05 preserve existing storage/authority/recovery owners and use a pure shared policy without dependencies. Q06 verification pending. Q07 exact-head PR/review pending. Q08 deployment not authorised by this task and not performed. Applied installed Pstack root-cause skill: reproduce the actual failure first and trace adjacent consumers. The read-only diagnostic and audit branch are evidence, not a fixed-product pass. Publish only this claim first using the workflow's expected-head non-force task-record exception; then start implementation from the accepted claim. If that update is rejected, preserve the branch and do not bypass the rejection.
