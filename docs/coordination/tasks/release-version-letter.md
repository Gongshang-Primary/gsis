# release-version-letter: one version label (0.9.9b, then c, d …) on every component, plus a mismatch notice

- Status: implementing (owner 30 Oct 2026: "for next deploy need to be more vigilant in harmonizing all version numbers to 0.9.9b and advance the alphabet so that frontend user can keep track")
- Owner/model: Codex (builder), Claude (reviewer; Claude also bumps the letter when building each deploy bundle)
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 30 Oct 2026 22:20
- Branch: codex/release-version-letter
- Base SHA: 9393377c644ee977be2573a94afd28280a06c98b
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

## Continuation directive, 30 Oct 2026

Owner: "do not wait for review on completion of changelog items keep on going". Build and test each item, record an exact-head handoff, then continue the next eligible item while review proceeds. Keep one branch per task, the existing PR limit, owner-controlled merges, and explicit production/deployment holds. Pending review alone is not an implementation blocker. Any overlapping pending task is reconciled before integration; do not edit another implementer's branch.

## Phases (30 Oct 2026, quiet hours)
- **Phase 1, Claude:** `package.json` `gsisBuildLabel` (now `0.9.9b`). `scripts/build-release.py` stamps it on every manifest frontend's HTML: visible `v0.9.9b` labels and every `?v=0.9.9b` asset query string. File names, `gsisRelease` and `GSIS_DEPLOY_VERSION` stay `0.9.9` (protocol and packaging unchanged). `tests/release-build-label.cjs` fails on any stale label.
- **Phase 2, Codex:** Worker health `version` field; backend exposes the build label; page/server mismatch notice (Required 3); bundle script refuses a repeated label (Required 4).
- **Bundle rule (Claude, until phase 2):** before each deploy bundle, advance `gsisBuildLabel` by one letter, run `npm run build`, run the full suite, and take frontend ZIPs only from the release build (`<App>_Frontend_v0.9.9.zip`), never by zipping folders.

## Phase 2 source, 31 October 2026

Model: Codex. Branch codex/release-version-phase2 follows merged phase 1. Display labels are separate from protocol/schema versions. Apps Script response envelopes carry buildLabel; optional Worker health returns the build label. The browser notice is nonblocking, retains mismatches per endpoint, ignores older responses, and waits for the body before rendering.

Final packaging refuses repeated/skipped letters, fails closed on a corrupt ledger, labels COMMIT.txt and DEPLOY_STEPS.md and records the ledger only after archive writes succeed. Verification accepts only that expected post-package ledger change while checking archived source against the tagged Git content. Older unlabeled archives retain the previous verification route.

JavaScript syntax parsed. Added browser/Worker/ledger/provenance regressions; the real Linux builder, generated output capture and full suite remain pending. No bundle, deployment, authority change or live messages.
