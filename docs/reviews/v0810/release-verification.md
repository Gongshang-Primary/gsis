# GSiS v0.8.10 release verification

Runtime checkpoint: `80ca4711a5d0ada5fab0dc3ffcb7a9b541a5582e`.

## Completed gates

- 617 current source test programs pass across the broad run and documented targeted reruns. See source-test-results.json and source-verification.md. No new exclusions.
- The full package contains exactly 14 declared files: five frontend ZIPs, four gCodes, one complete Worker TXT, the maintainer guide, the user manual, the architecture HTML and asc-skill.md.
- Package verification checks every member against its source bytes and SHA-256, nested frontend inventories, backend roles/version labels, vendor asset hashes, offline documentation and working manual anchors. The final build is repeated after the documentation commit so archive metadata identifies that commit.
- Archify showcase finalization passed all nine validation checks with zero errors or warnings, delivery, artifact checks and real Chromium browser checks. Receipt: architecture-review-3. Automated visual capture passed containment, readability, viewer chrome and theme checks. Root inspected the 1440x900 light/dark captures; no material route or text overlap was found.
- Source and documentation whitespace checks pass.

## Source provenance

The source is maintained locally and recovered from a Git bundle, not a hosted repository. Archify requires a remote-shaped repository identifier. Its evidence check therefore used a clean local clone of the exact runtime checkpoint, with the explicitly offline identity https://local.invalid/gsis-release-snapshot.git and local-only references. The HTML states this limitation. All 26 cited ranges were verified against the actual committed source. No remote repository was created and the real repository origin was unchanged.

The first Archify attempt rejected the local filesystem origin. A subsequent delivery left a pending recovery marker; a successful serial deliver and complete finalize cleared it through the supported tool workflow. The final artifact has current provenance and no outstanding marker. The installed Archify skill was not modified.

## Deployment boundary

No live deployment or school-data mutation forms part of these gates. Calendar needs CONTACTS_APPS_SCRIPT_URL and CONTACTS_BRIDGE_SECRET as documented. Test its pull and normal Sync Staff workflow after installation. Test draft aSc XML on a new/copied timetable in the installed aSc version. Queue/WhatsApp acceptance and real morning p50/p95 remain operational acceptance checks, not local-test claims.

The detailed user-forum/official-source study remains in docs/research/2026-10-23-performance-research.md in source history; the maintainer guide carries the practical architectural decisions and limits. The new release does not add a second writer, replace durable receipts with a cache, or treat an uncertain provider outcome as delivered.
