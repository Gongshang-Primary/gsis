# roster-d1-cutover-runbook: owner steps to make D1 the Roster record, with checks and switch-back

- Status: approved; Claude writes it while Codex builds roster-d1-google-backup
- Owner/model: Claude
- Reviewer/model: Codex
- Last updated (Asia/Singapore): 30 Oct 2026 11:00
- Branch: claude/roster-d1-cutover-runbook
- Deliverable: docs/v099/ROSTER_D1_CUTOVER.md

## Contents
1. Preconditions: main deployed; chunked import completed; Claude parity check (record counts, digests, per-date absences, assignments, publications, outbox) D1 vs Google: equal.
2. Deploy roster-d1-google-backup.
3. Evening trial: activate, make three test edits, confirm mirror lag reaches 0 and Google shows the edits, run `release`, confirm legacy works. Record times.
4. Real switch: an evening before a school day; owner available at 06:00; exact clicks and Pages variable.
5. Morning watch: what to look at 05:30 to 08:00 (job health, mirror lag, WhatsApp, Assign Relief speed).
6. Switch-back triggers and exact steps (release operation, Pages variable, verification).
7. What not to do: never clear the fence by hand while D1 is ahead of Google.
