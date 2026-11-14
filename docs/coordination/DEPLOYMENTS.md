# Deployments and live configuration

What is live, when it changed and how to roll back. Record every production deployment and every live setting change. "Reported" means stated by the owner; "verified" means checked by a model with the evidence named.

## 14 Nov 2026, approximately 14:52 SGT: isolated v1 prototype deployed and routed

Owner explicitly authorised merge, deployment and hostname attachment; then approved the GitHub environment job in browser. Model: Codex. Reviewed PR139 head `686af2fc803d9d035020d364705dbfae0b3be32f`; deployed merge SHA `f1a5d32fdca3154ebb30d5c4fd8f6a9501185d03`. [Successful deployment run](https://github.com/helper-gsps/gsis/actions/runs/43568056552).

- Live prototype: https://gsis.gsps.edu.sg, gateway `gsis-v1-gsps-web`; eight owner Workers and isolated D1/R2 stores use prefix `gsis-v1-gsps`. Existing v0.9 routes/resources unchanged.
- Verified all nine Worker settings: exact deployed SHA, correct origin, scheduler disabled, sender/webhook owners v0.9, only GSIS_SECRET secret name. No provider credentials installed.
- HTTP checks: home and Contacts/Deploy/Roster/Calendar/Layout/Venues/LORD/OVERLORD/STARLORD pages 200; public Core sign-in configuration 200/configured; unauthenticated session 401. Initial urllib checks gave 403, later curl checks passed; cause not established. These checks do not prove authenticated browser journeys.
- Pending: owner first Admin sign-in, durable grant confirmation, remove bootstrap settings from GitHub source and all Workers through approved configuration deployment. No staff-data import. F5 OPEN; official T1B-01/T1B-02 and unperformed runtime UAT Not tested.
- Rollback: if the prototype must be withdrawn, detach only this v1 hostname after owner instruction. Do not delete databases, buckets, grants or receipts, and do not redirect v0.9 traffic. Code rollback does not reverse D1 migrations or subsequent accepted writes. No temporary authority or messaging switch was enabled.

## 31 Oct 2026 14:06 SGT: v0.9.9d (main 5c202c0), reported by owner

Bundle `deploy/2026-10-31-v0.9.9d`. Same six components. Adds resumable D1 import preparation (PR #32) and immutable allocation audit versions.
- Owner checks: Roster and Deploy headers v0.9.9d; Assign Relief, System Config, Storage, LORD, Calendar load.
- D1 job health 14:06 (verified by Claude): all jobs idle; only peer-mail (known) and one webhook failure in the last 45 minutes.
- Rollback constraint: once a v0.9.9d import starts, keep the Roster backend at v0.9.9d or later.
- Next: owner rehearsal import (explicit restart of the failed 31 Oct session).

## 31 Oct 2026 10:07 SGT: v0.9.9c (main ef037a2), reported by owner

Bundle `deploy/2026-10-31-v0.9.9c`. Deployed the same six components as v0.9.9b (Roster and Deploy backends and frontends, both Workers). Adds nightly cold-output archive (PR #28).
- Owner checks (31 Oct): Roster and Deploy headers v0.9.9c; Prune records now Storage with Archive now; Assign Relief, System Config, LORD and Calendar load.
- **Rollback constraint:** after the first archive run (first evening 16:00 to 24:00 after deploy, i.e. 31 Oct evening), never roll the Roster backend back to v0.9.9b or earlier; it cannot read archived items.
- D1 job health 10:07 (verified by Claude): last hour only peer-mail (known, 46), one webhook and one notifications timeout before the deploy.

## 31 Oct 2026 ~05:00 SGT: v0.9.9b (main 6eb943f), reported by owner

Bundle `deploy/2026-10-31-v0.9.9b` (branch, folder `deploy-bundle`; SHA256SUMS inside). Deployed: Roster backend, Deploy backend, Roster frontend, gsis-roster-notifications, gsis-operations, Deploy frontend. Not deployed: optional label-only zips for Contacts, Layout, Calendar, LORD, OVERLORD, STARLORD, Venues (still show v0.9.9).
- Owner checks (31 Oct): header v0.9.9b, System Config loads, published chip, SIUE fields, LORD and Calendar load: all yes. All 12 held absence reports retried and cleared.
- Live setting: Apps Script "Roster GSiS" Script Property `ROSTER_OPERATIONS_MAX_CHARS=24000000` (set 31 Oct ~04:30; an earlier entry in Cloudflare variables has no effect).
- D1 job health 05:09 (verified by Claude): intake, allocation, notifications, inbox, webhook idle since ~05:03. peer-mail still fails each minute (changelog entry 31 Oct).
- Storage report 04:47: 16,079,661 of 24,000,000 characters.
- Rollback: Apps Script previous versions; Pages and Workers previous deployments (30 Oct bundle 6bb4844).

## 30 Oct 2026 evening: bundle 6bb4844 (v0.9.9a label), reported by owner
Backends and Workers deployed first; the first two frontend uploads failed (raw-folder zips with unbundled `_worker.js`). Replaced by release-built zips the same evening and deployed. Lesson: frontend zips come only from the release build.

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
