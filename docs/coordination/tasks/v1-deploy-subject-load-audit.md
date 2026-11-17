# Deploy Subject Load, LSP and FORM investigation — 17 November 2026

- Model/owner: Codex; coordinator: ChatGPT. Functional fixes retain Muse exact-head review.
- Recorded: 17 November 2026, 16:47 SGT (Asia/Singapore).
- Status: investigation complete; findings OPEN; no application fix or deployment performed.
- Branch: `codex/v1-deploy-subject-load-audit`. Base/released source: `06d71e5852076903f708abda264c4e8682d815d8` (v1.04).
- Exact claimed file scope: this task record only. It also holds the dated bug changelog; no product, test, build, workflow, configuration or migration path is changed.
- Owner request: investigate Subject Load saves, possible missing `n/a` handling, LSP save failures and adjacent operations. Owner clarification: FORM is the catch-all for Assembly + FTT + FTGP.
- Publication: a bounded documentation-only claim/investigation branch. No protected-main advancement or implementation is attempted; the earlier release-record main-ref rejection is not bypassed. Future implementation needs its own accepted bounded claim and PR.
- Open PR inventory: only PR182, a v0.9 draft; no overlapping v1 application PR. No v0.9 source is edited.

## Confirmed findings

| ID | Area | Confirmed current behavior | Status |
| --- | --- | --- | --- |
| DEP17-005 | Subject Load / LSP / sparse levels | The UI renders the union of subjects across all levels. A missing per-level cell looks like editable `n/a`; the Worker requires that exact property to exist and returns 400 `Unknown subject load.`. Defaults omit LSP and other original subjects. A sparse LSP present in P2 but absent in P1 fails in the real built browser and owning D1 path. Adding that already-existing subject also fails, so the UI has no repair route. | OPEN; reproduced |
| DEP17-006 | FORM / FT aggregate | Assembly=1, FTGP=2, FTT=2 produces internal FT=5, while independently editable FORM remains 0. Workload and aSc expand FT only. FORM currently behaves as another ordinary teaching subject, contrary to the owner's aggregate definition; naive aliasing risks double demand/workload/export rows. | OPEN; reproduced and source traced |
| DEP17-007 | PD reference | The settings page creates an editable PD input even when the saved level has no PD/TTT property. Saving it returns the same 400. The page describes PD as reference-only, with PLT membership supplying its periods. | OPEN; reproduced |
| DEP17-008 | Load Excel import | The actual built settings-workbook parser rejects literal `n/a`, although the editor accepts it. Whitespace becomes numeric zero and boolean true becomes one. Its exported rows include only existing per-level keys, so it cannot repair an omitted LSP cell. | OPEN; reproduced in built browser parser |
| DEP17-009 | Fortnight adjacency | A split for a subject absent at that level is rejected with 400 `Invalid split field.`. The workbook includes rows the visible editor filters out, and an explicitly blank/null numeric cell becomes zero. | OPEN; missing-key and null-to-zero paths reproduced; row-filter discrepancy source traced |
| DEP17-010 | Legacy stored `n/a` | A legacy string `n/a` stored in synthetic D1 conflicts with the browser's parsed `expected:null`, returning 409 `REVISION_CONFLICT`. Semantically equivalent not-offered values are not normalized consistently. | OPEN; reproduced |

`n/a` is already supported for a known canonical cell: the editor sends null, and the native Worker accepts it. Numeric zero remains a distinct offered-at-zero value; a half-period value saves; a negative value is rejected. A request containing a valid Math change plus an invalid LSP change rejects the whole batch without changing D1. The original failed save reference and queued browser draft remain retained. These are preserved behaviors, not new fixes.

The owner's screenshot displays v1.03. The same defects were reproduced against released v1.04 source; refreshing the label alone cannot correct them. The exact hosted failed payload was not inspected, so no claim is made that LSP or PD was the particular failing edit in that screenshot.

## Source comparison and adjacent operations

- [v1 setLoad](https://github.com/helper-gsps/gsis/blob/06d71e5852076903f708abda264c4e8682d815d8/v1/services/deploy/model.mjs#L826) checks per-level property existence before value validation; this is not PR201's planning-field codec path. [Defaults](https://github.com/helper-gsps/gsis/blob/06d71e5852076903f708abda264c4e8682d815d8/v1/services/deploy/model.mjs#L38) omit LSP and add independent FORM.
- [Original editor](https://github.com/helper-gsps/gsis/blob/06d71e5852076903f708abda264c4e8682d815d8/public/app.js#L923) accepts blank, `n/a` and `(n/a)` as null and numbers 0–100 in half-period increments. It presents FT read-only and PD as an input. The union of subjects can expose absent properties.
- [v0.9 normalization](https://github.com/helper-gsps/gsis/blob/d9d180ced16d32c836a94d67d9cff8d3030eb21d/backend/Code.gs#L677) fills missing standard FT/LSP/FEL/LSM/FMA/CCE/MTSP/FSC/language subject keys as null for every level. Save checks remain separate. The inspected canonical v0.9 files match that pinned source.
- [Settings workbook](https://github.com/helper-gsps/gsis/blob/06d71e5852076903f708abda264c4e8682d815d8/v1/web/shared/deploy-ui-tables.js#L329) uses Number conversion instead of the editor's load parser; [fortnight parsing](https://github.com/helper-gsps/gsis/blob/06d71e5852076903f708abda264c4e8682d815d8/v1/web/shared/deploy-ui-tables.js#L371) converts null counts to zero. Settings imports use the native atomic change route, not the separate canonical publication workbook schema.
- [Workload](https://github.com/helper-gsps/gsis/blob/06d71e5852076903f708abda264c4e8682d815d8/shared/workload.js#L144) and [aSc export](https://github.com/helper-gsps/gsis/blob/06d71e5852076903f708abda264c4e8682d815d8/shared/asc-export.js#L60) expand FT into the three component subjects. FORM is not an existing alias. Workload demand, types, fortnight and XML must be checked together when implementing the owner's FORM definition.
- LSP otherwise follows ordinary subject placement, default Both. A single-level TG can inherit Subject Load or use explicit weeklyPeriods; a multi-level TG requires an explicit period count. Missing load and missing class scope are different conditions. Those teacher/TG paths were source-inspected, not exercised by this probe.
- Add subject and add level initialize values to null in v1, versus zero in v0.9. Neither default may be changed casually: null means not offered and zero means offered. General rename/delete was not found; guarded legacy conversion/retirement preserves references/history. Subject Type accepts a globally existing sparse LSP even while that level's Load/Fortnight saves fail.

## Actual verification and evidence limits

Applied the installed Pstack root-cause skill (`c12/principle-fix-root-causes`): reproduce through actual boundaries and inspect the same pattern in adjacent paths. No architecture/dependency changes or new UI text patches were made.

Command actually run with TZ=Asia/Singapore: `GSIS_BROWSER_EXECUTABLE=/usr/bin/chromium XDG_CONFIG_HOME=/tmp/gsis-load-probe-config WRANGLER_LOG_PATH=/tmp/gsis-load-probe-wrangler.log node /tmp/gsis-subject-load-probe-20261117.mjs`. The private diagnostic imports the repository's existing real nine-Worker/D1/browser fixture. Its 18 diagnostic cases completed, asserting the current successful and failing behavior listed above. This is reproduction evidence, not a green acceptance test of corrected code.

The first browser attempt hit the diagnostic's own earlier lease; the fixture was corrected to expire that synthetic lease before the independent browser client. The completed run reproduces the actual LSP validation error with no browser script errors, and confirms the draft/flight recovery controls are retained. Synthetic sparse/legacy rows were seeded only in isolated local D1. All external browser requests were intercepted by the existing fixture; no school records or provider calls were used.

Direct Worker results: known numeric/null edits 200; negative value 400; missing LSP/PD 400; mixed batch 400 with unchanged D1; known aggregate components and numeric fortnight 200; sparse existing subject add 400; sparse fortnight 400; sparse Subject Type 200; legacy `n/a` expected mismatch 409. The built workbook parser cases are browser-boundary checks, not an actual Excel file upload or hosted import test.

Private diagnostic result: `/tmp/gsis-subject-load-probe-20261117-result.json`. Reproduction recipe: create a synthetic version using the existing integration fixture; send native leased `/api/deploy/change` requests with setLoad; seed only its local P2 loads row with LSP:null while omitting P1 LSP; open actual built Subject Load; edit P1 LSP and Save. For workbook checks, pass a saved synthetic document to the built `GSISDeploySettingTables.workbook/validate` methods, changing one existing cell at a time.

No full regression suite, canonical rebuild, post-fix test, hosted UAT or authenticated hosted read/write was performed for this documentation-only investigation. No Git product path changes, no hosted migration, no provider send, no deployment. F5 remains OPEN; T1B-01/T1B-02 and runtime UAT remain Not tested.

## Bounded implementation handoff

Normalize missing per-level subjects and legacy not-offered representations without turning omitted/untouched fields into clears. Reuse the same load parsing rules for the editor and workbook, retaining null versus zero. Make PD genuinely reference-only. Treat the owner's FORM as the existing derived FT aggregate across its consumers, avoiding a second independent counted subject and preserving historical records explicitly. Align fortnight visible/exported rows and explicit blank semantics. Keep identity, current capabilities, school isolation, revisions/fences, original operation identity, atomic saves and lost-response recovery unchanged. A functional fix needs a separate bounded claim, real browser/Worker/D1 regressions and independent exact-head review; this investigation does not mark any defect fixed.
