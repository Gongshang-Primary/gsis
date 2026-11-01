# contacts-edit-info-ttb-filter: Codex takeover of Contacts PR #35

- Status: implementing
- Owner/model: Codex
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 2026-11-01 08:40
- Branch: codex/contacts-edit-info-ttb-filter
- Base SHA: PR #35 exact head a7cf72dc1368279e3014c0cbcce2bfeacfcd91da; main observed at 0860d6b29b03fb55544cc0f452851009364570b4
- Current head SHA (or PR head; avoid self-referential commit hashes): PR #35 inherited at a7cf72dc1368279e3014c0cbcce2bfeacfcd91da; replacement publication pending
- PR: replacement for https://github.com/helper-gsps/gsis/pull/35, to be opened after the complete gate is green
- User-authorised scope: owner transferred Row C from Gemini to Codex; start from #35 latest exact head, resolve Claude's three blocking review items, and open a replacement PR that supersedes #35.
- Files/domains owned: contacts-update/public/app.js, contacts-update/public/index.html, tests/contacts-edit-info-filter.cjs, this task record.
- Out of scope: Roster, shared domain code, release assembly, generated Workers, backend/API changes, deployment, live settings, school records and messages.
- Acceptance checks: partial TTb name matches with NFKC and collapsed spaces; hidden-row drafts remain in the complete save payload; Escape clears; Showing N of M staff; Reload leaves permitted cells editable; filtering preserves full-data Save, Reload, Recalculate and add-row operations. Run build before tests after every branch switch. Full Node and LORD green on the exact published head before opening the PR.

## Decisions and changes

The owner explicitly transferred the Gemini assignment to Codex. PR #35 remains open until its replacement exists. Preserve its lineage; reconcile the accepted claim/current main in the Contacts branch without editing lane R implementation.

Claude's review at 65bd942914eb5d95531b74e3daf0589526d125b0 identified a loading lock, a string-only test and an inaccurate PR description. The later Gemini reply did not establish correctness. Re-read #35 at a7cf72dc1368279e3014c0cbcce2bfeacfcd91da before branching. The inherited task record incorrectly said merged; this accepted claim replaces that stale ownership/status.

The latest source already normalized width/spaces and debounced input. Its acceptContactViewState path rendered while loading, then manually unlocked cells; no final render restored the filtered status. A real DOM test failed after Reload because the matching count was overwritten by Ready. Render once in finally after dataLoading=false so the final grid and count reflect the filter without locking editable cells.

Replace the inherited test that invoked renderData() directly with real sign-in/fetch/DOM events. Exercise partial case-insensitive and NFKC/collapsed-space matching, deferred input rendering, read-only loading preview, editable text/select cells after Reload, computed-cell protection, complete hidden-plus-visible save changes, no-match count, Escape, Recalculate over all staff, and add-row filter clearing/focus. Close the JSDOM window even on failures.

Reconcile current main/accepted claims while keeping #35 as the first parent; no lane-R implementation is edited.

## Verification

- Inherited exact #35 tree: 1dc5a010b709b62a17b3fb9db0d5b3b4e03bfa13; both its root tree and original a7cf72d commit were reconstructed and hash-verified locally.
- TZ=Asia/Singapore npm run build: passed before npm test after switching to the assigned branch.
- TZ=Asia/Singapore npm test: attempted locally; browser-dependent scripts fail because Chromium is absent, and complete historical Git objects are unavailable. This is not a full local pass. No browsers were installed and no tests were weakened.
- TZ=Asia/Singapore node tests/contacts-edit-info-filter.cjs: new test first failed against inherited source at the filtered count after Reload; passed after the final-render fix. It uses application DOM handlers and the real serialization path, with fixture HTTP responses.
- Final reconciled TZ=Asia/Singapore npm run build: passed; generated outputs match current main, with no generated-file edits in this task.
- Targeted checks passed: tests/contacts-edit-info-filter.cjs, tests/contacts-data-loading.cjs, tests/contacts410-save-ui.cjs, tests/contacts502-ui.cjs and tests/contacts503-ui.cjs, all with TZ=Asia/Singapore.
- TZ=Asia/Singapore npm run test:lord: attempted; stopped at tests/gsis098h-background-ui.cjs because Chromium is absent. Earlier checks ran, but this is not a complete LORD pass.
- Final local npm test was started after the reconciled build; browser-dependent scripts fail because Chromium is absent. The existing codex/** push workflow must complete the full Node and LORD suite on the exact published head before opening the replacement PR; its body will record the actual run and SHA.

## Review

Claude must review the eventual exact replacement head. No Claude approval is claimed.

Internal Codex advisory review independently ran the filter and Contacts 503 DOM checks and found no blocking final-render issue. Two inherited non-blocking display limits remain: filtered read-only KP users see View only without the count, and successful Save shows Saved without the count until the view is rendered again. These are disclosed for Claude's review; no other-model approval is claimed.

## Deployment

Not deployed to staging or production. No live records, settings or messages changed.

## Handoff

Codex owns the task and branch. Resolve the review, record actual command outcomes, publish only this branch, wait for the complete gate, then open the replacement PR for Claude and the owner. The owner retains merge/deployment decisions.
