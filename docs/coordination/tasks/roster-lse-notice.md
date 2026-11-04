# roster-lse-notice: WhatsApp the duty SMC when a teacher reports Leave School Early (changelog)

- Status: changelog; template submitted; lane R, Codex after v0.9.9j
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 4 Nov 2026 13:20

## Owner request and rulings (4 Nov)
"setup custom template only for staff leaving for 'Leave School Early'. It is for info only and not urgent."
1. Recipient: SMC on duty (that date) only.
2. When: as soon as LSE is reported, on the next cron beat.
3. Wording (owner): "*Leave School Early* Hi <SMC member name>, <teacher> has applied for LSE on <date>. For info, thank you!"
4. No message on edit or cancel.
5. Name only the teacher who is leaving (not the reporter).
6. Button to generic https://roster.gsps.edu.sg

## Template (submitted 4 Nov, PENDING)
gsis_lse_notice_v1, id 1130191476390314, UTILITY, en_GB. Body: "*Leave School Early*\n\nHi {{1}}, {{2}} has applied for LSE on {{3}}.\n\nFor info, thank you!" Static URL button "Open Roster" -> https://roster.gsps.edu.sg/ (no button parameter).
Fields: duty_smc_name, absent_teacher_name, duty_date (same date label format as other templates).

## Build
1. Contract `lse_notice` in notification-worker/template-contracts.json; activation entry disabled until Meta APPROVED.
2. On a saved absence with typeId `lse` (first save only, one message per staff per date), queue one outbox job to the duty SMC for that date (smcDutyRoster). None if no duty SMC; record that in Daily Notify. Not paused by quiet mode.
3. Not for edits, cancellations or resubmissions of the same LSE.
4. Same on Google and D1 paths. Tests: LSE saved -> one job to duty SMC; other types -> none; edit/cancel -> none; no SMC -> none and logged; multi-teacher report -> one job per teacher; disabled template -> none.
