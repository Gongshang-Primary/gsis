# calendar-deploy-version-check: verify Calendar frontend, backend and job Worker match before deploy (Muse pilot 2)

- Status: assigned (owner 3 Nov 2026: "both for muse"); not claimed; start after pilot 1 is in review
- Owner/model: Muse
- Reviewer/model: Claude
- Branch: muse/calendar-deploy-version-check
- Lane: K (Calendar), pilot. Read-only tooling; no product behaviour change.
- Files (expected): a new script under `scripts/` (Node or Python, no new dependencies), a test under `tests/`, and a short note in the release docs. Do not edit `calendar-backend/`, `calendar-update/public/` or `calendar-job-worker/` sources.

## Problem
Calendar row 9 (#43) must ship as three matched pieces: Calendar Apps Script backend (`Calendar_Backend_v0.9.9.gs`), the Calendar Pages frontend (`Calendar_Frontend_v0.9.9.zip`) and the `gsis-calendar-jobs` Worker (`calendar-job-worker/dashboard-worker.txt`, built by `scripts/build-calendar-job-worker.py`). Deploying one without the others breaks saves. Bundles put them in `calendar-row9-together/`.

## Requirement
1. A script, e.g. `scripts/check-calendar-bundle.mjs <bundle-folder>`, that reads the three files and reports, for each, the build label (`gsisBuildLabel` stamp), source hash/marker it embeds, and the protocol or version markers the frontend and Worker expect from the backend; it prints **MATCH** or **MISMATCH** with the reason.
2. Read-only: never contacts Google, Cloudflare or the network; never edits files.
3. Wire it into the release bundle step only as an optional check (documented command), not as a blocker.

## Acceptance
- Test: a matched fixture passes; a fixture with one file from an older build fails with a clear reason.
- Runs on the current `deploy/2026-11-03-v0.9.9i` bundle's `calendar-row9-together/` and reports MATCH.
- Full CI green on the branch.
