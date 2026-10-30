# roster-assigned-by-label: show who assigned relief

- Status: review; full suite completed with three reproduced baseline failures
- Owner/model: Codex
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 2026-10-30T09:05:05.466157+08:00
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

One shared assignmentBy projection reads origin and the assignment actor. Automatic work shows Auto-allocation, mutual work Peer arrangement, shared-subject combinations Shared subject rule, and manual work the recorded editor. Missing actors show Not recorded. An explicit smc origin takes precedence over stale peer flags.

Daily Notify updates the derived label even when unchanged timetable content reuses its prior rows and notice identity. Published My Relief Duties reads the retained assignment snapshot, so unpublished SMC ownership is not exposed. The teacher table now shows Assigned By. Daily relief, full teacher and Class POV Excel share the label, including unsaved local SMC choices; the existing snapshot/export labels stay intact.

Canonical sources and all generated copies were rebuilt. No assignment origin, publisher, receipt, communication snapshot or saved history is rewritten by a read. Existing saved-day/recipient semantics remain in force.

Automatic approval review rejected the documentation-only main claim because main is reserved for owner merges. Main was not advanced. The claim is published on this feature branch as 4f664707f76a5b536c377e5b2c0067ad93d466f1. The safer feature-branch/PR path is used, as on PR #12.

## Verification

Five focused regression cases were first run on unchanged main and all failed for the expected missing-provenance behaviour. They pass after the fix. Existing offline-export verification now also inspects all three real XLSX outputs for the local editor and renders the ordinary teacher table from a published duty. Legacy workbook text expectations include the explicit Not recorded label.

Full suite completed on local commit e2c6f079410f3dff526771e124e09110720371b9, source tree d8f6ade193b51efb1cb8ec999d1908ccc3ebacfa. `TZ=Asia/Singapore npm test` returned 1: 872/875 Node programs passed. The three named failures all reproduce on unchanged merged main 50c5283c3d4c6ad39f31273541cb78d0b35bd4f1. This is not an all-green suite. `package.cjs` lacks historical Q; `roster098o-preparation-package.cjs` and `roster098o-timetable-export.cjs` use expired fixed capture-window fixtures. Later assertions in those programs are not claimed as covered. Six optional historical comparisons were not run.

LORD initially stopped because the browser environment lacked LORD_TEST_CHROMIUM. With that variable set to /tmp/chromium, all 38/38 LORD programs passed. Build passes, including the 85-file Apps Script ES2020 gate; a repeated build leaves product bytes unchanged. The five new regression cases, existing publication/privacy checks, browser notification UI, ordinary teacher table and all three actual XLSX exports pass. [Machine-readable evidence and every Node program outcome](../review/roster-assigned-by-tests.json).

Main advanced to e9e5ccc77c6c9b677450bd5e5f75e747232cc1a3 during testing with only the queue and three new SRE/FAJT task documents. All four are retained byte-for-byte. Product/test blobs still equal the fully tested commit. No new full-suite run is claimed after that documentation integration.

No fresh dependency install, staging, school sign-in, live latency or real delivery check was run. The exact original base tree equals The exact base tree equals PR #12's reviewed tree 1fb4fd9f5e35d3b5672af95a543e15e5f7c0eb76. Its full Node run reported 871/874 with three baseline failures: package.cjs lacks historical Q, roster098o-preparation-package.cjs and roster098o-timetable-export.cjs have expired capture-window fixtures. LORD passed 38/38. These are historical results, not this task's run.

No live or staging verification is claimed. The earlier counts above remain historical evidence, distinct from this task's 872/875 run.

## Review

Claude review pending. Advisory model review is separate from owner approval.

## Deployment

Not deployed to staging or production. Google remains authoritative. No configuration changes or live notifications.

## Handoff

Codex implements this bounded task. Claude reviews the final exact head. Owner decides merge and release. Next is the newly inserted row 2b, roster-sre-daily-priority; it remains unclaimed until this serial Roster task is integrated or explicitly handed off. The subsequent SRE-with-timetable and FAJT tasks retain their own recorded decisions and open point. Rollback uses the previous matched source and generated bundles; no data migration is expected.
