# deploy-contacts-catalogue-sync: published Deploy version not reflected in the Contacts viewport

- Status: claimed by **Muse**, 6 Nov 2026 (Asia/Singapore); lane: Deploy/Contacts (not lane R)
- Reviewer/model: Claude
- Branch: muse/deploy-contacts-catalogue-sync
- Base SHA: 4323f9bfc5b35e27dc4b1e75f6d6391b644ccb88
- Model: Muse
- Owner report (verbatim): "deploy-viewport: existing in-force version was saved and published but changes not reflected on contacts viewport"

## Claim note
WORKFLOW describes a claim-only commit to main, but the pilot rule is never push to main. As with Tasks 1-3, the claim is recorded on the task branch only, not on main. The assignment commit 4323f9b is already on main.

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

## Reproduction (Muse, 6 Nov 2026; code reading on main 4323f9b, verified unchanged at main 90b25230 in every region below)

### Where the change is lost: the Deploy publish result
`dispatch_` (backend/Code.gs, lines 722-727) persists first, then syncs Contacts as a bare statement whose result is discarded, and there is no `catch` on the writer `try/finally`:
- Normal path: `persist_(b,idx,d,p.requestId)` completes (lease deleted, LEASES written back), then `if(p.operation==='publish'){syncPublishedCatalogues_(b,idx,req.identity);layoutHandoff=syncLayoutPublication_(b,idx);}` and the return is `{saved:true,layoutHandoff,protocol:500,revision:idx.revision,versionId:d.id,requestId:p.requestId,delta:committedDelta_(d,idx,c,p,en.revision)}`. No Contacts result is in the object.
- Duplicate path (same requestId): `if(p.operation==='publish'){syncPublishedCatalogues_(b,idx,req.identity);layoutHandoff=syncLayoutPublication_(b,idx);}return {duplicate:true,saved:true,versionId:p.versionId,requestId:p.requestId,revision:idx.revision,layoutHandoff};`
- `syncPublishedCatalogues_` (canonical source backend/Planning.gs; same text inlined at backend/Code.gs line 1462, inside the GSIS_BACKEND_PLANNING block): `gsisRequireBackendRole_('deploy');const entry=publishedEntry_(idx),published=entry?document_(b,entry):null;if(!published)return;contacts_(identity,false,'applyDeployCatalogues',{revision:idx.revision,options:published.masterOptions||idx.masterOptions||null,membership:published.membership||null});` It returns nothing and discards the `contacts_()` return.
- If the sync throws, the throw propagates out of `dispatch_` **after the persist has committed**; `doPost` turns it into `{ok:false,status:503,...}`. The Deploy frontend `change('publish')` then shows a generic "Save not confirmed — draft retained", and its following refresh shows the version as Published. So the user sees a published version while Contacts never got the catalogues, and nothing says the Contacts step failed or offers to retry it. That is the loss, and it matches the owner report.
- The bridge does **not** swallow the failure: `contacts_()` (backend/Code.gs lines 572-601) throws on a transport failure, on a non-JSON response (503), and on a Contacts `{ok:false}` body, preserving the Contacts error and its status (and `CONTACTS_RECOVERY_REQUIRED` code where present); its `deployPhase_` wrapper rethrows with `failurePhase='contacts'`. The Contacts error therefore reaches `dispatch_`; `dispatch_` just has nowhere to put it.

### Contacts write: the 503 is real and transient, and leaves nothing stuck
`applyDeployCatalogues_` (backend/Contacts_Catalogue.gs line 6) takes the Contacts script lock with an 8 s wait and throws 503 "Contacts is busy. Retry publication." otherwise. On 5 Nov evening Google was overloaded, so a busy lock is the plausible trigger; the lock failure happens before any write, so it leaves no half-applied state.
- A mid-transaction interruption is different: after the journal write, `DEPLOY_CATALOGUE_PENDING` stays set and `contactViewPrepare_` pins reads to the journaled before-image (result `authoritative=false`, `editable=false`) while `contactWriterReady_` fences other writes with 503 until `recoverCatalogue_` runs on the next `applyDeployCatalogues_` or `ensureContactsReady_`. So a stuck PENDING also needs a retry to reach Contacts.
- The revision/digest guards are deliberate and stay: same revision + same digest returns `{saved:true,duplicate:true}` (idempotent, no write); same revision + changed payload throws 409; a newer revision + same stored digest returns `{saved:true,unchanged:true}`. A save of the in-force version bumps `idx.revision` before publish, so the normal save-then-publish flow does not hit the same-revision trap.

### Viewport read/cache: fresh loads are live; the open tab's aux cache is stale
- After a successful apply, reads are live: `applyCatalogueTransaction_` rotates `CONTACTS_DATA_EPOCH`, clears `contactReadCache_`, and clears `DEPLOY_CATALOGUE_PENDING`; `deploySnapshot_` computes `catalogueHash` (SHA-256 of sysFields, roleCatalogue, people) and returns full data whenever the hash differs; the Deploy-side `contactsCatalogueCache_` (backend/Code.gs lines 552-570) is keyed by that hash and refetched on mismatch; the Contacts worker and Deploy worker cache no settled data (`Cache-Control: no-store`).
- The hole is the Contacts viewport's in-memory aux cache: `loadAux(kind, force=false)` (contacts-update/public/app.js lines 389-390) re-renders the cached sysFields/membership table without re-fetching whenever the view pending flag matches. It never compares the cached table's `revision` (returned by `adminTable_`, a digest of the lists) against the fresh `lists` that every `contactData_` load returns. `refresh()` calls `show()`, which re-renders the same cached aux tables, so even Refresh does not update them; only the per-table Reload button (`force=true`) does. That is the manual step requirement 3 must remove.
- The Deploy frontend has the same shape of hole in miniature: `change('publish')` sets its status from `result.layoutHandoff` only and never inspects a Contacts result, and its `refresh(true)` re-sync uses `knownCatalogueHash`, which is sound only because the backend returns full data on a hash change.

### Conclusion
The change is lost at the Deploy publish result: a transient Contacts failure after the Deploy persist leaves Deploy published and Contacts stale, with no separate Contacts status and no retry. The Contacts write is already idempotent, and the viewport read is live once the sync actually runs; the viewport's open-tab aux cache is the second staleness hole. The fix must report the Contacts step separately with an idempotent retry, and invalidate the aux cache by catalogue revision/hash.
