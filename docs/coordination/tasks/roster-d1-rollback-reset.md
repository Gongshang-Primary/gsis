# roster-d1-rollback-reset: R1 recovery after manual rollback

- Status: verifying
- Owner/model: Codex
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 2026-11-02, this session
- Branch: codex/roster-d1-rollback-reset
- Base SHA: 50ac0b1fe2bd2c73b5c4555969df4fdaf43ca318
- Current head SHA: see PR head
- PR: pending
- User-authorised scope: Attempt 3 R1, lane R cutover-blocker exception. Add an Admin reset only after verified manual rollback.
- Files/domains owned: backend/RosterEdgeMigration.gs, shared/roster-import.js, shared/edge-setup.js/html, roster-update/public/edge-roster.js, relevant tests and canonical generated copies/bundles.
- Out of scope: production settings or authority changes; #38/#40-#48; Deploy migration; live records and sends.
- Acceptance checks: reject fenced Google or non-legacy Cloudflare authority; retain evidence; reset both Roster heads atomically; clear mirror generation/outbox; audit; resume a new import; full Node and LORD green.

## Decisions and changes
The owner explicitly authorises R1-R4 and R6 as separate draft PRs despite the normal one-open-lane-R default. Implementation remains serial. Google must prove legacyWritesDisabled is exactly false before reset. Unknown proof fails closed.

## Verification
The new regression first failed on the missing reset operation. Core and UI checks now pass for exact legacy authority, false Google fence proof, Admin access, atomic retained evidence, lost reset acknowledgement, incomplete Google cleanup, safe replay and a new import. Full suite pending. Local runtime initially lacked Chromium.

## Review
Claude reviews the exact PR head. Advisory review remains separate from owner merge.

## Deployment
Not deployed. No live authority or school records changed.

## Handoff
Build R1, run checks, open draft PR, record exact head for Claude, then continue R2.

Claim-only main update was rejected by automatic approval review. The claim is retained on this PR branch instead.

Reload recovery returns the current Admin's pending reset request, including an import originally owned by a different Admin. Local shards ran every Node program and LORD. Four initial environment/load failures were rerun; the package check still needs the historical Git ancestry available in CI. CI verifies the pushed branch before its draft is opened.

A final gateway regression reproduced a 404 before authentication because the legacy preparation allowlist omitted resetAfterRollback. Added that exact operation, retaining the preparation flag, same-origin/session, current Admin and signed Google-fence checks. The new gateway test passes along with core/UI checks. This supersedes the earlier green head for merge; review and full CI must use the latest PR head.
