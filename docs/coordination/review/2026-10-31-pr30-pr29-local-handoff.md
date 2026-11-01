# Local handoff: PRs #30 and #29

Historical handoff. The owner subsequently authorised publication. PR #30 is now pushed at `f7e0022`; the completed-work sweep and PR #29 publication continue in `2026-10-31-completed-work-push-audit.md`. Earlier upload rejections below are retained as historical evidence, not a current authorisation blocker.

Model: Codex. Owner request: work on #30 and #29. Claude reviews the eventual exact remote heads; the owner merges and deploys.

| Branch | Local work | Remote state at handoff |
| --- | --- | --- |
| #30 | Main `1284af8` integrated at local commit `015ea4977cb1d7b3c80129c24c575b2480a4e8a2`; inactive identity duplicate regression fixed; original protected work retained | Existing draft still has earlier head `2a61ee1b56d222564ecc897fbb2adc438d1f9cb0` |
| #29 | Based on that #30 integration; published Cloudflare R snapshots, Sunday checkpoint, immutable fallback, FAJT levelling, recovery/health and Google/D1 integration implemented | Existing draft still has earlier head `1a074d6892be0b6ff5cc3d81c321dbf8f0899106` |

No source upload or remote ref update succeeded. Automatic approval review rejected uploading the changed changelog/source to helper-gsps/gsis, saying explicit authorisation for that payload and destination was missing. A transparent-text retry after checking the existing repository content was also rejected. No alternate write path was used.

## Verification evidence

Both local branches rebuild all 18 components. The final #29 focused run passes 24 programs covering SQLite snapshots, journalled publication, real HMAC/role boundaries, source authority, holiday dates, immutable weekly history, retries, health, FAJT, settings and inactive staff. The separate D1 inactive integration run passes 21 of 21 cases. The Apps Script syntax and setup checks are recorded separately.

All 38 LORD programs were attempted independently: 35 passed; gsis098h-background-ui.cjs, gsis-reference-ui-browser.cjs and booking-remarks-return-browser.cjs could not launch the absent Chromium executable. The standard runner also stopped at the first browser program. No browser result is counted as passing.

The full Node runners were attempted. The #30 retained log reports 502 completed programs before stopping without a final aggregate: 444 passed, 57 could not launch Chromium, and package.cjs lacks the historical Git commit `2efd6e003fa9ee3846cf590d07902a22309861ff`. This synthetic local mirror preserves current file bytes, not the full remote history. The #29 full runner likewise remains incomplete locally. These attempts are not green full-suite evidence. The repository Actions workflow, with its real Git history and browser, must run against each newly published head before either draft is marked ready.

## Review findings addressed

1. Inactive display labels no longer conceal exact timetable-name duplicates when no mobile number is entered.
2. A verified Monday holiday uses the first actual school date for source and snapshot selection, while retaining Monday's week key and Sunday's cutoff.
3. D1 live quota provenance now requires the checkpoint, preventing ordinary reads from crediting live R instead of snapshot R.
4. Source recovery resolves its retained alert and never replaces a captured fallback quota.
5. Legacy Deploy bridge credentials and persisted D1 authority work without enabling a routing flag; paused authority never falls back.

Each behavioral correction has a regression observed failing before repair. Independent review found the holiday-date and D1 provenance issues; both now have passing regressions. No Claude approval of these unpublished heads is claimed.

## Material decisions and configuration

Captured fallback R stays fixed for that week. A recovered new quota applies at the next checkpoint. A teacher without verified prior R stays unknown. This preserves the owner's requirement that captured and historical quota never change.

Google Roster remains the production record. Workers use the existing GSIS_JOBS database. When APPS_SCRIPT_URL points to Roster, DEPLOY_APPS_SCRIPT_URL must point to the existing Deploy Apps Script deployment. Use explicit GSIS_SECRET, otherwise DEPLOY_BRIDGE_SECRET, otherwise BRIDGE_SECRET. No secret values or live settings were changed.

Google publication intents are retained in the journalled deploy_quota_publications sheet. Snapshot bodies and proof-control metadata use additive D1 tables; they do not create a second relief entitlement ledger. The minute job reads publication metadata and transfers a body only when needed. No deployment, real notification, live record edit or authority activation occurred.

After explicit repository-destination authorisation: publish #30 as a normal merge preserving its remote ancestry, retarget it to main, and run full CI. Publish #29 as a normal merge preserving #27/#29 history and stack it on #30 until the owner merges #30. Mark each ready only after its exact-head Node and LORD results are green. The owner merges and releases.
