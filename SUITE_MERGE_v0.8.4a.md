# Merge v0.8.4a into the full GSiS suite

Base this patch on v0.8.4 commit `9753648d18dd9d114d78e677cdd4dea57839e66a`. `SOURCE.patch` contains the complete tracked delta; the committed package also includes `GSiS_v0.8.4a_Incremental.bundle` with the release commit and tag.

The canonical runtime changes are in `shared/roster-allocation.js` and `shared/roster-stapler.js`. Generated copies in `backend/Code.gs` and Roster browser assets must match those sources. The standalone Roster artifact uses fixed `GSIS_BACKEND_KIND='roster'` and receives its own 0.8.4a backend version at build time. The shared source retains the Deploy role and Deploy component version 0.8.4 for future full-suite generation; its Roster actions remain guarded.

Retain item 095 from `GSiS_Queued_Changelog.md`, the regression file and this patch's build/verification support when making the next whole-suite release. Preserve all unrelated v0.8.4 changes, including the backend split, PAL rules, report-absence improvements and IP Deploy focus retention.

Only the Roster frontend and Roster backend receive component version 0.8.4a. All other installed component versions stay at 0.8.4. The separate notification Worker continues calling the same standalone Roster URL and does not require replacement.

Build with `python3 scripts/build-component-patch.py`. For source preparation before testing, use `python3 scripts/build-release.py --sync-only`. Final packaging follows the reviewed source commit and annotated tag `v0.8.4a` and includes the verified incremental bundle. Existing data IDs, owner gates and secrets are retained.
