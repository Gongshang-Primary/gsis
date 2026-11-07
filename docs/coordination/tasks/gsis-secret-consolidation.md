# gsis-secret-consolidation: reduce all transport secrets to one GSIS_SECRET

- Status: claimed — Contacts PR only; blocked pending Contacts-specific build-script scope confirmation.
- Owner/model: Codex
- Reviewer/model: Muse
- Last updated (Asia/Singapore): 7 Nov 2026
- Branch: codex/gsis-secret-consolidation
- Base SHA: 9e1057b
- Current head SHA (or PR head; avoid self-referential commit hashes):
- PR:
- User-authorised scope: cross-lane by necessity — the secret reads span Roster (lane R), Deploy, Calendar, Contacts, Venues and LORD. Owner authorised the setup 7 Nov 2026. One PR per app (Contacts first, then Calendar, Roster/Deploy, Venues, LORD); each PR is reviewed at its exact head by Muse and merged only on the owner's word.
- Files/domains owned (include generated outputs): transport secret reads in `backend/ApiSecret.gs`, `backend/Code.gs`, `backend/Contacts_Code_with_Deploy_API.gs`, `backend/DeployEdge.gs`, `backend/LayoutDiagnostics.gs`, `backend/LordBridge.gs`, `backend/Roster.gs`, `backend/RosterOperations.gs`, `backend/RosterVenues.gs`, `backend/VenuesBridge.gs`, `calendar-backend/Code.gs`, `calendar-backend/Birthdays.gs`, `calendar-backend/VenueDirectory.gs`, `Contacts_Code.gs`, `roster-update/public/_worker.js`, `roster-update/public/edge-deploy.js`, `roster-update/public/edge-timetable-cache.js`, `roster-update/public/edge-venues-fence.js`, `calendar-update/public/_worker.js`, `contacts-update/public/_worker.js`, `notification-worker/dashboard-worker.mjs`, `operations-worker/dashboard-worker.mjs`, `calendar-job-worker/worker.mjs`, `lord-job-worker/worker.mjs`, `shared/backend-service.js`, `shared/edge-venues-fence.js`, plus generated `*_Backend_v0.9.9.gs` and `*_worker` bundles (regenerated, never hand-edited).
- Out of scope: `CALENDAR_SESSION_SECRET` (session signing — stays separate; anyone holding the transport secret must not be able to forge session cookies); `EXTERNAL_LINK_SECRET` + `EXTERNAL_LINK_PREVIOUS_SECRET` (private relief links — collapsing them would invalidate every outstanding link); `WHATSAPP_APP_SECRET` (Meta's, third-party). No secret values in code, commits, or PRs. No live Cloudflare/Apps Script config changes — the owner makes those at deploy time. No rotation of `GSIS_SECRET` itself. The live Contacts outage (7 Nov, 401 `Invalid service signature`) is fixed by config alignment first and separately; this code change prevents recurrence, it is not the live fix.
- Acceptance checks: for each app PR — (1) every transport secret read uses `GSIS_SECRET` only; no legacy transport name (`BRIDGE_SECRET`, `ROSTER_SERVICE_SECRET`, `CALENDAR_PROXY_SECRET`, `CALENDAR_SERVICE_SECRET`, `CONTACTS_BRIDGE_SECRET`, `VENUES_BRIDGE_SECRET`, `LORD_BRIDGE_SECRET`, `DEPLOY_BRIDGE_SECRET`, `DEPLOY_EDGE_SECRET`, `GSIS_BACKEND_SECRET`) is read in transport code; (2) browser session keys are derived from `GSIS_SECRET` with their existing purpose separators intact (`'|gsis-browser-session-v1|' + origin` for Roster/Contacts; Calendar keeps `CALENDAR_SESSION_SECRET`); (3) a CI test fails if any transport code reads a legacy transport secret name (excluding §2 names and the session derivations); (4) canonical build at the final head leaves no diff; (5) full CI green at the exact head; (6) Muse reviews at the exact head; owner merges.

## Decisions and changes

- Audit: `docs/coordination/gsis-secret-audit.md` (7 Nov 2026). 11 transport secrets inventoried; 4 traps found.
- Trap 1 (live): precedence — both sides prefer `GSIS_SECRET` when set, else the legacy name. If `GSIS_SECRET` exists on one side only, or with different values, the two sides silently use different secrets and every signed call fails with 401 `Invalid service signature`. No rotation is needed to trigger it; adding the variable on one side during a deploy is enough. This is what broke live Contacts on 7 Nov.
- Trap 2 (mixed fallback): Venues, LORD, Deploy bridge and Deploy edge read legacy names directly with no `GSIS_SECRET` fallback, while the other end of the same call honours it.
- Trap 3 (session/transport split): transport honours `GSIS_SECRET`, but Roster/Contacts session keys are derived from `BRIDGE_SECRET` directly. Dropping `BRIDGE_SECRET` would break sign-in while API calls keep working.
- Trap 4: lord-job-worker and calendar-job-worker already require `GSIS_SECRET`, while the backends they call still accept legacy names.
- Consolidation removes the precedence and mixed-fallback traps (one name, nothing to disagree about). It does NOT remove the need for values to match: the Worker's `GSIS_SECRET` and its backend's `GSIS_SECRET` must still hold the same value in each pair.
- Rollout: Contacts first (the live-broken app, proof of the fix), then Calendar, Roster/Deploy, Venues, LORD. Legacy transport names are removed from config only after the new code is live on both ends of that pair; each PR's deploy steps must state the `GSIS_SECRET` alignment for that app.

## Verification
Exact command, tested commit, outcome and evidence. Explicitly list checks not run.

## Review
Reviewer/model, reviewed SHA, findings, resolution. Advisory review is not human approval.

## Deployment
Not deployed unless supported by explicit environment/version/time evidence. State staging and production separately.

## Handoff
Codex to claim and code, starting with the Contacts PR. Muse reviews each PR at its exact head. Owner merges and owns the live config alignment at deploy time. No secrets or private school data.

## Contacts claim — 7 November 2026, Model: Codex

- Branch: `codex/gsis-secret-consolidation`; base: `9e1057b` (the supplied main).
- Scope: Contacts transport and Contacts browser session derivation only, associated tests/guard, generated Contacts artifacts and deploy instructions. Calendar and subsequent apps wait for Contacts review and owner merge. Reviewer: Muse.
- Read the task and audit before claiming. Checked open PRs: no other Contacts consolidation implementation is open. No product files edited, no live reads/config changes, no secret values inspected.
- Build-scope blocker: `scripts/build-release.py:52–69` injects `backend/ApiSecret.gs` into Contacts, Deploy/Roster, Calendar and Venues, and `shared/gsis-api-secret.js` into all app Workers. Its shared module assembly also embeds `backend/LordBridge.gs` and `backend/VenuesBridge.gs` into Contacts and other apps. Direct edits to Contacts embedded blocks are overwritten; changing the shared fallback globally would violate the one-app-per-PR rollout.
- Proposed bounded addition: authorize `scripts/build-release.py` and Contacts-specific helper sources as needed to select GSIS_SECRET-only helper/module variants for Contacts targets, while keeping all other app outputs byte-identical. Add tests for Contacts generated parity and other-app non-regression; no global migration in this PR.
- Per the owner's instruction to stop for files outside the listed scope, implementation is paused before product edits. No build, regression test, CI, review or deployment is claimed for this work yet.
