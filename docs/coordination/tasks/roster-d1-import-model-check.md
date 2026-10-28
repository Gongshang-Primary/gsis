# roster-d1-import-model-check: D1 import fetches models without re-checking the whole Roster

- Status: claimed
- Owner/model: Claude
- Reviewer/model: Codex
- Last updated (Asia/Singapore): 28 Oct 2026 21:00
- Branch: claude/roster-d1-import-model-check
- Base SHA: 41bde7bc18775fa16e6b4e93e7413cc9edffe986
- Current head SHA (or PR head; avoid self-referential commit hashes): pending
- PR: pending
- User-authorised scope: Song Wee, 29 Oct 2026 ~05:00 SGT: make the import less stringent; "yes" to changing edgeModel and edgeAudit only.
- Files/domains owned (include generated outputs): backend/Code.gs, backend/RosterEdgeMigration.gs (edgeModel, edgeAudit dispatch only); generated Roster_Backend_v0.9.9.gs and Deploy_Backend_v0.9.9.gs; related tests.
- Out of scope: activate/fence logic, Worker import flow, absence policy, UI.
- Acceptance checks: import no longer fails with "Roster changed during export" when unrelated Roster data changes between export and model/audit fetch; a model or audit archive whose content differs from the export still fails; activation digest check unchanged.

## Decisions and changes

## Verification

## Review

## Deployment

## Handoff
