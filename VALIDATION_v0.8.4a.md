# v0.8.4a validation

All 14 targeted relief-pool regression checks pass. They cover supplemental SENOs, legacy rows without saved flags, real missing R, stale identity flags, broken baseline identity joins, numeric quotas on excluded staff, quota observations, recess-duty selection, browser candidate/class-combination parity, explicit eligible ad hoc activation, Calendar verification and saved manual allocations.

The full comparable gate ran 513 scripts: 507 passed initially. Five failures exposed synthetic Contacts fixtures that omitted the authoritative eligibility boolean; four fixture files now explicitly represent eligible teaching staff, with all assertions retained. The sixth exposed a build version boundary: canonical Deploy stays at 0.8.4 while the generated Roster component is stamped 0.8.4a. All six failed scripts passed on the final focused rerun, along with the shared cell-save fixture and the 14-case patch regression script. All 513 scripts therefore pass across the full run and the eight-script final rerun. No runtime eligibility rules were weakened to satisfy legacy fixtures.

Raw results are in `verification/084a-node-results.json` and `verification/084a-focused-results.json` in the source patch and repository bundle. Independent correctness and code-quality reviews found no unresolved material findings. The syntax gate parsed 81 Apps Script files as ES2020 and rejected the known logical-assignment regression.

Package verification checks exact two-component scope, standalone Roster backend role and version, source parity, retained frontend assets, ZIP integrity, SHA-256 hashes, source diff and committed Git bundle identity. The final package is built after the release commit and tag.

These checks use local fixtures and test browsers. No production school data was altered, live service delivery tested or production deployment performed. Refresh the user's 22 October page after installation to confirm the installed result.
