# Permanent publication time chip

- Status: implementing on a prepared branch; PR waits for an available slot.
- Owner/model: Codex
- Reviewer/model: Claude
- Branch: codex/roster-published-time-chip
- Base SHA: 3acac232db267f8954f1c680b78fc9fb3316a039
- PR: none

Model: Codex. Queue row 6: add a permanent Assign Relief chip beside the date. It reads Not published or Published HH:MM in Singapore time. Saved changes newer than the published revision turn it amber and say changes not yet visible. Tooltip contains full date/time only, no publisher. Update from current loaded data without extra requests and never display another selected date's publication.

Implemented the permanent toolbar chip using loaded server revisions and existing publication update calls. No extra API polling. Logic and JavaScript syntax checks passed in the available JavaScript runtime after the workspace disconnected; DOM/full-app and component-build validation now run in Linux CI. No merge or deployment.
