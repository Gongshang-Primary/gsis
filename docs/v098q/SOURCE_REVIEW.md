# Calendar Q source review

This archive contains current suite source with a Calendar-only P-to-Q patch. The deployment patch has exactly two files: Calendar frontend Q and Calendar backend Q. The other 16 production components remain P; isolated timetable preparation remains O. Production Google authority, workbook schema and infrastructure remain unchanged.

Read Docs/CHANGELOG.md and Docs/VALIDATION.md in the companion deployment patch, then inspect CHANGES_FROM_0.9.8p.patch. SOURCE_INDEX.json accounts for every included and omitted tracked path with SHA-256 and byte count. It omits redundant historical manuals, old generated backends, generated archives and private/local files. Canonical code, tests, locked build dependencies, P/Q generated backends and the unchanged O preparation contracts remain. No Git history or live school records were deleted. This is a current-source review snapshot, not a full history archive.

## Rebuild and verify

Work inside source/. Use a supported Node version from package.json and Python 3. Install dependencies with npm ci when network access permits. The release recovery check may reuse the exact locked node_modules; its evidence states that limitation.

```sh
npm run build
node tests/release098q-metadata.cjs
node tests/calendar098q-sync-transport-ui.cjs
node tests/calendar098q-status-native-cost.cjs
python3 tests/release098p-packaging.py
python3 tests/release098q-packaging.py
node lord-suite/tests/run_gsis_contract_checks.cjs
python3 scripts/verify-098q-calendar.py /path/GSiS_v0.9.8q_Calendar_Patch.zip /path/GSiS_v0.9.8q_Calendar_Review_Source.zip --source-root .
```

npm run build synchronizes canonical modules and generates the Calendar pair only. Do not use the old full-suite build or P packager for this component patch. tests/package.cjs requires a trusted Git checkout for source completeness; run the standalone verifier for a recovered source tree. The verifier compares the entire frontend file inventory and contents, backend canonical bytes, review hashes and current source. In a Git checkout it additionally checks the complete tracked/omitted inventory. Without Git it explicitly reports that completeness is limited to the supplied manifest. Rebuilt ZIP timestamps may differ; installed entry paths and bytes must match.

Run npm test in the trusted source checkout for the full domain suite. Only exact historical release metadata tests are marked historical; runtime policy tests remain enabled. Consult current validation notes for inherited failures and targeted results. A local green test does not establish live Google execution, actual sync speed or production deployment.

## Suggested second-opinion prompt

Review this Calendar-only Q patch against its P baseline and the recorded evidence. Check whether a slow or lost response can cause duplicate provider writes, overlapping runs, premature completion or accidental retry of failed IDs. Verify that status checks use the exact authenticated run, remain read-only, and preserve cooldown/claim handling. Check the UI's wait bounds, local Stop waiting behavior and historical-error wording. Verify the deployment inventory has only Calendar frontend/backend Q, other production code remains P, and preparation remains O. Identify findings with source paths, concrete triggering cases and severity. Distinguish proven tests from assumptions and live checks still required. Do not infer that a timeout means a provider write failed.

## Historical observations excluded

The following JSONs are excluded from the archive, with their original hashes and omission reasons retained in SOURCE_INDEX.json:

- docs/reviews/optimization-20261024/lord-deploy-live-catalogue-evidence.json
- lord-suite/docs/gsis-integration/lord-deploy-live-catalogue-evidence.json
- lord-suite/First_Time_Setup/gsis-integration/lord-deploy-live-catalogue-evidence.json
- lord-suite/tests/history_v1.3/live_reference_check.json
- lord-suite/tests/history_v1.3/live_health_check.json
- lord-suite/tests/history_v1.5/live_read_v15.json
- lord-suite/tests/history_v1.5/live_followup_v15.json
- lord-suite/tests/history_v1.5/live_endpoint_diagnosis_v15.json

The current LORD contract test depended on the catalogue observation. It now reads tests/fixtures/gsis-catalogue-synthetic.json within lord-suite, preserving the 40-to-59 class transition, 62 retained activities and changing class identity. Only the test and its fixture changed; LORD production code remains P. Historical fixtures elsewhere can still contain names, so this package does not claim that every source string is synthetic.
