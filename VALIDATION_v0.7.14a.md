# v0.7.14a validation

Scope: targeted validation of the two changed components, based on the verified v0.7.14 release. The full suite was not rebuilt or rerun.

## Passed

21 focused Node test scripts passed, including the Apps Script syntax gate for 42 sources. Coverage includes Stapler import, model and backend save/confirmation, actual Excel export, employment caps, accounting, permissions, absence concurrency, diagnostics, saved settings and dated editing leases. The machine-readable result is `verification/714a-targeted-tests.json`.

One real Chromium browser script passed. It checks the name resolution dialog, empty selection rejection, TTB labels, fuzzy suggestions without preselection, keyboard selection, 390 px mobile layout, draft save, source differences, invalid placement atomicity and absence of publication or global Name Bridge writes. Its report is `verification/714a-import-browser.json`.

All five supplied JSON files were tested against online baselines whose source lesson fields were deliberately changed. Final placed tile counts were 708, 656, 694, 746 and 801. The tests also verified teachers with blank days, an online-only teacher retaining baseline, reimports, backend saving and no phantom relief usage. The RECESS file retained all 36 staffed RECESS tiles.

The operations regression confirms that online absence records remain effective, cover demand comes from imported lessons, imported duties block availability, removed baseline lessons do not return as demand, and Excel receives the same confirmed day. Later edits and transfers still enforce absence and published-cover guards. Saved imported cards remain editable through the normal online flow.

An independent source review found no blocking issue in the changed model, operations or UI. Ponytail and Pstack were used. Thermonuclear was not available in this session; no Thermonuclear execution is claimed.

## Packaging gate

`tests/hotfix714a-package.py` checks the final archive after commit. It verifies all checksums, exact committed source, complete Roster assets, the five changed frontend files and absence of deployment packages for unchanged components.

## Limits

The five files contain no saved offline absence decisions. Nonempty reliefAbsences are explicitly rejected; saved offline attendance and swaps are not claimed as supported. The tests used local simulated identities and reconstructed workbook rosters, not the live school's production data store.

No live deployment, timetable publication, staff message or data reset was performed.
