# contacts-edit-info-ttb-filter: Codex takeover of Contacts PR #35

- Status: claimed
- Owner/model: Codex
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 2026-11-01 08:31
- Branch: codex/contacts-edit-info-ttb-filter
- Base SHA: PR #35 exact head a7cf72dc1368279e3014c0cbcce2bfeacfcd91da; main observed at 0860d6b29b03fb55544cc0f452851009364570b4
- Current head SHA (or PR head; avoid self-referential commit hashes): implementation not yet published
- PR: replacement for https://github.com/helper-gsps/gsis/pull/35, to be opened after the complete gate is green
- User-authorised scope: owner transferred Row C from Gemini to Codex; start from #35 latest exact head, resolve Claude's three blocking review items, and open a replacement PR that supersedes #35.
- Files/domains owned: contacts-update/public/app.js, contacts-update/public/index.html, tests/contacts-edit-info-filter.cjs, this task record.
- Out of scope: Roster, shared domain code, release assembly, generated Workers, backend/API changes, deployment, live settings, school records and messages.
- Acceptance checks: partial TTb name matches with NFKC and collapsed spaces; hidden-row drafts remain in the complete save payload; Escape clears; Showing N of M staff; Reload leaves permitted cells editable; filtering preserves full-data Save, Reload, Recalculate and add-row operations. Run build before tests after every branch switch. Full Node and LORD green on the exact published head before opening the PR.

## Decisions and changes

The owner explicitly transferred the Gemini assignment to Codex. PR #35 remains open until its replacement exists. Preserve its lineage; reconcile the accepted claim/current main in the Contacts branch without editing lane R implementation.

Claude's review at 65bd942914eb5d95531b74e3daf0589526d125b0 identified a loading lock, a string-only test and an inaccurate PR description. The later Gemini reply is unverified. Re-read #35 at a7cf72dc1368279e3014c0cbcce2bfeacfcd91da before branching.

## Verification

No implementation checks claimed by this documentation-only claim. Exact-tree local checks and the existing push-triggered full GitHub workflow will supply evidence; unavailable browser/history checks will be recorded as omissions, never passes.

## Review

Claude must review the eventual exact replacement head. No Claude approval is claimed.

## Deployment

Not deployed to staging or production. No live records, settings or messages changed.

## Handoff

Codex owns the task and branch. Resolve the review, record actual command outcomes, publish only this branch, wait for the complete gate, then open the replacement PR for Claude and the owner. The owner retains merge/deployment decisions.
