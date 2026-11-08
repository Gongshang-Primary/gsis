# gsis-secret-consolidation: reduce all transport secrets to one GSIS_SECRET

- Status: Contacts merged (#102 at b9d9f8c as 772d424, 7 Nov 16:34 SGT). Calendar merged (#104 at fb0ee22 as d360069, 8 Nov 20:31 SGT). Next in the queue: edge-queue design note (Codex codes, Muse reviews), then Roster/Deploy consolidation.
- Owner/model: Codex
- Reviewer/model: Muse
- Last updated (Asia/Singapore): 8 Nov 2026
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

### Contacts CI fixture correction

- First implementation CI run `42354141699` at `7f13689` failed in the nested LORD-to-Contacts reference contract after Node regressions. Its fake Contacts provider was still configured only with LORD_BRIDGE_SECRET, while Contacts now requires GSIS_SECRET. The contract fixture now aligns the synthetic Contacts GSIS_SECRET with the unchanged LORD caller's effective legacy signing value. This changes test configuration only; no LORD product migration or live alignment occurred. It directly exercises the staged-rollout alignment requirement.
- Retained first-run failure evidence; do not describe that run as green or replace the full-CI gate with the focused local results. Rerun the full local LORD suite and full branch CI at the correction head before opening the Contacts draft PR.

- Inspection of the remaining CI logs also found two Node fixture failures in shard 4: `lord-source-bridges.cjs` and `review04-cache.cjs`, both still configuring the actual Contacts provider through legacy-only bindings. Those two fixture configurations were migrated without weakening their read/snapshot/security assertions. Other app providers and the LORD product code remain unchanged.
- After the nested contract fixture correction, the complete local LORD suite passed: 40 programs, 0 failures. The two additional Node fixture corrections were verified separately before the next push: lord-source-bridges.cjs passed all 14 signed source contracts; review04-cache.cjs passed its cache/authority/mutation/timeout checks.

## Calendar claim — 7 November 2026, Model: Codex

- Status: claimed; paused before implementation pending bounded shared-build-file approval under the owner's new queue rule.
- Branch: `codex/gsis-secret-consolidation-calendar`.
- Base: `37a93066745573aef23e4084e5999412c3fbb601`, freshly fetched current main. Contacts #102 is recorded as owner-merged at b9d9f8c as 772d424. Reviewer for Calendar: Muse at the eventual exact head.
- Scope: Calendar transport secret reads, Calendar-specific helper variants as necessary, Calendar job Worker transport, Calendar generated artifacts, the existing migrated-app legacy-read guard extended to Calendar, associated fixture/behavior tests and Calendar deploy instructions. Preserve CALENDAR_SESSION_SECRET for session signing; do not use the transport credential to sign Calendar sessions. No other app product changes or later queue work.
- Shared-file scope request: `scripts/build-release.py` still injects the common fallback helpers into `calendar-backend/Code.gs` and `calendar-update/public/_worker.js`, and embeds the shared Venues bridge into Calendar. Extend its target selection/specialization narrowly for Calendar, retaining Contacts' merged behavior and byte-identical outputs for every other app. New Calendar helper sources are already contemplated in the queue; this request is for the shared generator edit, following the explicit Contacts precedent.
- No implementation files edited or tests claimed. No live settings/data/provider calls or deployment. Continue only after the owner approves this bounded addition; do not proceed to the edge-queue design note or another app until the Calendar PR is reviewed and owner-merged.

## Calendar implementation approval — 8 November 2026, Model: Codex

- Owner explicitly approved the bounded Calendar extension to `scripts/build-release.py` ("include", 8 Nov). Implementation may proceed within Calendar, its helper variants, generated artifacts, guard/tests and deploy notes. Muse is coordinator and reviewer; Claude is not involved on this item.
- Refreshed main is `27ab05a`. Published claim `585f1c3` is based on `37a9306`. Rebasing that published claim would require a prohibited force-push; asked the owner asynchronously whether to merge main into the task branch or use a new branch from current main. Continue independent Calendar implementation while that history decision is pending; do not rewrite/push the published claim history without authorization.
- CALENDAR_SESSION_SECRET remains the independent Calendar cookie signer/verifier. GSIS_SECRET is transport-only for Calendar; no fallback or use as a Calendar session key.

### Calendar implementation and rollout — Model: Codex

- Calendar backend, Pages Worker and Calendar job Worker now read GSIS_SECRET only for transport. Calendar-specific strict helpers are `backend/CalendarApiSecret.gs` and `shared/calendar-api-secret.js`. Missing/invalid canonical configuration fails closed; legacy-only settings do not authorize calls. Existing service, source, purpose, actor and timestamp checks remain in place.
- The approved generator change selects those helpers only for Calendar and specializes the embedded Venues bridge only in Calendar, retaining Contacts' merged specialization. Canonical Calendar backend and job Worker dashboard copies were regenerated. Other app product sources/generated outputs have no diff.
- CALENDAR_SESSION_SECRET remains the separate Calendar session signing/verifying credential. Tests use different synthetic session and transport keys and reject cookies signed with raw or purpose-derived GSIS_SECRET.
- The existing AST guard now covers 12 deployed Contacts/Calendar sources, including Calendar helper callers and both job Worker copies. `TZ=Asia/Singapore node tests/contacts-secret-consolidation-guard.cjs --prove-calendar` passed: a deliberate Calendar `env.BRIDGE_SECRET` read caused child exit 1 and was removed/restored byte-for-byte before the clean guard passed.
- `tests/calendar-secret-consolidation.mjs` exercises actual backend/Pages/job Worker authentication, outgoing Contacts/Venues HMACs, invalid/legacy-only configuration before I/O, service/source/purpose/time checks, independent session signing, signed continuation and generated parity, using synthetic local providers and an in-memory job-list database stub. Existing Calendar queue tests separately exercise actual local SQLite durability and recovery.
- Existing Calendar request fixtures were aligned with the new canonical key. The first broad run passed 47/48 programs; `calendar099-venue-diagnostics.cjs` incorrectly inherited the harness's new canonical key in its missing-secret case. It now deletes GSIS_SECRET explicitly and expects GSIS_SECRET_INVALID; the focused rerun passed. No product assertion was disabled.

### Calendar deploy steps — owner only, after review/merge and staging

1. Privately align the same operator-selected GSIS_SECRET value in Calendar Pages, Calendar Apps Script Script Properties and the Calendar job Worker. Values must match in every active calling pair. Preserve existing URLs, bindings, queue database and feature flags. Do not paste values into repository files, PRs, logs or chat.
2. Check active Calendar peers before rollout: Contacts birthdays, Venues catalogue/source requests and Roster Calendar reads. Their effective transport credential must match Calendar's GSIS_SECRET. Peers still awaiting their own migration retain their current code and may still use a legacy setting; their effective values must agree. Do not remove their legacy configuration as part of this Calendar PR.
3. Preserve CALENDAR_SESSION_SECRET unchanged and independently chosen. Do not replace it with GSIS_SECRET or derive it from transport. Preserve external-link rotation keys and provider credentials. No credential generation or rotation is part of this change.
4. Deploy the matching regenerated Calendar backend, Pages Worker and Calendar job Worker together in the owner's controlled staging/rollout window. Retain Calendar legacy configuration until new code is live on all Calendar ends and the owner has verified aligned authentication. Legacy names can be removed from Calendar configuration only after that verification; retaining them does not provide fallback in new code.
5. Owner verifies sign-in, Calendar read and save/receipt behavior, existing job status/recovery, optional Contacts birthdays and Venues lookups using approved staging data. Retain existing default-off push/continuation flags and Google authority. No live provider calls or deployment are claimed by local tests.
6. On authentication failure, compare each pair's GSIS_SECRET privately. To roll back code, restore the matching previous Calendar components together and preserve the retained configuration, session signer and durable jobs/uncertain outcomes. Do not clear receipts or retry unknown writes to test credentials.

### Calendar remaining gates

- Local implementation is prepared for Muse's review at the eventual exact head. No Muse review or approval has occurred.
- Branch history resolution: owner directed the fresh-branch procedure on 8 November; see the branch-move record below. Do not rewrite or push the old branch.
- Run canonical build at the final head and require no diff. Full CI at that exact published head must pass all 5 jobs before opening a draft PR. No Calendar PR, full-CI pass, deployment, live configuration alignment, live D1/Google reads or provider verification is claimed here. Contacts' live 401 configuration alignment remains outside this work.

### Calendar local verification — 8 November 2026, Model: Codex

- `TZ=Asia/Singapore npm run build`: passed after implementation, then passed again after all fixture corrections. All 18 components regenerated; no deployment performed.
- Across the focused runs, 56 distinct local test programs passed, including all 46 top-level Calendar programs, the two existing Contacts consolidation programs, Calendar job gateway/SQLite Worker, backend-secret compatibility, Calendar bundle checker, Roster gateway integration, LORD source bridges, cache contracts and current release metadata. Initial missing-key fixture failure is retained above; its corrected rerun passed. Local log inventories are in ignored `verification/calendar-consolidation-results.json` and `verification/calendar-consolidation-extra-results.json`.
- Guard negative control passed and the deliberately introduced read was removed. `git diff --check` passed. Other apps' product and generated paths have no diff.
- Not run: full local `npm test`, full branch CI for this implementation, live service/D1/Google/provider tests, deployment or owner-side credential alignment. Historical release comparisons were not rerun. The full CI and exact-head Muse review remain gates, not inferred from these focused checks.


### Calendar branch move — 8 November 2026, Model: Codex

- Owner confirmed the standing rule: a rebase of published work always uses a fresh branch because force-push is prohibited. Follow this procedure for future published-branch refreshes without treating it as a new owner decision.
- Current branch: `codex/gsis-secret-consolidation-calendar-rebase`, created from freshly fetched main `27ab05af8c5464f4479d6bed536673608f188bd3`.
- Cherry-picked the existing claim `585f1c3` as `fcc0d48`, then implementation `e33a806` as `f1cecb5`, in that order. Both applied cleanly with no conflicts. This carries the existing claim forward; it is not a new claim.
- Old branch `codex/gsis-secret-consolidation-calendar` remains unchanged at local implementation `e33a80655fdeb53db7507b860f8db8d60475bb06`; its published claim remains untouched. Do not push to it.
- Status: implementation carried forward; final-head canonical build, focused verification, new-branch push and all-five-job CI gate precede the draft PR. Reviewer: Muse at that exact head. Owner merges and deploys; no review, merge, deployment or live configuration alignment is claimed.

### Calendar CI fixture correction — 8 November 2026, Model: Codex

- Full CI run `42467969601` at `79b5c16d2146e79d88ee28bc0ce6b0ec875a76bc` failed: regression shards 1, 2 and 3 failed, shard 4 passed, and the full-suite gate failed. No draft PR was opened.
- Reproduced all three failures locally with `TZ=Asia/Singapore`: `roster-absence-year-worker.mjs` returned 400 instead of 200 at line 39; `roster081-api-roundtrips.mjs` rejected the authenticated scheduler at line 17; `roster702-calendar-batch.mjs` rejected `calendarPost()` at line 33. A direct actual-backend boundary check rejected the old single synthetic value with `Unauthorised proxy.` and accepted the value matching the harness's GSIS_SECRET.
- Root cause: five synthetic caller settings/request fields in those three Roster-to-Calendar integration fixtures still used the old single value, while the migrated Calendar harness requires the repeated canonical value. Updated only those five values to align with the Calendar fixture. Unmigrated Roster retains its existing legacy setting names in these fixtures; no Roster product migration, live configuration change or relaxed authentication/assertion is involved.
- After the canonical build passed, all three corrected programs passed locally, as did `calendar-secret-consolidation.mjs` and the migrated-app guard. The guard's `--prove-calendar` negative control again rejected the deliberate legacy read with child exit 1 and restored the source. `git diff --check` passed. Failure evidence is retained in ignored `verification/calendar-ci-red-*.log`; correction results in `verification/calendar-ci-fix-results.json`.
- Next gate: canonical build at the correction head must leave no diff, then full CI at that exact pushed head must pass all 5 jobs before the Calendar draft PR is opened for Muse. This correction does not claim full local npm-test, live provider/D1/Google tests, deployment, live Contacts outage repair or any model review.
