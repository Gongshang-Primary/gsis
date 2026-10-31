# d1-first-new-modules: new modules and log/message data start in D1, with Google as a copy

- Status: approved as a design rule, **lowest priority** (owner 31 Oct 2026: "put into PR but deprioritise way down")
- Owner/model: Codex (future builder), Claude (architect and reviewer)
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 31 Oct 2026 12:20
- Branch: claude/d1-first-new-modules (this document only)
- PR: documentation PR
- Out of scope now: any code. Roster keeps its current path (copy to D1, verify, backup format, trial, switch).

## Rule
1. **New modules** (for example LORD queued writes, Deploy queued writes, future logs or message queues) are designed **D1-first**: Cloudflare D1 is the record; Google receives a copy (scheduled mirror or export) for backup, Sheets reporting and switch-back.
2. **Append-only, stand-alone data** (message queues and delivery records, audit logs, request receipts, job health, notification history) belongs in D1 from the start, with a retention rule (archive or expire after a set age), so no single Google file grows without limit.
3. **Records that decisions are made from** (Roster absences, assignments, R entitlements, rotation, Stapler plans) move only by the verified copy-then-switch path, never by starting a blank store.

## Why (owner discussion, 31 Oct 2026)
- Roster's single Google file reached the 16M cap; about half of it was machine output (Storage report 31 Oct 04:47).
- A blank live store for decision records would break fairness (R% history), split records across two stores, and complicate rollback. Stand-alone logs and messages do not have that problem.

## When it applies
- At design time of each new module or new data collection: the task file states "D1-first" or gives a reason to keep Google first.
- After the Roster D1 switch: move Roster's machine output to D1-only with retention, keeping the Google backup small.
- Existing approved tasks (lord-queued-writes, deploy-queued-writes) are not re-planned now; apply the rule when their next phase is designed.

## Acceptance (when built)
- Each new module task records its authority (D1 or Google) and its copy direction.
- D1-first data has a written retention rule and a Google copy that a person can open.
- Switch-back to Google is documented for each D1-first module.
