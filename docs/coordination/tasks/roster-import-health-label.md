# roster-import-health-label: restore the import job in System Health

- Status: merged (#60 at 5dc0f5c as 88588e9)
- Owner/model: Codex
- Reviewer/model: Claude, exact final PR head
- Last updated (Asia/Singapore): 2 November 2026, 23:12 SGT
- Lane: R, owner-authorised isolated UI correction
- Branch: codex/roster-import-health-label
- Base SHA: 9c6a4e1f993b5262b5bffc99453dd7749d6049e8
- Current head SHA: pending implementation; final exact head will be in the PR
- PR: pending
- User-authorised scope: restore `'roster-import':'Roster import'` in a small PR. Owner confirms #49 through #57 and #59 merged, main labelled v0.9.9h. #58 remains deferred; when resumed, rebase directly onto main.
- Files/domains owned: `roster-update/public/system-health.js`, this task record and the associated `CHANGELOG.md` entry. No generated-output changes expected; run the existing canonical build.
- Out of scope: #58, held product PRs, import execution, activation, authority/settings, deployment, school records and notifications.
- Acceptance checks: import job and recent failure render as Roster import; unknown jobs remain filtered; existing System Health UI checks pass; canonical build and full Node/LORD CI pass with `TZ=Asia/Singapore`.

## Decisions and changes

The shared LABELS allowlist controls job and recent-failure rendering. Main's map omits roster-import, causing both views to hide retained import health evidence. Restore its existing display label only. Existing held PRs do not own this file; the owner explicitly assigned this correction after the cutover-blocker merges.

## Verification

Not run yet. The workspace has no authenticated Git clone or locked jsdom dependency. Use a temporary native-Node rendering reproduction locally and the repository's existing branch-push CI for the full canonical build, browser, Node and LORD checks before opening the PR. Do not describe unavailable local full-suite checks as passes.

## Review

Claude review pending at the exact final head. Owner merges.

## Deployment

Not deployed. No live record, configuration, authority or provider action is authorised by this task.

## Handoff

Implement the single label restoration, verify it, and open a small PR against main. Keep #58 deferred.

## Backlog refresh claim, 6 November 2026

Codex resumes #60 under the owner's instruction to clear the backlog continuously. Reconstruct the single label fix on main 69efd3ab9f0dbbb31f1a3bc7da9c86b3dc2ea348; retain current Drive and Venues health labels. Preserve existing branch history while incorporating current main. Claude reviews the new exact head; owner merges. No live operations.


## Backlog rebase, 13 November 2026

Model: Codex. Reviewer: Muse at the final exact head. Rebased the original net patch onto current main; kept both changelog histories and the single import-label product change. Canonical build is unchanged. Five existing health UI programs and a temporary synthetic import job/recent-failure rendering check passed; unknown jobs remain filtered. Full exact-head CI and head will be recorded in PR #60; earlier approvals do not carry. No live operations.
