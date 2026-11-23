# Deploy save recovery hotfix

- Status: implemented; full-suite and CI verification pending
- Owner/model: Codex; Model: Codex
- Reviewer: owner; owner waived Claude review for v0.9 hotfixes in this conversation.
- Last updated (Asia/Singapore): 20 November 2026
- Branch: `codex/deploy-save-recovery-hotfix`
- Base SHA: `e6df70b7` (current main when work began)
- PR: not opened
- User-authorised scope: urgent v0.9 Deploy fault shown by the owner; pending-save recovery blocks input and exposes internal assignment identifiers.
- Files/domains owned: `public/app.js`, `public/deploy-command-client.js`, `public/version-rows.js`, focused Deploy/command tests, this task record and canonical generated outputs required by the build.
- Out of scope: v1, live records/settings, deployment, protocol/ledger bypass, automatic resend of uncertain writes, other apps.

## Evidence and intended change

An old open command blocks `Client.submit()` before a new request is sent. Its untyped error makes `pumpQueue()` retain a phantom unconfirmed flight, disable editing, and check the new unsent ID instead of the old command. Review uses internal `queueKey` identifiers and raw assignment booleans.

Distinguish local non-submission from uncertain transport, check the actual earlier command, refresh confirmed saved state while retaining the current draft, and show readable assignment descriptions. Preserve genuine uncertainty and original operation IDs. A transport 4xx alone does not prove non-application.

## Acceptance checks

- An older pending command cannot turn a definitely-unsent new draft into an unconfirmed save or disable its inputs.
- Retry checks the actual old command; an applied outcome refreshes the saved revision, preserves newer edits and allows one new submission.
- Genuine unknown outcomes retain their original IDs and do not execute twice.
- Existing phantom local flights can recover without clearing browser storage or losing edits.
- Assignment review uses teacher, class/group and subject names, with assigned/unassigned wording.
- Canonical build is reproducible; relevant regressions, full local suite and exact-head CI are recorded honestly.

## Verification

- The new actual-client/browser-fixture regression fails against `e6df70b7` and passes after this fix: six save-recovery scenarios, including six retained assignment edits, stale applied revisions, old status read failure, a phantom flight, genuine uncertainty and a transport 4xx without terminal proof.
- Four additional version-note scenarios pass, including editing a different version without changing the selected version or its draft.
- Readable review scenarios pass for six assignment removals, additions, missing references, escaped names and new local teaching groups. Identity and wire fields are preserved.
- Existing `edge-queue-client.cjs`, `edge-queue-app-ui.cjs`, `deploy085-tg-recovery.cjs`, `deploy098g-class-drafts.cjs` pass. `deploy085-tg-review-browser.cjs` passes in native Chromium.
- Canonical `TZ=Asia/Singapore npm run build` passes. The version-note change is made in canonical `public/version-rows.js` and regenerated into `public/app.js`.
- Full local suite and exact-head CI will be recorded in the PR/handoff after completion. No live data or provider calls are used for testing.

## Recovery and deployment instructions

Deploy the rebuilt Deploy frontend ZIP only; this fix has no backend, Worker, settings or database changes. Refresh the Deploy tab, retaining browser storage. Retry save checks the actual earlier command. Once its saved outcome is confirmed, the new draft is rebased onto current saved data and submitted once. Truly uncertain commands remain retained until their outcome is known; this patch never discards them or blindly resends them. Roll back by restoring the previous frontend package. The owner deploys; no deployment is performed here.

## Deployment

Not deployed. The owner deploys the reviewed frontend package.
