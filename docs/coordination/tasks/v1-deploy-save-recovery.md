# v1-deploy-save-recovery: B-R01 ordinary save outcome recovery

- Status: claimed for implementation under the owner's continuing frontend UAT repair instruction; no merge or deployment authorised.
- Owner/model: Codex; coordinator ChatGPT (v1); independent reviewer Claude.
- Last updated (Asia/Singapore): 15 November 2026, 12:02.
- Intended branch: `codex/v1-deploy-save-recovery`.
- Refreshed main: `1db6b686b72a1bf54f0bc935982c2aed6cb4f560`. Use an expected-head non-force claim update.
- Intended service parent: frozen `codex/v1-deploy-clear-authority`, `11370014ed8b8eb73b8f0f15ec30eff744f7b1f9`, including PR160 publication recovery at `ab24739203f3bcc03c5b7e6c96f8fa2144a84654`.
- Builder/client parent: frozen LORD cart repair `af6065e30c667b453f72b27ffbdec742ceaac92f`, branch `codex/v1-lord-cart-groups`, containing ASC `5a2affa6a99ac4511644d0b3e01bcae827774dae`, Fortnight `38dabe6ad46a5f0fdf37baa92811ffca86206cf7`, Contacts recovery `175f34e55cc3152a60ef0a6865c3bcfb55ab27c5` and UAT019 `1f4121a6b54de6f9973934992fea395fdc3cab81`. Combine that exact tree with the frozen service parent above and immediately incorporate this accepted claim before implementation. Record resulting merge SHAs in the implementation handoff. LORD full verification is running; no parent source may change during this serial handoff.
- Accepted claim commit, implementation head and PR: **Not created.** Record exact Git links when they exist.
- User scope: continue the supplied frontend UAT bug queue one bounded group at a time. Historical permissions in source documents do not authorise new live operations. The v1 coordinator defines the nine-path related save-recovery group below; this supersedes the unpublished seven-path draft before implementation.

## Exact nine-path scope

1. `v1/services/deploy/service.mjs`
2. `v1/web/shared/client.js`
3. `scripts/v1/build-web.mjs`
4. `tests/v1-product-deploy-save-recovery.mjs`
5. `tests/v1-product-deploy-save-recovery-browser.mjs`
6. `docs/coordination/tasks/v1-deploy-save-recovery.md`
7. `docs/v1/accelerated-delivery/DEPLOY_SAVE_RECOVERY_FIX_2026-11-15.md`
8. `v1/web/shared/lord-user.js`
9. `tests/v1-product-lord-cart-groups-browser.mjs`

Deploy owns saved documents, operation outcomes and withdrawal. Core remains the owner of current authorization and durable original decision evidence. The shared client owns bounded in-page request retention; the builder changes only v1 adaptations of the reused Deploy and LORD UIs. LORD retains all cart, reservation, custody and outcome ownership; no LORD service/model change belongs here. The same preparation-to-pending boundary includes new LORD cart submissions and its owned editor. A two-line local fieldset/legend wrapping repair and narrow-browser assertion are included for the observed 390px owned-editor overflow. No v0.9 source, Core/shared-runtime implementation, schema, migration, dependency, provider, configuration, secret, generated output or live-data change. No new descriptor marker is expected. No merge or deployment.

## Claim and sequencing

Current root/v1 instructions, workflow, lanes, directives, status, deployment and engineering records have been read. All-head fetch and complete inventories for 26 open PRs confirm main at `1db6b686b72a1bf54f0bc935982c2aed6cb4f560`, Run B at `e0ee789854623b6088a5dadf0f14c9e8291501ec` and Claude review branch at `58e22a7bf7ba4a49caa2caabe877605153b098db`. Existing PRs #160/#164 overlap the service; #161/#163/#165/#166 overlap the builder. These are frozen same-builder predecessors, not permission to overwrite them. LORD is frozen at the exact head above; its client/editor/browser test are explicitly handed forward. No external implementer overlaps this scope. The accepted main claim is re-read before editing.

The builder and Deploy service overlap frozen predecessor work. This must be a same-builder serial handoff: retain exact parent changes, prohibit concurrent edits to the shared files, and record the combined base before implementation. Publish only the task claim on current main using a non-force expected-head update, re-read active claims, then immediately merge the accepted claim into the implementation branch if the branch starts from the frozen combined parent. Do not edit the parent PRs. A parent change requires child revalidation and updated exact-head review. Preserve existing production coordination.

## Root cause and bounded design

The shared client records an ordinary save before automatically obtaining its lease, then adds final lease fields without replacing the retained body. Receipt checks use a different endpoint key and cannot reliably remove that original pending entry. Old committed receipt results can overwrite newer cached revisions. The reused Deploy queue also treats HTTP 400/403/404/409 as proof that an unresolved operation did not commit. These are distinct failures of original-operation retention, outcome handling and cache freshness.

Freeze the complete final wire body after preparation and before dispatch. Keep the lease preparation ID/state separate from the main save; the lease receipt does not settle the save. Receipt checks never resend. Explicit retry may reuse a complete retained wire body unchanged; a reload with only a minimal reference must never reconstruct it from current data, revision or lease. Unknown, prepared and unavailable outcomes stay unresolved and block conflicting edits; only matching durable terminal proof settles the original attempt.

Add an authenticated POST-only same-owner withdrawal of a pending `deploy.edit` operation, exposed by the UI only for its retained ordinary save. Reject publication targets and read-only preview. Require fresh current authorization independently of historical binding evidence. Recover the original version/resource binding through Core's existing historical decision lookup; validate original school, actor, service, operation, action, resource and full-request digest against stored operation identity, and validate the separate intent digest/fence. Do not invent a stored operation subtype or version field. Missing, invalid or unavailable historical evidence cannot justify an abort; retain unresolved recovery state.

Use existing owning-D1 atomic `abortOperation` and its actual returned winner. If commit wins, return the original committed result; if abort wins, fence any late original writer. Resolve admission from that durable outcome. A repeated terminal lookup/withdrawal must not fail merely because abort advanced the fence. Do not expose internal pin cancellation or claim cross-D1 atomicity.

Fix shared pending cleanup using exact school/account/service/operation binding and matching terminal receipt evidence, including recovery via another endpoint. Preserve Contacts and other consumers; neither a different service's same ID nor a preparation-ID prefix may clear an entry. Retain the existing bound, and permit receipt reads at capacity. Prevent old receipt results from regressing a version's revision cache.

Persist only a bounded protected-context operation reference for reload recovery, not full staff-bearing save payloads. Preserve compatibility with existing class-draft storage without expanding it or rebuilding incomplete historical wire bodies. Clear/protect references on account, school and preview changes; guard every post-await UI continuation. Surface reference-storage failure honestly before claiming reload recoverability.

## LORD preflight supplement within this claim

The frozen cart fix safely removes a freshly inserted generic pending slot when local preparation fails, but reused native `submitBooking()` and the owned editor still persist an uncertain attempt before preparation. Native stable-ID lookup can reuse an older ID even with no pending batch. Absence of an entry, age, HTTP status or missing receipt cannot establish that such an ID was never sent.

Expose the existing client preparation as a narrow in-memory handle tied to the same pending-entry object, protected context, endpoint/action, operation ID and exact final wire/digest. Reuse existing maps and storage; add no second queue or authoritative store. Set a UI busy guard before awaits. Distinguish a freshly allocated live unsent attempt from every reused/restored identity before persisting pending state. Prepare group evidence and reserve bounded pending capacity first; then persist the native/editor attempt and dispatch the exact prepared bytes once. Do not enrich twice: legacy intentHash covers raw input while ownerDigest covers enriched wire. An account/form/dialog change during preparation prevents stale dispatch or draft resurrection.

Only the live owner of a fresh, undispatched handle may release its own preparation after local failure, including native persistence failure; compare exact object identity before cleanup. Preserve fields and selections and explain the corrective action. Once dispatch starts, or if an ID was reused/restored, retain unknown-state rules and settle only with matching durable proof. No cross-storage atomicity is claimed. If cleanup fails, report it; do not silently replace the operation.

Restored final wire validates against retained owner digest and endpoint/action; legacy raw retries may use only original retained selections. Missing/corrupt original evidence never permits reconstruction from current inventory. Keep prior cart reserve/custody/scope tests intact. Add cases for full/corrupt/unavailable storage, unknown-capacity preservation, failed persistence, reused stable IDs, delayed account/dialog/form changes, exact wire after a reference refresh, lost response/reload, old raw-binding compatibility and repeated local failures without pending leaks. Add an actual 390px form assertion for long-ID wrapping while retaining complete ID text and vertical reachability.

This small local preparation extension and the Deploy outcome repair share the request lifecycle and existing client; no LORD backend, movement/photo queue, provider or incident system redesign is included.

## Acceptance and required verification

1. Reproduce the original pending-entry leak, incomplete post-lease retention and false terminal-error unlock. Show lost response after real commit recovers once without duplicate writes.
2. Freeze exact final body across changed cached revision/lease, lost/delayed lease response and identical retry. Separate preparation recovery from main save recovery; no replacement operation while the original remains unresolved.
3. Test committed, durable aborted, prepared, missing/unknown, unavailable, malformed and mismatched receipts. HTTP status alone never unlocks or fabricates success; receipt reads never resend.
4. Use real local Worker/D1 integration for deterministic commit-versus-abort races in both orders, late old-fence rejection, correct admission outcome and restart persistence. Preserve terminal replay after fence advancement.
5. Require fresh authorization plus original historical binding. Test expired historical evidence, missing/unavailable evidence, revoked current permission, preview, wrong school/actor/version/digest/fence, GET and publication targets. Failed checks leave target data/outcome unchanged.
6. Test shared cleanup across endpoint changes and same-ID collisions across domains/accounts/schools; preserve Contacts recovery. Repeated terminal operations release bounded pending capacity, while unresolved entries remain protected and receipt checks still work at capacity.
7. Test old receipt after newer save without revision-cache regression; reload with minimal reference, no full payload persistence/reconstruction; existing class-draft compatibility; storage failure and account/version changes during asynchronous recovery.
8. Define the actual ordinary-save UI surface in the handoff: queued cells/classes, direct edit and version-note callers must either be covered or named as outside the bounded fix. No general completion claim based only on the queue.
9. Using `TZ=Asia/Singapore`, run focused service and built-browser tests, unchanged parent Deploy/Core/Contacts regressions, canonical build/no tracked drift, runner discovery, product suite, full Node/LORD and exact-head CI. Record actual commands, exact head, failures, counts, omissions and the nine-path inventory.
10. Claude reviews the exact head without editing the branch. Synthetic evidence does not establish the original hosted operation's outcome or runtime UAT.

## Verification, review and release state

Q01 refreshed scope/overlap and frozen-parent handoff pass; accepted claim incorporation remains a pre-edit requirement; Q02–Q05 proposed design above, implementation evidence pending; Q06 pending; Q07 pending Claude exact-head review; Q08 not applicable to deployment. No new skill execution is claimed by this draft; use the repository's existing engineering policy.

Read-only investigation established the source paths above. Two preliminary Miniflare descriptor probes stalled; a smaller SQLite/Core-handler probe failed because its synthetic session expiry was seeded incorrectly. Those attempts remain failures. A separate actual nine-Worker/D1 probe at `11370014ed8b8eb73b8f0f15ec30eff744f7b1f9` subsequently passed in 10.226 seconds: lost ordinary note-save response recovered committed; exact retry did not mutate again; invalid note had a durable aborted receipt; a missing operation remained unknown; historical Core descriptor matched actor/school/service/action/resource/full-wire digest; expired evidence required historical lookup; fresh current authorization failed after suspension while old evidence remained readable. Command: `TZ=Asia/Singapore GSIS_LOCAL_TRACE=1 timeout 55s node /tmp/gsis-b-r01-proof.mjs`; log `/tmp/gsis-b-r01-proof.log`. No new withdrawal, race, restart or UI behavior is proved by that probe. Historical descriptors do not retain command subtype or original body; the distinct business-intent digest was recomputed only because the probe retained the original body.

Rollback requires no schema/data rollback and cannot undo a committed save. It restores the earlier recovery limitations. Existing operation identities and receipts remain authoritative. F5 remains OPEN. Official T1B-01/T1B-02 and unperformed runtime UAT remain **Not tested**. No live receipt lookup, retry, cancellation, migration, provider send or deployment is authorised by this claim.

## Next action

Publish this claim alone using the expected current main, re-read active claims, immediately incorporate it into the selected combined frozen parent, then implement and verify. Record exact merge/head/PR and tests in Git. Do not edit frozen predecessor branches. Claude reviews the exact new head; no merge/deployment or live operations are implied.
