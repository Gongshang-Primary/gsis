# release-version-letter: one version label (0.9.9b, then c, d …) on every component, plus a mismatch notice

- Status: implementing, prepared branch; PR waits for an available queue slot.
- Owner/model: Codex (builder), Claude (reviewer; Claude also bumps the letter when building each deploy bundle)
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 30 Oct 2026 21:50
- Branch: codex/release-version-letter
- Base SHA: 16624d4de46caf8b3a1547069eea1e6ab9ab24aa, with current main 9393377c644ee977be2573a94afd28280a06c98b merged for queue context.
- PR: none
- Files/domains owned: scripts/package-099-suite.py (VERSION), version stamps in backends, Roster/Deploy/Contacts/Layout/LORD headers, Worker builds, release tests.

## Background
- Today the labels disagree: Roster header shows v0.9.9a (hand-edited 28 Oct, d588ae6); Deploy header and both backends (`GSIS_DEPLOY_VERSION`) show 0.9.9; Workers carry no visible label.
- 30 Oct deploy: a new Roster backend met an old (cached or not yet uploaded) Roster page. System Config failed with "Set each allocation rule to On or Off." Nobody could see that the two halves were different versions.

## Required
1. **One source:** `VERSION` in scripts/package-099-suite.py becomes the full label, starting `0.9.9b`. The build stamps it everywhere: both backends' `GSIS_DEPLOY_VERSION`, every frontend header (Roster, Deploy, Contacts, Layout, LORD/OVERLORD/STARLORD), both Workers (a `version` field in their health/status JSON), and asset query strings so browsers fetch fresh files.
2. **No hand edits:** a test fails if any header, backend or Worker label differs from `VERSION`.
3. **Mismatch notice:** backend responses already carry or can carry `GSIS_DEPLOY_VERSION`. When the page's label differs from the backend's, show a plain notice at the top: "This page is v0.9.9b; the server is v0.9.9c. Press Ctrl+Shift+R to refresh." Do not block the page for this alone.
4. **Letter rule:** each deploy bundle advances the letter (b, c, d …). After z, ask the owner. The bundle folder, DEPLOY_STEPS title and COMMIT.txt name the label. The release script refuses to build a bundle whose label equals the previous bundle's (record the last label in a tracked file, e.g. `release/LAST_BUNDLE_VERSION`).
5. The existing check that throws "The published backend version differs from the …" keeps working with letter labels.

## Acceptance
- Build with VERSION=0.9.9b: every label reads v0.9.9b; test catches a single hand-edited header.
- Page 0.9.9b against a backend fixture at 0.9.9c shows the notice; equal labels show nothing.
- Bundle build refuses a repeated label.
- Full suite green in the main checkout.

## Current claim

Model: Codex. Owner requested the next two changelog items. This task is prepared on a separate branch while PRs #19 and #20 use both open-PR slots. It builds on the unmerged #20 head; no additional PR is opened until the queue permits it. Claude reviews the exact final head. No merge, deployment, live record change or messages are part of this implementation.

## Implementation and verification

Model: Codex. All 18 component outputs now build as 0.9.9b. The source VERSION stamps production metadata, headers, backend constants, Worker labels and local asset URLs. The shared notice reads actual backend response metadata and does not block operations. Optional Workers expose only their label at GET /health; existing administrative data remains authenticated.

Numeric npm metadata, workbook schemas, historical release documentation and the separately versioned shadow timetable preparation package remain at their own existing versions. Final packaging requires the next letter, places COMMIT.txt and DEPLOY_STEPS.md inside and beside the bundle, and advances release/LAST_BUNDLE_VERSION only after successful archive writes. Preview and component builds may repeat.

Verified locally: full 18-component build; page/header/asset parity; optional Worker health; mismatch/equal/invalid response fixtures; header-tamper detection; repeated/skipped letter rejection and z owner gate. Windows packaging tests cannot create the symlink fixture; complete validation runs in Linux CI. Exact final head and CI are recorded in the branch handoff after completion.
