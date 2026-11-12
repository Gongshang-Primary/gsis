# roster-lse-notice: WhatsApp the duty SMC when a teacher reports Leave School Early (changelog)

- Status: template APPROVED (Active, confirmed 12 Nov 2026 via WhatsApp Manager screenshot); ready for Codex build; lane R
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
