# v0.9.4 manual hotfix: authoritative physical room register

**Superseded installation plan, 26 October 2026:** the user chose integration into v0.9.5 instead of installing this separate hotfix. Keep these scripts as implementation and test evidence. The installation steps below are historical instructions, not the current deployment plan. The v0.9.5 release must include canonical source and Worker adapter integration before packaging.

This patch targets the school's diagnosed Apps Script source transport. It reads physical rooms from the `Venues` tab in the spreadsheet selected by **Deploy's `LANDMARK_SHEET_ID`**. Published Deploy references still supply the version identity and effective dates; Roster still supplies timetable occupancy. No spreadsheet contents, published Deploy documents, room-owner grants or bookings are rewritten by the Deploy adapter.

The screenshot confirms EAS Store is D1-06B and Pump Room is D1-06C. Those values are read from the live sheet, not special-cased in code. The existing `readLandmarkRegistry_` helper validates the sheet. All eight standard register columns must remain present, including Capacity basis and Notes.

## Installation

1. In **Deploy Apps Script**, confirm `LANDMARK_SHEET_ID` points to the corrected workbook containing the `Venues` tab. The execution account must have read access. No new properties or secrets are needed.
2. Find the existing `function venuesDeploySource_(envelope)` in Code.gs (or DeployVenues.gs in an unbundled project). Replace that entire function with **Deploy-replacement.gs**. Keep the existing `venuesDeployPublications_` and `readLandmarkRegistry_` helpers. Do not append a duplicate function.
3. Save and update the existing Deploy web-app deployment to a new version, retaining its `/exec` URL.
4. In **Venues Apps Script**, find `function venuesRefreshSources_(force)` in Code.gs (or Sources.gs). Replace that entire function with **Venues-replacement.gs**. Do not replace the entire Code.gs file. The only behavioral change in this function is the publication-cache key.
5. Save and update the existing Venues web-app deployment to a new version, retaining its `/exec` URL.
6. Run `syncVenuesSources()` from the Venues Apps Script editor. On successful completion, reload the Venues viewport. If it fails, use the new execution error to identify the next blocker; this patch does not prove the later timetable stage has succeeded.

No frontend upload is required. No Deploy republishing is required for this room-register correction. A future edit to the Venues tab changes the source key and is picked up on the next source refresh; this is not an immediate cross-application push.

## Safety and scope

- The source key includes both published Deploy references and live room content. Unchanged content keeps the same key.
- The snapshot rereads both authorities and rejects a concurrent change. The Venues refresh also retains its existing final source verification.
- The Venues cache now includes that source key, so an old publication-only cached room list cannot mask live corrections.
- Existing room source IDs remain stable for unchanged unit numbers. Changing a unit number is an identity change, subject to the existing reconciliation rules; this script does not silently transfer bookings or grants.
- This manual hotfix stops with a setup error if Deploy has already cut over to Worker authority. It does not bypass an active cutover fence. The current diagnostic reported Apps Script transport; Worker adapter parity must be completed before a future cutover.
- The canonical runtime source files and generated release bundles are unchanged by this manual hotfix package. Integrate and test the new authority contract across the Worker path before the next full release.

## Verification

Run `node docs/v094/venues-live-register/verify.cjs` from the repository. Local checks cover corrected sheet units, stable source IDs and keys, invalidation after a sheet edit, rejection of stale/concurrent snapshots, duplicate/empty rejection, the Worker guard and the exact one-expression cache change. Production refresh remains to be verified by the deployer.

## Follow-up requested for v0.9.5

Allow authorized Venues administrators to edit the shared physical room register through the Venues viewport. Layout, LORD and Deploy should consume the updated register using revision checks. This UI and cross-application synchronization are queued separately; the manual patch does not implement them.
