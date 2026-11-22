# Review of PR #276 — Roster: queue contact_review to Contacts Power Users (W1)

- **Reviewer:** Muse, at the exact head, under the owner's 16 Nov 2026 directive (Muse is the v1 reviewer at the exact head SHA, replacing Claude until Claude returns; source commit 12b06eb). No code, merges, or coordination by Muse.
- **PR:** #276, "Model: Claude / v1 Roster: queue contact_review to Contacts Power Users (W1)". Branch `claude/v1-roster-contact-review`. Head reviewed: `5e995e50`.
- **Status at review:** OPEN, not a draft. Product CI green at the head; Node/LORD CI green at the head. MERGEABLE/CLEAN.
- **Verdict: APPROVED at the exact head 5e995e5.** No findings.
- **Head note:** the PR body names the earlier head `26ca1c36` as the reviewed head. That head was superseded: the branch was merged with origin/main (through ab19517, the #263 merge) and the current head is 5e995e5, a merge commit. This review is at 5e995e5, and both CI suites below are verified at 5e995e5. The body's note that "main still carries the red recovery test until #263 merges" is likewise stale — #263 merged as ab19517.

## What it does

Closes a v0.9 baseline gap from the WhatsApp template review (`docs/v1/WHATSAPP_TEMPLATE_REVIEW_2026-11-21.md`, row 3 / W1): v0.9 `contactCreate` queued a `contact_review` after Roster created a new inactive external relief contact; v1 `createRosterContact` queued nothing. Owner decision (21 Nov 2026): recipients are **Contacts Power Users only**; Global Admin alone does not receive it.

- `v1/services/core/service.mjs`: internal `/internal/contacts-power-users`, bound to a valid Roster decision (409 `AUTHORITY_CHANGED` if the decision evidence is stale, 403 `SERVICE_DENIED` if it is not a Roster decision). Returns the staff IDs of non-suspended accounts with a current explicit `contacts.powerUser` or `contacts.manage` grant, bounded at 512 (`LIMIT 513`, 413 `ACCOUNT_BOUNDS` above it). Global Admin is not included — only explicit grants count.
- `v1/services/roster/service.mjs`: `queueContactReview` runs after a new-contact save (prepare/commit; a retry replays the original receipt). One job per current Power User, keyed `contact-created:<operationId>:<staffId>` (per recipient), carrying the exact summary, `staffId`, and the four contract-ordered fields (`recipient_name`, `request_date`, `contact_review_details`, `contacts_review_url`). It runs only for a genuinely new contact (`saved === true`, no `staffId`/`existingStaffId` in the body) — not for the existing-contact mobile update. `dispatchRosterJob` rechecks at send time: if the recipient is no longer a Power User, the job is cancelled with `RECIPIENT_NO_LONGER_POWER_USER`.
- Template `contact_review` → `gsis_contact_review_v1` (APPROVED on Meta). The button version (W4) is out of scope, as are any live setting, template submission, provider send, and deployment.

## Scope and mergeability

- Diff against base ab19517: exactly 5 files, matching the task record's scope — task record, `tests/v1-product-roster-adhoc-delivery.mjs`, `tests/v1-product-roster-contact-review.mjs` (new, 59 lines), `v1/services/core/service.mjs`, `v1/services/roster/service.mjs`. 211 insertions, 3 deletions.
- `git merge-tree --write-tree --name-only origin/main 5e995e5` produced a clean tree (5fbb866f). No conflicts.
- `git diff --check` clean. Secrets scan of the diff matched only the test's synthetic `GSIS_SECRET` fixture. No real secret in the diff.
- Zero v0.9 drift: `git diff --exit-code -- roster-update/ public/ shared/` clean.

## CI verified at the exact head

- **Product ("Isolated v1 product"):** run 44971517159, completed, success, head_sha 5e995e5, attempt 1. It ran 28m5s — inside the 30-minute cap (and inside the 60-minute cap #274 raises it to).
- **Node/LORD ("Verify GSiS queue changes"):** run 44971513471, completed, success, head_sha 5e995e5, attempt 1. All four regression shards and the full-suite gate pass. No waiver is needed or used: this is a `claude/**` branch and both suites ran green at the exact head.

## Local verification (22 Nov 2026, TZ=Asia/Singapore, Playwright chromium-1234)

Worktree at the exact head 5e995e5. `npm ci` root and `v1/` both exit 0.

- `node tests/v1-product-roster-contact-review.mjs` — exit 0. Two Power Users receive the review (no Global Admin, no ordinary staff); exact summary text; idempotent retry replays the original receipt and queues nothing new.
- `node tests/v1-product-roster-adhoc-delivery.mjs` — exit 0. A current Power User receives the contact review; after the grant is gone the job is cancelled with `RECIPIENT_NO_LONGER_POWER_USER` and nothing is sent.
- `node tests/v1-product-roster-service.mjs` — exit 0.
- `node tests/v1-core-authority.mjs` — exit 0.
- `node tests/v1-product-operation-probe.mjs` — exit 0. 404 probes, knownMissing 0.
- `npm run build` — exit 0, zero legacy drift.
- `node scripts/v1/build.mjs` — exit 0.
- `node scripts/v1/verify-build.mjs` — exit 0.
- Working tree clean after the runs.

## Quality gates Q01–Q08

- Q01 (scope): confined to the contact-review queueing path, its Power User lookup, and two tests. Pass.
- Q02 (tests): the new test proves Power-Users-only delivery, the exact summary, and idempotent retry; the adhoc-delivery additions prove the send-time revocation cancel. Pass.
- Q03 (no live change): no Worker deployment, D1 migration, live-data change, or provider send in this PR. Pass.
- Q04 (no secret in diff): only a synthetic test fixture. Pass.
- Q05 (regression): roster-service, core-authority, and the operation probe pass; all four Node/LORD shards pass in CI. Pass.
- Q06 (build): canonical build and v1 build + verify-build pass with zero drift. Pass.
- Q07 (docs): task record states the problem, the owner decision, the template/trigger/sample, the changes, and the out-of-scope items. Pass, with the head note above: the PR body names the superseded head 26ca1c36.
- Q08 (review): this record is the exact-head review. Pass.

## Findings

None.

## Release notes

- A new inactive external relief contact now queues a `contact_review` WhatsApp message to each current Contacts Power User, and no one else.
- A retry replays the original receipt instead of queueing a second review.
- If a recipient stops being a Power User before sending, the job is cancelled, not sent.
- Hosted UAT is Not tested. No deployment authorised by this review.
