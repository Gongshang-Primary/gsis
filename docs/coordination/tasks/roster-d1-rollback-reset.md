# roster-d1-rollback-reset: R1 recovery after manual rollback

- Status: claimed
- Owner/model: Codex
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 2026-11-02 13:50
- Branch: codex/roster-d1-rollback-reset
- Base SHA: 50ac0b1fe2bd2c73b5c4555969df4fdaf43ca318
- Current head SHA: see PR head
- PR: pending
- User-authorised scope: Attempt 3 R1, lane R cutover-blocker exception. Add an Admin reset only after verified manual rollback.
- Files/domains owned: shared/edge-store.js, shared/roster-import.js, shared/edge-setup.js/html, roster-update/public/edge-roster.js, relevant tests and canonical generated copies/bundles.
- Out of scope: production settings or authority changes; #38/#40-#48; Deploy migration; live records and sends.
- Acceptance checks: reject fenced Google or non-legacy Cloudflare authority; retain evidence; reset both Roster heads atomically; clear mirror generation/outbox; audit; resume a new import; full Node and LORD green.

## Decisions and changes
The owner explicitly authorises R1-R4 and R6 as separate draft PRs despite the normal one-open-lane-R default. Implementation remains serial. Google must prove legacyWritesDisabled is exactly false before reset. Unknown proof fails closed.

## Verification
Not run for implementation yet. Baseline build and full suite started from exact main.

## Review
Claude reviews the exact PR head. Advisory review remains separate from owner merge.

## Deployment
Not deployed. No live authority or school records changed.

## Handoff
Build R1, run checks, open draft PR, record exact head for Claude, then continue R2.
