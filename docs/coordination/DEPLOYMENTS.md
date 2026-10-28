# Deployments and live configuration

What is live, when it changed and how to roll back. Record every production deployment and every live setting change. "Reported" means stated by the owner; "verified" means checked by a model with the evidence named.

## Current production (best known, 29 Oct 2026 05:30 SGT)

Eighteen production components. "Reported" = stated by the owner; "verified" = checked by a model with the named evidence.

| # | Component | Build | Status and evidence |
| --- | --- | --- | --- |
| 1 | Roster backend (Apps Script) | 0.9.9a-importfix, SHA-256 `2a8a81b2…fb20d` (includes latest-wins) | Reported 29 Oct ~05:03 |
| 2 | Roster frontend (Pages, roster.gsps.edu.sg) | 0.9.9a latest-wins or the v0.9.9a label build | Reported; central review list visible in owner screenshot ~04:37; exact zip unconfirmed |
| 3 | Calendar backend | 0.9.9 | Reported 28 Oct |
| 4 | Calendar frontend | 0.9.9 | Reported 28 Oct; a queued save on 0.9.9 Worker code verified at 21:11 (D1 `calendar_jobs`) |
| 5 | Contacts backend | 0.9.9 | Reported 28 Oct |
| 6 | Contacts frontend | 0.9.9 | Reported 28 Oct |
| 7 | Deploy backend | 0.9.9 | Reported 28 Oct |
| 8 | Deploy frontend | 0.9.9 | Reported 28 Oct |
| 9 | Layout frontend | 0.9.9 | Reported 28 Oct |
| 10 | LORD backend | 0.9.9 | Reported 28 Oct |
| 11 | LORD frontend | 0.9.9 | Reported 28 Oct |
| 12 | OVERLORD frontend | 0.9.9 | Reported 28 Oct |
| 13 | STARLORD frontend | 0.9.9 | Reported 28 Oct |
| 14 | Venues backend | 0.9.9 | Reported 28 Oct |
| 15 | Venues frontend | 0.9.9 | Reported 28 Oct |
| 16 | `gsis-calendar-jobs` Worker | 0.9.9 | Verified: deployed code header reads "release 0.9.9" (read via Cloudflare API, 28 Oct ~21:10) |
| 17 | `gsis-operations` Worker | 0.9.9 | Reported; modified 28 Oct 21:04 SGT (modification time only, not version evidence) |
| 18 | `gsis-roster-notifications` Worker | 0.9.9 | Reported; modified 28 Oct 21:04 SGT (modification time only, not version evidence) |

The owner reported all 18 showing v0.9.9 on 28 Oct (version sweep).

## Log (newest first)

| When (SGT) | Change | Who | Rollback / revert-by |
| --- | --- | --- | --- |
| 29 Oct 05:07 | `GSIS_RECOVERY_MODE=false` on `gsis-roster-notifications` (pause ended) | Owner | Reported by owner; verified: D1 `gsis_job_health` shows received-reports 05:18, inbox 05:19, notifications 05:21, audit-export 05:22, allocation 05:23, peer-mail 05:23 |
| 29 Oct ~04:50 | `GSIS_RECOVERY_MODE=true` on `gsis-roster-notifications` (pauses all scheduled jobs) | Owner | Reverted 05:07 (row above) |
| 29 Oct ~05:03 | Roster backend 0.9.9a-importfix | Owner | Apps Script previous version |
| 29 Oct ~04:35 | Roster frontend 0.9.9a-latestwins (`85ccb4dc…923c`) | Owner | Pages previous deployment |
| 29 Oct ~04:05 | Roster frontend 0.9.9a-d1prep (`c454bc6e…ab10c`); R2 `gsis-roster-snapshots` bound as `ROSTER_TIMETABLE_SNAPSHOTS`; `ROSTER_D1_PREPARE=import` | Owner | Pages previous deployment; remove variable |
| 28 Oct ~21:04 | 18 components to 0.9.9 | Owner | Previous Apps Script versions / Pages deployments |

## D1 import status
Not imported. Three attempts on 29 Oct failed safely (absence queue, Roster changed during export, Worker response unreadable). D1 scopes `roster`, `roster-register`, `roster-references` remain `legacy`, revision 0, verified by query at ~05:06.
