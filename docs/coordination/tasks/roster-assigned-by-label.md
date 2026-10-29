# roster-assigned-by-label: show who assigned relief

- Status: claimed
- Owner/model: Codex
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 30 October 2026, 07:00
- Branch: codex/roster-assigned-by-label
- Base SHA: 50c5283c3d4c6ad39f31273541cb78d0b35bd4f1
- Current head SHA: claim commit, then the exact PR head
- PR: not opened
- User-authorised scope: row 2 of docs/coordination/plans/2026-11-codex-queue.md. Owner approved all logged items on 30 October and directed serial, top-to-bottom implementation with a full suite and Claude review at each exact head.
- Files/domains owned: shared/roster-operations.js; related Roster display/export code only if needed; generated copies in backend/Code.gs, Roster and Deploy backends, browser domain and notification/operations bundles; focused provenance regression and this task/changelog.
- Out of scope: allocation rules, quota, publication or notification policy, delivery-time formatting, publication time chip, other queue rows, live records, messages, deployment and ROSTER_EDGE_AUTHORITY.
- Acceptance checks: automatic, SMC-edited automatic, direct manual and peer relief show their own provenance; another publisher/viewer cannot become the assigner; teacher-facing projections and Excel agree; publication/communication identities and stored evidence remain stable; regenerate outputs and run the full suite in Asia/Singapore.

## Background and approved behaviour

The owner reported on 29 October that Wen Di's automatically assigned P12 cover for Danning showed the publisher's email in Assigned By. The pending changelog points to dailyPublication in shared/roster-operations.js: it currently reads assignment.publishedBy, then Stapler.confirmedBy, then the current viewer. These are different actions.

Derive the label from the relief assignment: automatic allocation, auto-fill and scheduled work show Auto-allocation; an SMC/manual replacement shows the actor who made the choice; mutual cover shows Peer arrangement. Keep publication actor metadata separate. Do not invent an actor for a legacy assignment with no recorded provenance. Use existing assignment/snapshot fields rather than adding a new mutable history store.

Trace teacher/publication/communication and existing Excel projections. Retain published snapshot boundaries so an unpublished change cannot alter an ordinary teacher's visible published duty. Assignment attribution alone must not create a new timetable change, acknowledgement or provider send.

## Coordination and dependencies

PR #12 is merged as 50c5283c3d4c6ad39f31273541cb78d0b35bd4f1 after Claude reviewed b0664ce461274e950e5e0fbb13808de1b4f12903 with no blocking finding. PR #8 is also merged. Current GitHub search found no open PRs. Older task statuses still say review; their merged PRs supersede those snapshots. No other Roster implementation is claimed by this task.

## Decisions and changes

Use the existing origin and assignment actor fields. Read/publication/export projections may gain a derived Assigned By label; authority and allocation writes remain unchanged. Follow canonical builders for every generated copy.

## Verification

Not run yet for this task. The exact base tree equals PR #12's reviewed tree 1fb4fd9f5e35d3b5672af95a543e15e5f7c0eb76. Its full Node run reported 871/874 with three baseline failures: package.cjs lacks historical Q, roster098o-preparation-package.cjs and roster098o-timetable-export.cjs have expired capture-window fixtures. LORD passed 38/38. These are historical results, not this task's run.

Focused checks, full-suite outcomes and any exclusions will be recorded before review. No live or staging verification is claimed.

## Review

Claude review pending. Advisory model review is separate from owner approval.

## Deployment

Not deployed to staging or production. Google remains authoritative. No configuration changes or live notifications.

## Handoff

Codex implements this bounded task. Claude reviews the final exact head. Owner decides merge and release. Row 3 remains unclaimed until this serial Roster task is integrated or explicitly handed off. Rollback uses the previous matched source and generated bundles; no data migration is expected.
