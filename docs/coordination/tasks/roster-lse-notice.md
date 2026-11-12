# roster-lse-notice: WhatsApp the duty SMC when a teacher reports Leave School Early (changelog)

- Status: in progress, Model: Codex; template APPROVED; lane R
- Reviewer/model: Muse
- Last updated (Asia/Singapore): 12 November 2026

## Live case (12 Nov 2026)

Habibah reported an LSE absence at 11:16 am for P11, P12. The system sent the generic "New Absence Update" urgent message with "Emergency absence:" instead of the dedicated LSE notice. Cause: the absence-alert code marks any new absence reported after first publication and before 14:00 as emergency (`shared/roster-operations.js:1021`) and has no LSE exclusion, and the C8 wiring was never built (`lse_notice` is not in `notification-worker/template-contracts.json`). The owner confirmed the expected behaviour: an LSE absence gets the dedicated LSE notice, not an urgent message.

## Owner request and rulings (4 Nov)
"setup custom template only for staff leaving for 'Leave School Early'. It is for info only and not urgent."
1. Recipient: SMC on duty (that date) only.
2. When: as soon as LSE is reported, on the next cron beat.
3. Wording (owner): "*Leave School Early* Hi <SMC member name>, <teacher> has applied for LSE on <date>. For info, thank you!"
4. No message on edit or cancel.
5. Name only the teacher who is leaving (not the reporter).
6. Button to generic https://roster.gsps.edu.sg

## Template (submitted 4 Nov, APPROVED — Active, confirmed 12 Nov 2026)
gsis_lse_notice_v1, id 1130191476390314, UTILITY, en_GB. Body: "*Leave School Early*\n\nHi {{1}}, {{2}} has applied for LSE on {{3}}.\n\nFor info, thank you!" Static URL button "Open Roster" -> https://roster.gsps.edu.sg/ (no button parameter).
Fields: duty_smc_name, absent_teacher_name, duty_date (same date label format as other templates).
WhatsApp Manager shows "Active – Quality pending" (quality rating, not approval). The template is approved and usable, so the activation entry is ENABLED, not disabled.

## Build
1. Contract `lse_notice` in notification-worker/template-contracts.json, following the existing contract pattern; activation entry ENABLED (the template is approved — see above).
2. On a saved absence with typeId `lse` (first save only, one message per staff per date), queue one outbox job to the duty SMC for that date (smcDutyRoster). None if no duty SMC; record that in Daily Notify. Not paused by quiet mode.
3. Not for edits, cancellations or resubmissions of the same LSE.
4. Same on Google and D1 paths. Tests: LSE saved -> one job to duty SMC; other types -> none; edit/cancel -> none; no SMC -> none and logged; multi-teacher report -> one job per teacher; disabled template -> none.
5. Exclude LSE from the urgent/emergency absence alert (added 12 Nov, from the owner's "for info only and not urgent" ruling and the Habibah live case): an absence with typeId `lse` must not produce the "Emergency absence" / `absence_update` urgent message in `absenceAlerts` (`shared/roster-operations.js`). It gets the dedicated LSE notice only. Test: an LSE reported after first publication and before 14:00 produces the LSE notice and no urgent alert; a non-LSE absence in the same window still produces the urgent alert.

## Codex claim — 12 November 2026, Model: Codex

- Status: claimed before implementation edits; current main fetched and active PRs inspected. Branch `codex/roster-lse-notice`, from current main. Reviewer: Muse at the eventual exact head. Owner merges and deploys.
- Scope: the `lse_notice` contract and activation, the LSE hook in the saveAbsence path (where `absenceAlerts` is called, `shared/roster-operations.js`), the LSE exclusion from the urgent/emergency absence alert, generated artifacts, associated tests, and deploy instructions here. No other product changes; no live config/data/provider calls.
- Validation: tests must prove the change (LSE saved -> one `lse_notice` job to the duty SMC; LSE produces no urgent alert; other types unchanged; edit/cancel/resubmission produce none; no duty SMC -> none and logged; multi-teacher -> one job per teacher). Canonical build at the final head leaves no diff; full local suite; full exact-head CI, all five jobs green, before a draft PR naming Muse. No test, review or deployment is yet claimed for this phase.
- Deploy: owner only, after review and merge. The template is already approved and active, so no Meta step remains. Deploy the notification/operations Worker and Roster Pages together in the owner's controlled window; Google stays frozen (do not deploy regenerated Google artifacts). Owner verifies with a live LSE report: the duty SMC receives the dedicated LSE notice, and no urgent "Emergency absence" message is sent for it.

## Branch start

Model: Codex. Implementation branch `codex/roster-lse-notice` created from verified current main `c2b3b09514753e02f6d91e46392557644e8677b0`. The existing main task claim is retained, not re-claimed. No implementation changes yet. Muse reviews the eventual exact head; owner merges and deploys.

## Implementation and owner deployment handoff

Model: Codex. First saved LSE attendance creates a durable staff/date notice record in the existing alert history and one `lse_notice` outbox job per verified duty SMC. Edits, same-LSE resubmissions, transport replays and later re-reporting after cancellation do not create a second notice. LSE skips both emergency and legacy late-absence alerts. Non-LSE emergency behavior remains unchanged. An unavailable/disabled template or missing duty SMC is retained as a read-only Daily Notify entry; no job is created.

The template contract is `gsis_lse_notice_v1`, en_GB, UTILITY, approved, with three body parameters and its exact static Open Roster URL. The static button has no runtime parameter. The approved-template checker validates that URL as well as the body. Activation is enabled in the source activation catalog. Runtime activation remains server-derived: the Pages/Worker strips caller authority from the toggle, and native D1 reads its own configuration. Ephemeral template activation is excluded from stable receipt digests. No new secret or transport credential is introduced.

Quiet-hours bypass requires the saved LSE notice, matching absence, recipient, key and creation time. Both Google and D1 delivery adapters retain current-duty membership, mobile validation and live-approved template checks before sending. A deleted or retyped absence cannot send its retained LSE job. The changes to adapter/context, receipt canonicalization and Daily Notify files are limited to this LSE wiring.

Deployment, owner only after review and merge:

1. Preserve all current flags, URLs, bindings, credentials, crons and existing template settings. Merge only the `lse_notice` entry from `notification-worker/templates.activation.json` into the deployed `WHATSAPP_TEMPLATES_JSON` for the relevant Roster Pages, notification Worker and operations Worker environments. The Meta template is already approved; no Meta submission step remains. No live configuration was changed by Codex.
2. Deploy the regenerated notification and operations Worker bundles together with Roster Pages `_worker.js`, `edge-roster.js`, `edge-roster-domain.js`, `roster-operations-model.js` and `roster-operations-ui.js` in the controlled window. Google remains frozen: do not deploy the regenerated Google bundles for this task.
3. Owner verifies a new valid LSE report: the absence lands, the duty SMC receives Leave School Early with the absent teacher's name and correct date, the static button opens Roster, and no Emergency absence message is sent. A same-LSE edit/retry must not send another LSE notice. Check Daily Notify for a retained no-duty/disabled outcome if that condition is deliberately tested by the owner.
4. Roll back code using the prior deployed artifacts if required, retaining all absence, notice and outbox rows. Keep the activation entry disabled on the rolled-back code if it cannot validate the new contract. Prior code may again use generic emergency wording; do not represent rollback as preserving the new behavior.

## Verification record

- Before implementation, the new LSE regression failed because the first save created zero dedicated LSE notices.
- Eight targeted programs passed: new shared/Google LSE checks, native D1 LSE and contract checks, Daily Notify Chromium, existing emergency checks, two WhatsApp contract programs and two existing notification UI programs. Further tests prove same-LSE resubmission and caller-supplied activation cannot create another/enabled notice.
- Canonical build regenerated the deployed copies. The generated parity catalog was refreshed: only 90 source and 20 handler references changed; all 272 operations and recorded outcomes, including 57 missing handlers, are unchanged.
- Exact final-head full-suite and CI outcomes will be recorded in the draft PR body after execution. No full-suite success or live validation is claimed here before those gates finish.
- Not tested: live D1/Google, real WhatsApp delivery, deployed configuration or production browser sessions. Tests use synthetic data and intercepted provider calls. No merge or deployment performed.

The first full local run at `bcf86df` was stopped before completion, not counted as a pass. A further end-to-end check found that the legacy Google intake processor omitted the trusted LSE activation flag. A regression reproduced zero notices through that processor and the bounded fix forwards the flag into the attendance phase. The full suite is restarted at the corrected head.
