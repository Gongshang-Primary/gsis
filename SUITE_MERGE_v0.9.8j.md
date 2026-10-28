# Revision J suite merge

Baseline: I `f512ac6f584c26a027c1cf2aefb3b19d01fd6838`. Keep foundation provenance `703d3975e05d64acc512511ae2d09b0942cc900c` independently of the patch baseline. Google remains authoritative; no live deployment or storage migration is part of this release work.

## Source and inventory

Canonical sources own the runtime. The controller harmonises the existing 17 labels to J and generates shared mirrors, combined backends and Worker bundles only after authors finish. The optional production `calendarJobWorker` is the 18th component, shipped as `GSiS_Calendar_Job_Worker_v0.9.8j.txt` with `Calendar_Jobs_schema.sql`, `Calendar_Jobs_wrangler.example.jsonc` and `Calendar_Jobs_README.md` helpers. It is production infrastructure when configured, not rehearsal.

Functional components are Roster frontend/backend, Calendar frontend/backend, Venues backend and the optional Calendar job Worker. Deploy backend, notification Worker and Operations Worker retain embedded shared-helper parity; the remaining products have matched labels. Keep Operations restricted to existing deployments, and keep Calendar direct mode without `CALENDAR_JOBS` until its dedicated infrastructure is configured.

## Archive sequence

1. Finish canonical sources and independent review. Controller runs generation and appropriate focused/full gates. Record exact results and inherited failures without weakening assertions. Pending J evidence must be replaced before claiming completion.
2. Copy `GSiS_v0.9.8i_Rehearsal.zip` byte-for-byte from the retained I complete release into the sibling deliverables directory. Do not regenerate it from J shared helpers. Its expected SHA-256 is `f3ee66bc4bb8171a6440b7e0b25ca1e8032f54a0cf38a8f41af28bdb83ce5522`.
3. The canonical rehearsal verifier recovers I rehearsal/shared/build/setup/docs paths from `gsisRehearsalSourceBase` into temporary storage and rebuilds there. It checks source/manifest hashes even though the host production release is J. A filename/version mismatch never bypasses canonical verification.
4. Commit and tag J. The controller records the actual commit/tag in the external verification receipt; do not claim a final source hash in a self-referential committed file.
5. Run `python3 scripts/build-component-patch.py --no-sync` and `python3 scripts/verify-component-patch.py`. The manifest includes all 18 production components, identifies the optional Calendar Worker, and references the separate I rehearsal ZIP by hash with `productionInstallation: false`. Rehearsal remains outside the production archive.
6. Run `python3 scripts/package-suite.py`. Its real component verifier must pass first. The suite contains the production ZIP, unchanged separate I rehearsal, tracked source ZIP, full reachable release history bundle and current guides. The history bundle needs no prerequisite repository; older missing objects are not invented.
7. Verify final source/tag identity, component/helper hashes and fresh clone/fsck/recovery. Record raw command results, archive hashes and unperformed cloud checks in external `RELEASE_VERIFICATION.json`.

## Evidence boundaries

The restored I comparison passed five focused programs and reproduced seven nonpasses, as recorded in `j-baseline-evidence.json`. Three response-size programs retain the 3,073 versus 3,000-byte failure; baseline browser cases currently stop at missing browser executables, separately from earlier historical-object limits. Never recast pending J gates as I passes. Cloudflare deployment, actual D1/R2 persistence, production peak-hour latency and provider delivery remain unverified. No real production records or credentials belong in source or artifacts.
