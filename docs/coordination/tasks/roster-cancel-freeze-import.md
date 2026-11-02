# roster-cancel-freeze-import: stop server import when its freeze is cancelled

- Status: verifying
- Owner/model: Codex
- Reviewer/model: Claude, exact PR head
- Lane: R
- Last updated (Asia/Singapore): 3 November 2026
- Branch: codex/roster-cancel-freeze-import
- Base SHA: fa4bc0237086f1ae203536f767a08e3269dfe31c
- Current head SHA: final exact head recorded in the draft PR
- PR: pending draft
- User-authorised scope: owner 3 November, top-priority fix from roster-d1-cutover-attempt3.md. A confirmed Cancel freeze must stop its server-driven import, retain evidence and show "Import stopped because the freeze was cancelled".
- Files/domains owned: shared/roster-cutover-freeze.js; roster-update/public/edge-roster-import-runner.js and edge-roster.js; shared/edge-setup.js; focused import/freeze tests; generated Worker/frontend copies; task and changelog.
- Out of scope: live imports, live settings or records, deployment, activation, deleting retained evidence, unrelated held product changes.
- Acceptance checks: cancel during preparation and staging admits no later steps or Google calls; a new freeze/import succeeds; race/retry guards retain evidence; full build and Node/LORD checks.

## Decisions and changes

Work starts from current main. Owner explicitly authorises this urgent lane R fix while #61 remains open; no changes to its branch. Recheck main before handoff and rebase if #61 merges. The owner targets v0.9.9i and merge by 17:00 SGT; Claude reviews and the owner merges.

Confirmed Google cancellation and the D1 stop commit together. The existing import locks admit one unfinished session. Cancellation marks its job stopped with `ROSTER_IMPORT_FREEZE_CANCELLED`, moves its session to the existing failed/restart-required state and invalidates both write and preparation claims. Source snapshots, checkpoints, staged rows and receipts remain retained. No schema change or record deletion is needed.

The runner rechecks its claim before each signed Google request and after each response. A pending cancellation pauses admission; confirmed cancellation prevents late preparation or staging responses from committing. Calendar reference requests use the same guard. The stop statements check the prior freeze revision inside the transaction, so a losing duplicate cancellation cannot stop a replacement import. Restart uses the existing explicit evidence-preserving recovery flow, followed by a new request. Repeated starts never revive the old job. The UI shows "Import stopped because the freeze was cancelled" on cancellation, status and a polling tab.

The claim is included in this PR. Automatic approval review rejected a direct documentation-only update to main, so main was not updated. This branch contains the bounded claim and implementation together.

## Verification

The new regression first reproduced runnable jobs after cancellation and further Google calls after late responses. Nine SQLite/D1 cases pass: preparation and staging cancellation, both late-response cases, a staging commit race, cancellation-transaction recovery, stale cancellation, replay and a duplicate cancellation losing its transaction race. Evidence digests remain identical after the confirmed stop; restart followed by a fresh freeze/import reaches imported. The UI regression covers status, polling and the confirmed Cancel action.

The final `TZ=Asia/Singapore npm run build` passes. All 16 focused import/freeze/setup/store programs and all 39 LORD programs pass. Full GitHub Node/LORD CI is pending; the exact result and head will be recorded in the draft PR. Existing cutover queue test failed identically on unchanged main after its fixed 2 November date became past. This branch carries the same pinned clock and restoration as #61, with every original assertion retained.

## Review

Claude review pending at the final exact head.

## Deployment

Not deployed. No live configuration or records changed.

## Handoff

Finish full verification, then open a draft PR with Model: Codex and the exact head for Claude. The owner merges. No release version bump is included; the owner packages v0.9.9i. Rollback restores the previous cancellation behaviour, so do not roll back with a cancelled import still able to run. Live Apps Script, Cloudflare and operator acceptance remain untested; an already dispatched Google request cannot be recalled, but its late result cannot advance the cancelled import.

