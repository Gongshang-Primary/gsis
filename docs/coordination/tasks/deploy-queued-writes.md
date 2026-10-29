# deploy-queued-writes: Deploy edits feel instant via a Worker queue, like LORD; keep clash detection and who-did-what notices

- Status: approved (owner go 30 Oct 2026, all logged items); after lord-queued-writes phase 2 so both share one queue design
- Owner/model: Codex (builder), Claude (architect and reviewer)
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 30 Oct 2026 06:40
- Branch: codex/deploy-queued-writes
- Base SHA: current main
- PR: none
- User-authorised scope: Song Wee, 30 Oct 2026: "for deploy read/writes to be similar as lords: keep clash detection and user identity/action notification".
- Files/domains owned: public/app.js (Deploy UI, cell queue, conflict display), public/_worker.js, Deploy backend save/receipt operations, the shared job queue from lord-queued-writes, tests.
- Out of scope: DEPLOY_EDGE_AUTHORITY / D1 as the record (edge-deploy*.js stays as is); Roster.

## Intent
Same pattern as lord-queued-writes: each Deploy edit gets a Cloudflare receipt in under a second and shows "Submitted, please wait for confirmation" with its time; Apps Script applies it to Google in the background; if the queue is unavailable before a receipt, fall back to today's direct save. Google stays authoritative.

## Must keep (current behaviour, public/app.js)
1. Clash detection: saves carry an expected revision; the backend returns `conflicts`, shown by `showConflicts(...)` and stored as `conflictNotices` on the version; class-rename drafts detect `classDraftRecoveryConflict`. A queued edit that clashes must come back as a conflict notice with the other person's value, never silently overwrite.
2. Identity and action notices: every applied change records who made it and what changed, and other editors see it (existing notices / version notes). Queued edits keep the original actor, not the queue worker.
3. The existing local cell queue (`cellQueue`, `queueFlight`) and draft recovery: the server queue replaces only the network step; local drafts still survive refresh.

## Acceptance
- An edit shows "Submitted, please wait for confirmation" within 1 s, then "Saved" or a conflict notice.
- Two editors change the same cell: one saves, the other gets a conflict notice naming the first editor and value.
- Change history and notices show the real editor for queued edits.
- Queue down: direct save still works, with a visible note. A retried click never applies twice.
