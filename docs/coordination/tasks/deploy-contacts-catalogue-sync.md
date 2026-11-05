# deploy-contacts-catalogue-sync: published Deploy version not reflected in the Contacts viewport

- Status: **reassigned to Codex** (owner 6 Nov ~05:45: "wish to have codex work on this instead, change agent"); was Muse (PR #83, head fd886f7, CI green but based on stale main e7d4f02, conflicts in 9 files, bundles not regenerated). Codex takes over from #83's branch; lane: Deploy/Contacts (not lane R)
- Reviewer/model: Claude
- Owner report (verbatim): "deploy-viewport: existing in-force version was saved and published but changes not reflected on contacts viewport"

## What Claude found so far (5 Nov evening, code reading; live cause not yet confirmed)
- Deploy publish (backend/Code.gs `dispatch_`, about line 722-727): the version is persisted first, then `syncPublishedCatalogues_(b,idx,identity)` (backend/Code.gs about line 1462) calls Contacts with `contacts_(identity,false,'applyDeployCatalogues',{revision,options,membership})`.
- Contacts side: `applyDeployCatalogues_` (backend/Contacts_Code_with_Deploy_API.gs about line 717; backend/Contacts_Catalogue.gs line 6) takes the Contacts script lock with an **8 s** wait and throws 503 "Contacts is busy" otherwise.
- So a publish can succeed in Deploy while the Contacts step fails; the UI then looks published but Contacts keeps old catalogues (options, membership). A repeated publish with the same request id goes through the duplicate branch, which re-runs the sync.
- Other suspects to rule out: the Contacts viewport's own cache (browser or `contactsCatalogueCache_` keyed by catalogue hash in Deploy) not invalidated by the new revision; the catalogue revision check rejecting an "existing in-force" version (same revision number re-published); what exactly the viewport reads (catalogues vs HR data).
- Context: 5 Nov evening Google was overloaded (Roster timeouts); Roster has since moved to D1 (6 Nov), so Contacts lock contention should drop.

## Required
1. Reproduce: publish an existing in-force version with edited master options/membership; show where the change is lost (Deploy result, Contacts write, Contacts viewport read/cache). Record evidence in this file.
2. Fix the root cause. At minimum: the Deploy publish result must report the Contacts step separately ("Published; Contacts updated" / "Published; Contacts not updated: <reason>") and offer **Retry Contacts sync** (idempotent, same revision); never show plain success when Contacts failed.
3. The Contacts viewport must show the new catalogues after a successful sync without a manual cache clear (invalidate by catalogue revision/hash).
4. Re-publishing the same in-force version must re-apply catalogues to Contacts (idempotent, no duplicate rows).
5. Tests: Contacts busy → publish reports partial + retry succeeds; viewport refreshes on new revision; re-publish idempotent; no change to Roster/D1 code.
6. Scope: Deploy and Contacts backends/frontends only. No Roster (lane R) files; if a fix needs them, stop and ask Claude.
