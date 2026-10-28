# GSiS v0.8.5 release plan

Authorised by the request to investigate Sim Lan's interaction, fix the bug and commit the next full suite with a thorough read/write, speed and concurrency audit. Source base: `c98d377c9d032e19dcf9588a9f7faceeadb018ee` (v0.8.4a).

## Integration scope

1. Preserve the v0.8.4a relief-pool correction and v0.8.4 backend ownership split.
2. Implement queued absence coverage without a baseline, preserving later relief planning and editing on the same record.
3. Include the tested item097 two-stage timetable preload and latest-confirmed teacher browse behavior.
4. Reproduce and fix the 3HCL1/Fayth retained-draft Review/Retry path without losing unrelated edits or replaying uncertain writes.
5. Audit each suite owner for read/write granularity, lock span, receipts, cache invalidation, compression and local processing; fix supported findings.
6. Obtain independent correctness and structural-quality review, then run appropriate focused and full-source checks.
7. Prepare the full deployment package and verify membership, source parity, all retained assets, manual figures, SHA256 checksums and committed Git history.

## Coordinated packaging sequence

Wait until canonical source edits are settled before the version command. Run `python3 scripts/bump-release.py 0.8.5 --from-version 0.8.4 --from-component-version 0.8.4a`. Set package scripts back to `python3 scripts/build-release.py` and `python3 scripts/verify-release.py`; set package kind to `full-suite`, every component version to `0.8.5`, and remove obsolete `gsisPatch*` keys. Keep write protocol 500 and all included assets.

Run source sync, then the source gate with explicit environment/dependency paths. Complete final documentation using actual evidence. Build a candidate package and run `node tests/package.cjs`. Create the authorised source commit and tag, create the complete repository bundle at the path expected by the builder, rebuild, and rerun the package gate against the archive containing that bundle. Save the completed deployment archive and wider changelog through the existing artifact workflow.

Do not deploy production code or mutate school records as part of packaging. Do not repeat a completed Roster cutover or create a second writer. Do not include raw school snapshots or credentials in source/verification archives.
