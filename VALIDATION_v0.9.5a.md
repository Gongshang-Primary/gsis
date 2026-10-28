# Validation: v0.9.5a STAPLER patch

## Passed

* 48 of 49 STAPLER test scripts passed. This includes both new v0.9.5a regressions, save/confirm/reopen, existing import and contact creation flows, leases, concurrency and read-only views.
* Six new domain checks cover all non-MK staff, MK classification variants, active/inactive support persistence, no external relief activation for ineligible staff, eligible SRE behaviour and server rejection of forged MK additions.
* New picker regression covers partial case-insensitive search, name modifiers, explicit selection, stale-selection rejection, duplicate suppression, save/reopen, empty results and read-only access.
* Real Chromium smoke checks passed at 1280 x 900 and 390 x 844 with actual styles/scripts. No page errors, extra network writes or horizontal overflow. Mouse and keyboard selection both passed.
* All 14 existing relief-pool regression checks passed. Roster D1 operations/migration/integrity tests passed.
* All 34 LORD verification programs passed with the test browser configured.
* All 13 browser scripts that initially lacked a browser passed after the local test dependency was supplied.
* Apps Script syntax: 186 files parsed successfully. Canonical runtime generation and notification bundle parity checks passed.
* Independent source review found no blocking issue in the changed STAPLER behaviour.

## Limitations

`tests/stapler718a-relief-import.cjs` is blocked before its assertions because it requires historical Git source at commit `32d2c2d17621319ba1d57aea34046229544f5513`, which the supplied source archive does not include. No substitute historical source was invented.

The broad `npm test` attempt exited nonzero and did not produce a usable final aggregate. Its captured log reports 152 passing scripts, 13 missing-browser failures and a package check invoked before the patch package was built. The browser failures passed on rerun, and the built package was checked separately. A clean full-suite run is not claimed; the complete scoped STAPLER results above are the release evidence.

The installed gstack review checklist resource and Thermonuclear skill were unavailable. Superpowers regression checks, pstack tracing, Improve review, scoped Ponytail simplification principles and Vercel review criteria were used where applicable.

The existing component verifier checks archive integrity, exact deployment scope, every frontend file, bundled assets, backend source parity and member hashes. No live school system or staff record was changed; live production testing and deployment remain outstanding.
