# GSiS 0.9.9 full-suite release

Start with [README.md](README.md) and the [existing-school setup guide](docs/v099/SETUP.html). The [changelog](CHANGELOG_v0.9.9.md), [validation record](VALIDATION_v0.9.9.md) and [handover](docs/v099/HANDOVER.md) identify the implemented scope, executed checks and remaining operator work.

All nine frontends, six Apps Script backends and three production service Workers use 0.9.9. The separately versioned timetable preparation package remains administrator-only and shadow-only. Production Roster stays Google-first; Calendar keeps its Google source. Preserve existing destinations, settings, records, receipts and credentials. Optional Calendar push requires the explicit setup described in the guide; `CALENDAR_SYNC_CONTINUE` stays false.

Build with `npm run build`, verify the current contracts with `npm test` and run `node tests/package.cjs` for a local preview package. Final packaging uses `python3 scripts/package-099-suite.py --evidence-dir verification/v099` after the release source is committed and `v0.9.9` identifies HEAD. The final mode requires a clean source tree; `--preview` marks an uncommitted candidate.

The source review archive carries current code/tests/build dependencies, required historical comparison fixtures, concise recovery history, the Q-to-0.9.9 parent diff and an included/omitted SHA256 index. It does not erase repository history or live records. Use `scripts/check-099-recovery.py` for a fresh non-Git reconstruction and archive comparison; its dependency reuse and provenance limits are explicit.

Building, testing and packaging this release perform no deployment, infrastructure activation, school-record mutation, notification send or production authority cutover. Consult the final validation and manifests for the exact verified source and artifact hashes.
