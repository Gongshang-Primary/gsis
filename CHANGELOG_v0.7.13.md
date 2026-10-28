# GSiS v0.7.13

Baseline: v0.7.12. Release authorised on 19 October 2026, Asia/Singapore.

Status: implemented and verified for the v0.7.13 source release. Dispositions and evidence are recorded in PROJECT_RECONCILIATION_v0.7.13.md and VALIDATION.md.

## Roster

1. Stack assigned red Relief Health markers from the period axis upward, keeping each red marker beside its own teacher's baseline marker. Explain filled green and neutral outlined capacity.
2. Place all eligible internal manual relief suggestions in Tier 1 and rank by remaining weekly R first, descending. Timetable fit and fairness break ties; configured automatic-allocation preferences retain their separate meaning.
3. Select timetable names for Name Bridge from all distinct baseline teacher names using partial search. Validate the exact selected name again when saving. Retain old links that disappear from the baseline and flag them for review.
4. Configure which periods appear in Relief Health. Hide P0, P13, P14, P15 and P16 by default. These display settings do not change assignments or eligibility.
5. Configure employment types restricted from automatic relief in specified periods. SRE and FAJT default to P0, P13, P14, P15 and P16. An explicit SMC manual override needs a reason and audit; it does not bypass other availability checks.
6. Keep No relief instructions needed visible beside Own arrangements after confirming the absence periods. It applies only to the current absence and does not remove its relief requirement.

## Duty SMC WhatsApp summaries

1. Add an Admin-configurable Singapore-time schedule: 16:00, 16:30, 17:00, 17:30, 18:00, 18:30, 19:00, 19:30, 20:00, 20:30, 21:00 and 21:30 for the next day; 05:30, 05:45, 06:00, 06:15 and 06:29 for the current day.
2. Send the first evening summary and a fresh 05:30 morning summary, including zero absences. Suppress later unchanged summaries against the last successful summary. New absences, cancellations and changed periods count as changes.
3. Allow configured summary slots through quiet hours only for these duty summaries. Preserve allocation scheduling and the handover to manual operation, without an extra routine 06:30 summary outside the configured list.
4. Record the user's confirmation that the 05:45 WhatsApp message arrived. The earlier nonreceipt report does not establish a provider failure. No live message is sent by this release build.

## 3D Layout

1. Replace the marked narrow grass strip beside the hall frontage with the adjacent floor finish and height; retain the larger grass patch.
2. Extend Block A's L2 east corridor and its existing sheltered cover until the straight outer railing meets Block K's west wall. Keep the exposed portion open to the sky and Block K unchanged.
3. Move the L1 flag area and external stairs east by the same amount, preserving their dimensions, elevation and orientation. Retain the other L1 Block A structures.

The first configured slot in each summary phase is the fresh report. With defaults, 05:30 always starts a new morning summary even if nothing changed overnight. Moving or removing that first slot changes the start of the fresh morning cycle; an empty phase disables its summaries.
