# gsis-secret-consolidation: reduce all transport secrets to one GSIS_SECRET

- Status: implementing Contacts PR only; build-script scope approved by owner (7 Nov: "include").
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

Contacts implementation, 7 November 2026, Model: Codex:
- `TZ=Asia/Singapore npm run build`: passed; all generated changes are limited to Contacts. Other app source/generated files remain unchanged.
- Focused local run with `TZ=Asia/Singapore NODE_NO_WARNINGS=1` and system Chromium: **60 programs passed, 0 failed**, covering Contacts reads/writes/recovery, service/integration consumers, gateway sessions/signing/coalescing, prior shared-secret diagnostics and the new Contacts regressions/guard. Initial fixture failures were diagnosed and migrated to GSIS_SECRET; the complete 60-program selection then passed.
- `TZ=Asia/Singapore node tests/contacts-secret-consolidation-guard.cjs --prove`: passed, including the expected child exit 1 for a deliberately reintroduced legacy read and successful validation after source restoration.
- Full CI and final-head build verification are pending until the implementation is committed/pushed. Full local Node/LORD suite, live services/data, staging and deployment were not run. No review or deployment is claimed.


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

## Contacts implementation and rollout — Model: Codex

- Owner approved the bounded build-script/helper addition with "include". Contacts-specific strict helpers are `backend/ContactsApiSecret.gs` and `shared/contacts-api-secret.js`; `scripts/build-release.py` selects them only for Contacts and specializes the shared LORD/Venues bridge blocks only when embedded in Contacts. Other apps retain their existing canonical helpers and generated bytes.
- Contacts backend inbound/outbound transport and Contacts Worker signing now use GSIS_SECRET only. Missing/invalid settings fail closed with GSIS_SECRET_INVALID; no legacy lookup, fallback, secret generation or rotation remains in Contacts. The optional Deploy URL remains a separate connection setting.
- Contacts sessions derive from GSIS_SECRET with the existing `|gsis-browser-session-v1|` separator and origin. Raw transport HMAC signatures and signatures for another purpose/origin do not validate as sessions. Logout remains possible when transport configuration is invalid. Existing Contacts cookies may require a new sign-in if their old signing value differs from GSIS_SECRET.
- Service/source/time-window validation remains intact. Since directory and browser transport now share a credential, a directory-service envelope is explicitly rejected if it names a school-user action; service requests cannot reuse that envelope shape to write Contacts data.
- A scoped AST CI guard covers all four deployed Contacts source copies. The migrated-app list is intentionally Contacts-only until later app PRs are reviewed and merged. Both new test programs are automatically discovered by the existing test runner. A deliberately appended `env.BRIDGE_SECRET` read was rejected by the guard (child exit 1), then restored byte-for-byte; no deliberate production case remains.
- New regressions exercise backend/Worker canonical signing, rejection of distinct legacy and legacy-only settings, invalid configuration, outbound Deploy signing, read-only LORD/Venues service discrimination, session purpose/origin binding, logout and generated Contacts parity. Synthetic fixtures for existing Contacts/gateway tests now supply GSIS_SECRET; historical comparison fixtures retain their old-key test values where needed.

### Contacts deploy steps — owner only, after review/merge and staging

1. Resolve the current live Contacts configuration mismatch separately. This PR is not the outage fix and no live verification is claimed.
2. Securely align the same existing operator-selected GSIS_SECRET value in the Contacts Worker environment and the Contacts Apps Script Script Properties. Do not paste values into Git, PRs, logs or chat. Do not rotate it as part of this change.
3. Check each still-used peer's effective transport setting against that same Contacts value: Roster directory requests, Deploy publication/integration requests, Calendar birthday reads, and LORD/Venues source reads. Contacts' optional outbound Deploy connection must also match the Deploy backend's effective signing value. Other apps still have their pre-migration precedence/fallback rules; align configuration at the owner-controlled rollout without changing their code in this PR.
4. Stage/deploy both Contacts ends as one reviewed pair: the rebuilt Contacts backend (update its existing Apps Script web-app deployment) and Contacts frontend Worker bundle. Keep all legacy configuration entries during the transition and rollback window. Do not remove a name merely because one side is updated. Users may need to sign in again as noted above.
5. Verify school sign-in/session restore, an authorized Contacts read/save and recovery, Roster directory service, used integration reads and optional Deploy data. These are operator acceptance steps, not tests run by this task. Never send real notifications or change school records just to smoke-test this PR without separate authorization.
6. Remove Contacts-only legacy configuration names only after both new Contacts ends are live and verified and their use by other app pairs is excluded. Preserve credentials still used by unconverted apps. CALENDAR_SESSION_SECRET, EXTERNAL_LINK_SECRET, EXTERNAL_LINK_PREVIOUS_SECRET and WHATSAPP_APP_SECRET remain separate and unchanged.
7. Roll back the Contacts Worker and backend together to the previous reviewed pair; retain original configuration for that rollback. Recheck session sign-in and integration reads. Do not rotate shared values or remove legacy configuration as part of rollback.

### Contacts handoff gate

Run the canonical build, focused local checks and full branch CI. Open the Contacts draft PR only when the complete CI run at its exact head is green. Reviewer: Muse at that head. Do not start Calendar or another app until the owner has merged this Contacts PR. No live settings, data, provider calls, merges or deployments are authorized by this implementation.
