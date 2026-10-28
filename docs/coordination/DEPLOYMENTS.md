# Deployments and live configuration

What is live, when it changed and how to roll back. Record every production deployment and every live setting change. "Reported" means stated by the owner; "verified" means checked by a model with the evidence named.

## Current production (best known, 29 Oct 2026 05:10 SGT)

| Component | Build | Evidence |
| --- | --- | --- |
| Roster backend (Apps Script) | 0.9.9a-importfix, SHA-256 `2a8a81b2…fb20d` (includes latest-wins) | Reported 29 Oct ~05:03; not independently verified |
| Roster frontend (Pages, roster.gsps.edu.sg) | 0.9.9a-latestwins or 0.9.9a label build (`dadee351…e666`) | Central review list seen in owner screenshot 29 Oct ~04:37; exact zip unconfirmed |
| `gsis-calendar-jobs`, `gsis-operations`, `gsis-roster-notifications` | 0.9.9 | Verified: calendar-jobs code header; all modified 28 Oct 21:04 SGT |
| Other 15 components | 0.9.9 | Reported 28 Oct; owner version sweep |

## Log (newest first)

| When (SGT) | Change | Who | Rollback / revert-by |
| --- | --- | --- | --- |
| 29 Oct ~04:50 | `GSIS_RECOVERY_MODE=true` on `gsis-roster-notifications` (pauses all scheduled jobs) | Owner | **Revert by 05:30**: delete the variable and deploy. Revert not yet confirmed. |
| 29 Oct ~05:03 | Roster backend 0.9.9a-importfix | Owner | Apps Script previous version |
| 29 Oct ~04:35 | Roster frontend 0.9.9a-latestwins (`85ccb4dc…923c`) | Owner | Pages previous deployment |
| 29 Oct ~04:05 | Roster frontend 0.9.9a-d1prep (`c454bc6e…ab10c`); R2 `gsis-roster-snapshots` bound as `ROSTER_TIMETABLE_SNAPSHOTS`; `ROSTER_D1_PREPARE=import` | Owner | Pages previous deployment; remove variable |
| 28 Oct ~21:04 | 18 components to 0.9.9 | Owner | Previous Apps Script versions / Pages deployments |

## D1 import status
Not imported. Three attempts on 29 Oct failed safely (absence queue, Roster changed during export, Worker response unreadable). D1 scopes `roster`, `roster-register`, `roster-references` remain `legacy`, revision 0, verified by query at ~05:06.
