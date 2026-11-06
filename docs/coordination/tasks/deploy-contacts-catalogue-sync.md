# deploy-contacts-catalogue-sync: published Deploy version not reflected in the Contacts viewport

- Status: merged (#90 at reviewed head f8eb9ad as 2147d18; CHANGELOG/bundle conflicts resolved by Claude), owner "merge 92 93 90", 6 Nov; Codex pushed a refresh 95da06a to the PR at the same time (no new content beyond older main) — close #90 and #83 manually; for release o
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

## Codex continuation claim (6 November 2026)

Owner/model: Codex. Reviewer: Claude. Branch: codex/deploy-contacts-catalogue-sync. Base: a7b74aafb6a3ad5c3960f2a1903dcae8b21c324b. Owner reassigned #83 and authorised serial backlog clearance without pausing after each PR. Replace the stale PR with bounded Deploy/Contacts changes from current main. Canonical scope: backend/Code.gs dispatch, Planning.gs, FieldStore.gs publication identity, Contacts_Code.gs, Contacts and Deploy frontend, focused tests and canonical generated copies only. No Roster behavior change or D1 authority work. Preserve current publication, Layout handoff, drafts and pending request identities. Acceptance: busy partial publish, same-publication idempotent retry, superseded retry fence, cache response race and draft/session preservation; canonical build and full exact-head CI. No live writes, deployment, messages or merge. Claim also recorded via backlog PR #88 because direct main claim updates were not approved by automatic review.

## Implementation and verification (Codex, 6 November)

Reproduced with the real Deploy dispatch and field-store fixture: publish commits first; a Contacts 503 now returns saved:true with contactsSync.status=failed while Layout handoff is still attempted. The publication journal stores its global catalogueRevision and original publish request ID with the frozen commit. Retry validates Admin access, a request ID and exact version/commit before generic request replay, and reads that frozen payload. Draft edits do not change the retry revision. Superseded publications cannot write old catalogues or sync a new publication under an old publish request. Only a saved response confirming the same catalogue revision counts as updated. Source-read failures also return the separate Contacts outcome.

Contacts responses expose a digest made from already-loaded validation tables. The viewport invalidates by that digest and fences in-flight reads with a generation counter. A delayed old data response cannot roll the digest back after a fresh bootstrap. Drafts and unconfirmed saves retain their values/request IDs; refresh is deferred until they clear. Warm bootstrap read counts remain unchanged. Deploy shows Contacts and Layout outcomes together, preserves an unconfirmed retry, and blocks retry during drafts, pending notes or writes. Account changes clear retry state; stale-session replies cannot paint a success.

Canonical build passed all 18 components. Passed locally: release04-planning.cjs (extended real dispatch, busy publish, same-publication retry after draft saves, authorization/identity guards, superseded retry); deploy-contacts-catalogue-sync.cjs (real Contacts writer, duplicate/unchanged journal behavior, missing response and source-read failure); contacts-viewport-catalogue-sync.cjs (real DOM refresh, stale response and draft retention); deploy-contacts-retry-ui.cjs (actual publish/result and row-button click handlers, missing confirmation, Layout status, note guard, Admin gate and expired session); contacts418-loading.cjs; first-load-contacts.cjs; contacts-data-loading.cjs; contacts410-save-ui.cjs; contacts411-recovery-ui.cjs; contacts411-recovery.cjs; contacts502-save.cjs; contacts503-save.cjs. Full exact-head CI remains required. UI checks use jsdom, not a claimed local Chromium run.

Boundaries: Google Deploy/Contacts fix; generated Deploy adapters/copies rebuilt from canonical source. No hand edits to Roster or D1 authority/queue behavior, no live read/write, messages, deployment or merge. Legacy publications without a persisted sync identity require republishing; they are never silently assigned a new revision. Rollback: revert this PR and regenerate. The additive publication metadata is safe to retain. Reviewer: Claude. The replacement PR supersedes #83 only after it opens.
