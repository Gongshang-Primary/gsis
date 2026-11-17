# Deploy Subject Load, LSP and FORM — 17 November 2026

Model: Codex. Times Asia/Singapore. Investigation recorded16:47; the owner then instructed “commit code changes”. Locally verified implementation; exact-head CI and Muse review pending. **Not merged or deployed.** Released v1.04 remains unchanged. F5 OPEN; hosted runtime UAT and T1B-01/T1B-02 remain Not tested.

## Findings and resulting behavior

| ID | Finding | Correction |
| --- | --- | --- |
| DEP17-005 | Visible sparse LSP/subject cells returned Unknown subject load. | Recognize standard/global codes at an existing level even when that cell is absent. Missing means not offered/null. Only explicitly edited fields are stored. Unknown/prototype codes/levels and omitted values still reject atomically. |
| DEP17-006 | Independent FORM zero-rate default beside calculated FT. | New documents have one internal FT aggregate, displayed read-only as FORM = Assembly + FTGP + FTT. Existing standalone FORM values, assignments, TGs, IDs, splits and publication history remain unchanged. Referenced legacy FORM is distinguished for review; no automatic conversion or retirement. Unused FORM is omitted only from derived demand/XML views, never deleted from storage. |
| DEP17-007 | PD editable despite reference-only workload. | Read-only reference:2 periods per PLT membership. Native FT/FORM/PD/TTT period writes reject explicitly. Raw historical values are retained. |
| DEP17-008 | Excel rejected n/a and coerced whitespace/booleans into numbers. | One pure policy module serves editor, workbook and owner. Blank/n/a/(n/a)/null mean unavailable;0 remains offered-zero; finite half periods0–100 remain valid. Boolean/object/invalid fraction inputs reject. Formatting-only changes do not consume the32 changed-row budget. Metadata/revision/known-row/column/500-edit guards remain. |
| DEP17-009 | Sparse splits rejected; blank counts imported as zero. | Known sparse subject splits save; explicit blank/null counts clear to an empty value, never zero. Enabled remains boolean; integer counts and remarks are bounded. Exported rows match the existing visible teaching policy, including TG-only codes. Hidden/inactive values remain stored. |
| DEP17-010 | Legacy stored n/a conflicted with expected:null. | Compare supported equivalent representations only at the touched-field boundary. Unknown legacy content remains available for correction. True stale values/revisions/fences, changed operation intent and missing current capability still reject. |

The [original audit](https://github.com/helper-gsps/gsis/blob/84e1f2882160cf9755be52c832f37a111073304f/docs/coordination/tasks/v1-deploy-subject-load-audit.md) records18 diagnostic cases and pinned source references. No exact hosted failed payload was read. v0.9 model_ fills missing standard subjects as null; its editor displays the subject union and parses n/a. FT is the original internal aggregate; LSP follows ordinary subject/TG rules. No v0.9 files are edited.

## Preservation and visible changes

Raw owner rows remain the save/CAS baseline. No loadVersion/inflate rewrite or blanket assignment migration is introduced. A note-only/unrelated save does not persist load normalization or change FORM/TG records. Calculations/XML use a separate derived view. Sci/Science and PE/PHE counterpart keys are not invented; real stored alias conflicts stay explicit. Immutable publication payloads and captured workload are untouched.

The v1-owned editor keeps the v0.9 table/keyboard pattern and native queue/recovery. It shows standard/global subject columns with n/a for missing cells, one calculated FORM and read-only PD. Actual legacy references/nonzero values show a review notice; unused zero/null remnants do not. Ambiguous historical FORM/FT arrangements remain retained, not guessed. Subject labels change only on subject views; dialog/fortnight field FT keeps its original meaning.

The builder changes only script inclusion/types. Product logic lives in v1 modules. No release label, schema, permission, dependency, allocation policy or deployment workflow changes. Omitted fields never clear data; preview/validation never saves or publishes.

## Actual verification

All commands use TZ=Asia/Singapore and synthetic identities. `node tests/v1-product-deploy-loads.mjs` passed against actual built Workers/local D1: sparse/custom/legacy inputs, null/zero/half periods, bounds/prototype inputs, atomic rejection, school/session/capability/revision/fence checks, exact retry/changed intent, explicit split clears, note-only isolation, retained FORM/class/TG records, canonical IP export/preview/apply/replay and unchanged stored publication evidence. Bootstrap reports FT=5; aSc preview has three component events totalling5.

`GSIS_BROWSER_EXECUTABLE=/usr/bin/chromium node tests/v1-product-deploy-loads-browser.mjs` passed against the actual built browser/native Worker/D1 path: LSP/legacy saves and reload, invalid draft retention, FORM/PD displays, real XLSX export/upload/import, visible/workbook fortnight membership, retained hidden splits/raw FORM/TG state and XML projection without snapshot mutation. Final assertions also protect computed FORM versus Legacy FORM headers, unchanged unrelated dialog/fortnight FT fields and quiet unused zero/null legacy values.

Existing `v1-product-deploy-storage.mjs`, `v1-product-deploy-workbooks.mjs` and `v1-product-deploy-fortnight-browser.mjs` passed locally; canonical build passed with no tracked drift. Storage's Core/Venues dependencies and the old fortnight test's transport use their existing synthetic adapters; these are not hosted proof. Initial new-test failures came from fixture leases/serialization/optional fields and row ordering, corrected without weakening product invariants. Exact-head required CI is recorded in PR evidence.

No hosted staff read/write, provider send, backup activation, migration, publication or deployment occurred. Actual live publication, Drive backup execution, hosted restore, N-1 latency and authenticated UAT remain Not tested. The Versions selector and owner-directed planning eligibility rules are separate tasks.

CI disclosure: first Node run44053547444 at `9d175e0` passed1,226/1,227 programs; only the existing settings-workbook fixture failed because it injected the new ES module as a classic script. Three shards and their LORD checks passed; the failed shard did not reach LORD. After accepted scope clarification `2a568d1`, both fixture pages load the unchanged production module and dependency normally. All old assertions remain; the targeted fixture passed. No product code changed for this correction. The existing full native save-recovery browser regression also passed locally. Final exact-head Node/LORD and product CI are rerun and reported in the PR.
