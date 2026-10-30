# roster-stapler-all-dates: upcoming suspension dates and sponsor access

- Status: implementing
- Owner/model: Codex
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 31 October 2026
- Branch: codex/roster-stapler-all-dates
- Base SHA: e196f80978ebfa0c237312fe0cb42cb2029a02e0
- PR: not opened
- User-authorised scope: owner assigned queue row 10 on 31 October 2026; all upcoming suspended dates and request an SMC sponsor for planning access.
- Files/domains: shared/roster-operations.js, roster-update/public/roster-stapler-ui.js, generated copies, regression tests.
- Out of scope: changes to existing approval, publication, per-date locks, live records, notifications or deployment.

## Decisions
List upcoming unconfirmed dates using neutral metadata only. Date visibility never grants access to the unconfirmed plan. Confirmed snapshots retain their existing read-only projection. Approved teachers retain existing planning/publication permissions. Show an explicit request action for a listed date while reusing the existing request form and notification contract.

## Acceptance
Active ordinary teachers see upcoming unconfirmed and confirmed dates, without private draft names/content/revisions. Inactive and unmatched accounts receive no new dates. Existing sponsor approval is required for edit/publish. Pending requests stay idempotent. Existing confirmed timetable shortcuts work.

## Verification
Pending. Local shell cannot start because sandbox provisioning fails; Linux CI will run the real build then complete regression suite. No test pass, merge, deployment or live verification is claimed.

## Handoff
No main writes. No PR until an available slot is authorised by the controller. Claude reviews the exact final commit.
