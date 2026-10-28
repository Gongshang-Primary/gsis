# v0.7.018a validation

Baseline: v0.7.18, commit `32d2c2d17621319ba1d57aea34046229544f5513`. Scope: final offline Relief overlay and Assign Relief readability. Validation performed locally on 20 October 2026, Singapore time.

## Supplied file and persistence

The original `2026 Oct 21 P5 Higher Mother Tongue Languages Paper 2 EYE - saved 2026 Oct 19 2208h.json` reproduces the exact v0.7.18 rejection. The patched importer matches an independent oracle based on the attached offline v4.3 Relief Excel export: 722 populated final cells, including 17 absent periods and six covered periods. An additional online-only synthetic teacher retains its baseline. The input JSON is unchanged; no staff fixture data is copied into this release.

Signed backend tests use a fresh Apps Script VM for each request and a disk-backed operations document. Both the supplied file and a synthetic capped-teacher case pass Save, fresh-runtime reload, exact receipt replay and Confirm. Saved plans use the existing durable compressed representation. The checks verify no absence records, assignment history, relief credit or notification jobs are created by import. A separate school-sized persistence regression exercises failed writes, lost acknowledgements and corrupt reads.

Focused checks cover blank represented days, missing-teacher fallback, aliases, explicit fuzzy matching, swaps/dropped lessons, repeated import, stale decision signatures and atomic rejection of conflicts. Absence/dropped annotations remain unavailable, contribute no teaching workload and create no duplicate relief demand. A subsequent absence of the covering teacher still generates demand for their final lesson. Covered subjects with parenthesised teacher names remain classifiable.

## Checks run

All of these checks passed:

- `tests/stapler718a-relief-import.cjs`, with the supplied JSON path.
- `tests/stapler714-import.cjs`.
- `tests/stapler714-import-ui.cjs`.
- `tests/stapler714-import-browser.cjs`, real Chromium.
- `tests/stapler715-persistence.cjs`.
- `tests/stapler716-canonical.cjs`.
- `tests/cap708.cjs`.
- `tests/roster714-allocation-policy.cjs`.
- `tests/roster710-allocation-preferences.cjs`.
- `tests/roster718a-relief-readability-browser.cjs`, real Chromium at desktop and phone widths, including search and keyboard assignment.
- `tests/roster711-workspace-ui.cjs`.
- `tests/apps-script-syntax.cjs`, 56 Apps Script files parse as ES2020.
- `tests/hotfix718a-package.py`, committed source/tag, checksums, incremental history, all frontend files and unchanged assets/components.

`git diff --check` passes. The three shared Roster modules are byte-identical to their generated frontend copies and embedded backend blocks. A separate reviewer independently ran the new importer test with the actual file and found no remaining blocker. The review led to fixes for capped absence cells, nested parentheses in cover labels and duplicate demand.

## Limits and installation

These are local tests, not a production deployment or measured live latency result. The baseline-save and retained-plan recovery incidents from earlier releases remain separate live acceptance cases. No existing school plan was reset or deleted. No staff messages were sent.

Install the supplied Deploy backend and Roster frontend, retaining the same deployment URL and settings. Then import the matching date, review, Save, Confirm and reload. The planned v0.7.19 merge is recorded in changelog item 031.
