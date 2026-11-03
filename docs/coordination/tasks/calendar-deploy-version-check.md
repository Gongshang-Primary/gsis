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

## Implementation (Muse, 3 Nov 2026)

- Status: built on branch muse/calendar-deploy-version-check, after pilot 1 draft PR #63 was opened. Claim is recorded here on the branch, not on main, because the owner instruction for this pilot says never push to main.
- Script: `scripts/check-calendar-bundle.mjs <bundle-folder>`, Node, no new dependencies.
- Test: `tests/check-calendar-bundle.cjs`, auto-discovered by `tests/run.cjs`.
- Release note: `docs/coordination/calendar-bundle-check.md`, optional command only, not a blocker. No release build script was changed.

### Findings that shaped the script

- The deploy branch folder is `deploy-bundle/calendar-row9-together/`, not a root folder. Its files are named `C1_Calendar_Backend.gs`, `C2_gsis-calendar-jobs_worker.js` and `C3_Calendar_Frontend.zip`. The script accepts both those names and the canonical names in the task record.
- No `gsisBuildLabel` stamp lives inside the three files. The build label `0.9.9i` lives in `package.json` (`gsisBuildLabel`), in the bundle `LABEL.txt`, and in the frontend `index.html` release label. The script reports those labels separately and does not claim a stamp inside the files.
- Product version, from markers actually in the files, is `0.9.9` in all three pieces: backend `RELEASE_VERSION`, frontend `FRONTEND_VERSION` in `app.js` inside the zip, job Worker header "Calendar Job Worker release 0.9.9".
- Protocol markers: frontend `app.js` throws "Frontend/backend version mismatch" unless the backend version equals `FRONTEND_VERSION`. The job Worker calls backend services `gsis-calendar-command-v1` / `calendarCommand` with purpose `calendar-mutation-job-v1`, `gsis-calendar-sync-worker-v1` / `calendarSyncContinue`, and `calendarChangesAuthorize`. The script checks all of those markers in the backend file.
- SHA-256 of the deploy bundle files, checked locally, matches `deploy-bundle/SHA256SUMS.txt` on branch `deploy/2026-11-03-v0.9.9i`: backend `5491720f…`, Worker `009a30f1…`, frontend zip `7781d30d…`.

### Verification (local, before CI)

- `node scripts/check-calendar-bundle.mjs` on a local copy of the deploy bundle folder: MATCH, all three pieces product version 0.9.9, exit 0.
- Same script on the parent deploy-bundle folder (with `calendar-row9-together/` subfolder and `LABEL.txt 0.9.9i`): MATCH, build labels agree at 0.9.9i, exit 0.
- Same script with the Worker header changed to 0.9.8: MISMATCH, naming job worker 0.9.8, exit 1.
- `node tests/check-calendar-bundle.cjs`: pass. It covers matched, mixed, missing protocol marker, missing piece and usage cases, and proves the script does not edit its fixture files.
- Not run locally: `npm run build`, `npm test`, and `python3 lord-suite/tests/run_all_checks.py`, because Playwright is not installed in this workspace. Those are covered only if CI passes; they are not claimed as locally run.
- No Calendar source was edited. No network call was made by the script. No file was edited by the script.
