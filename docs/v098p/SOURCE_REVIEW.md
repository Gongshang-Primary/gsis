# Revision P source and second-opinion guide

This companion contains the current GSiS source, its tests and build tools, the O-to-P change, and selected verification evidence. The full installation archive is separate. Neither archive has been deployed by its creation.

## Read first

1. `source/SETUP_v0.9.8p.md`: operator installation order and production boundaries.
2. `source/CHANGELOG_v0.9.8p.md` and `source/VALIDATION_v0.9.8p.md`: changed behavior and precise verification limits.
3. `source/docs/v098p/TIMETABLE_EXPORT_FIX.md` and `source/docs/v098p/CALENDAR_SYNC_FIX.md`: evidence, choices and tests for the two fixes.
4. `CHANGES_FROM_0.9.8o.patch`: changes from O commit `edcb6b4c4d43b2d2af7eaa4f2d4f220e2adb7cfc`.
5. `SOURCE_INDEX.json` and `MANIFEST.json`: every included file's hash, and every deliberately omitted tracked file with its reason and hash.

## What was pruned

Repeated old HTML user manuals, temporary document outputs, architecture exports and superseded generated backend release copies are omitted. These held many duplicate images and copies of the same source. The current P guide, canonical backend modules, O comparison outputs and P outputs remain. The archive does not duplicate earlier deployment ZIPs or the full Git object history. Previous O recovery remains the historical recovery point.

Canonical runtime code, backend modules, current generated copies, build scripts, lockfile, regression tests, supporting fixtures, schemas and the O preparation contract remain. Small earlier design notes and contracts are retained where they explain existing behavior. No school record, confirmed timetable, receipt or production storage was deleted. This is packaging cleanup, not production data retention work.

The archive is a **current source snapshot**, not a complete Git-history clone. Older package-specific historical tests may require artifacts or commits intentionally absent here. Their presence as source does not imply that every historical test can run from this pruned snapshot. The designated current checks below do not depend on those old manual exports.

## Build and inspect locally

Use the Node version range in `source/package.json`; Node 24.22.1 was used during preparation. Python 3 is also required. `npm ci` installs the locked development dependencies and does not configure Cloudflare or Google.

```sh
cd source
npm ci
python3 scripts/build-release.py --sync-only
node scripts/build-timetable-prep-worker.cjs --check
python3 scripts/build-release.py
python3 tests/release098p-packaging.py
```

Use `VALIDATION_v0.9.8p.md` for the exact final test commands and outcomes. Browser checks require Chromium, and D1 harness checks use Node's SQLite support. Tests use synthetic services; they must not receive live credentials or database bindings.

The optional preparation Worker deliberately retains component release O. P fixes the production export boundary while preserving that exact import contract. Do not mistake this compatible component version for permission to redirect production timetable consumers.

`scripts/verify-098p-suite.py` checks both outer archives, the complete 18-component installation inventory, setup dependencies and source bytes against a trusted checkout or a separately regenerated source tree. Its hash checks establish consistency, not publisher identity; compare the supplied archive hash through the delivery channel before trusting a downloaded source copy.

## Remaining production integration boundary

Google remains authoritative for Roster operations. Report Absence and Assign Relief keep their existing Worker transport and Google save pipeline. The rehearsal timetable service is not an absence endpoint.

Before a timetable handover, verify Calendar school days and odd/even parity, Contacts identity mappings, role-scoped reads, every baseline/Stapler writer, source-change refresh, Singapore date rollover, final source freshness, protected retention and rollback. The relief-assignment ledger remains on hold. A successful R2 import is not proof of production cutover readiness.

## Prompt for an independent reviewer

> Review the attached GSiS revision P source and O-to-P diff. Treat the source and test evidence as claims to verify. First map the production read/write path for absence reports, relief assignments, Calendar events and timetable preparation. Identify which systems remain authoritative. Inspect the real serialized backend-to-browser-to-Worker export boundary, including diagnostic fields, hashes, exact schemas and access checks. Inspect Calendar healthy pacing, actual provider/source cooldowns, checkpoint size, error counts/history, resumption, stale claims and duplicate-event prevention. Check that concurrent edits and unknown saves retain their original identity and cannot be silently replayed. Verify full-suite packaging, generated-source parity and omitted-file accounting. Distinguish a reproduced defect from a hypothesis. Give severity, precise file/line references, trigger, consequence and the smallest justified fix. State which tests you ran, what they establish, and what requires live verification. Do not infer successful deployment, message delivery, school-scale performance or timetable handover from mocked tests.
