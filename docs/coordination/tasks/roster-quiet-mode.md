# roster-quiet-mode: SMC quiet-mode toggle on Assign Relief

- Status: claimed
- Owner/model: Claude
- Reviewer/model: Codex
- Last updated (Asia/Singapore): 28 Oct 2026 21:15
- Branch: claude/roster-quiet-mode
- Base SHA: ba778101a25e7dd0e4838917b4c0cdebb1b7eaf4
- Current head SHA (or PR head; avoid self-referential commit hashes): pending
- PR: pending
- User-authorised scope: Song Wee, 29 Oct 2026: toggle on Assign Relief for SMC and Admin that pauses lock-competing background jobs; ends automatically on "Let teachers see", any "Send WhatsApp" action, or 07:15 SGT; after 07:15 it can be switched on for 30 minutes; new absence reports keep processing; WhatsApp sending keeps running.
- Files/domains owned (include generated outputs): roster-update/public/_worker.js, roster-update/public/roster-operations-ui.js (toolbar only), notification-worker/index.js, shared quiet-mode module, generated Worker bundles, new tests. Overlaps PR #3 (same implementer).
- Out of scope: backend Apps Script, absence policy, D1 import.
- Acceptance checks: toggle visible to SMC/Admin only; state in D1 with actor and expiry; notification Worker skips scheduled allocation, peer mail and audit export while active; received reports, notifications, inbox and webhook continue; auto-off on publish/send success and at expiry; audit trail.

## Decisions and changes

## Verification

## Review

## Deployment

## Handoff
