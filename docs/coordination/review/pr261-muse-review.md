# Review of PR #261 — Roster public WhatsApp menu with restricted Urgent Message

- **Reviewer:** Muse, at the exact head, under the owner's 16 Nov 2026 directive (Muse is the v1 reviewer at the exact head SHA, replacing Claude until Claude returns; source commit 12b06eb). No code, merges, or coordination by Muse.
- **PR:** #261, "v1(roster): port #182 public WhatsApp menu with restricted Urgent Message". Branch `antigravity/v1-roster-whatsapp-public-menu`. Base d6e0559. Head reviewed: `3e62c6c943e27008a9698a9847507a4fe2fff1c4`.
- **Status at review:** OPEN, not a draft. Product CI has one failing program at the head (see below). MERGEABLE/UNSTABLE (unstable only because CI is red).
- **Verdict: APPROVED at the exact head 3e62c6c9.** No findings.
- **Review basis, stated openly:** the owner directed this review by handoff with product CI blocked by the Deploy fixture. The product run at this head fails on exactly one program — the known Deploy save-recovery fixture failure, unrelated to this PR's files. This PR's own test passed in that run. Node/LORD did not run for this `antigravity/**` branch. The approval therefore rests on the single-failure CI evidence plus the full local verification below, under the owner's 20 Nov 2026 waiver ("review all done by antigravity, ignore difference in notation, i will orchestrate") and the 21 Nov direction to review the Antigravity queue.

## What it does

Ports the public WhatsApp menu hotfix from v0.9 PR #182 to v1 Roster, without touching v0.9 files or Codex's draft branch.

- **Public 5-item menu** (`v1/services/roster/inbound.mjs`): exports `WHATSAPP_PUBLIC_MENU_TEXT` (the exact owner notice `*This number is no longer actively manned by staff member*` + the 5-item menu) and `publicMenuReplyFor()`, which maps `1`/`3`/`4`/`5` (and word aliases) to the public actions and anything else to the menu.
- **Unmatched senders:** `processInbound` now wraps `authorizeEvent` in try/catch. On `RECIPIENT_UNMATCHED` (unknown/ambiguous sender) it serves the public menu reply with no identity gate: the inbox row is marked open with `identityVerified: false`, and a `roster-public-menu-reply` outbox job is enqueued with `INSERT OR IGNORE` under the deterministic job id `public-menu-reply:<eventId>`. Selecting `2` in this path returns the `urgent-restricted` refusal text — never an urgent session, never a duty-SMC notification.
- **Verified senders** keep the existing path: `authorizeEvent` succeeds, the selection flows as `selection: event.buttonId` into `Operations.inboundMessage`, and the reply comes from the same `text` map (now using the shared menu text). The urgent flow is reachable only there, with `staffId: principal.staffId`.
- **Reply dispatch** (`v1/services/roster/service.mjs`): `dispatchRosterJob` handles `roster-public-menu-reply`, mirroring the established `roster-inbox-reply` dispatch — it verifies the durable `roster_inbox` row, the exact sender mobile match, and the 24-hour reply window (`now - received_at >= 86400000` → cancelled `INBOX_REPLY_WINDOW_CLOSED`), then asserts the job lease and dispatches via `dispatchProvider` with `idempotencyKey: job.job_id`. The public variant correctly omits the `staff_id` check (public senders have none).

## Handoff verifications (owner, 21 Nov 2026)

1. **Numeric menu choices work for public and verified senders.** Public: proven end-to-end by the new test — unknown sender `Hi` receives the exact 5-item notice, `3` receives the School Layout link, and the unit assertions cover `1`–`5` plus unknown input → menu. Verified: the verified path routes `selection: event.buttonId` into the shared operation and replies from the same `text` map; that routing is unchanged code in this PR, and the webhook integration test passes locally at this head. No new test in this PR exercises a verified sender pressing a number; the verified behaviour is established by the unchanged routing plus the integration test, not by a new verified-sender case.
2. **Only eligible senders can start Urgent Message with `2`.** Public/unknown senders selecting `2` receive the restriction refusal, and the test asserts zero `roster-notification` (duty-SMC) jobs are queued. Eligibility is gated upstream by Core `authorizeEvent`: only a successfully verified staff / engaged relief-teacher principal reaches the urgent-session code. The v0.9 domain edge test also passes at this head, proving urgent gating including the inactive sender and durable duplicate replay.
3. **Reply-window checks and retries prevent duplicate sends.** Three layers: the dispatch window check (inbox row + exact mobile + 24 h → cancelled); the provider layer re-checks the 24-hour freeform window (`recentInboundAt`) before sending freeform WhatsApp text; and the lease + deterministic job id + `INSERT OR IGNORE` enqueue + `idempotencyKey: job.job_id` bound retries to a single job per inbound event. The new test triggers the Roster scheduler twice after each message and the replies arrive through that dispatch cycle.

## Scope and mergeability

- Diff against base d6e0559: exactly 4 files, matching the task record's Files Claimed — `docs/coordination/tasks/v1-roster-whatsapp-public-menu.md`, `tests/v1-product-roster-whatsapp-public-menu.mjs` (167 lines), `v1/services/roster/inbound.mjs`, `v1/services/roster/service.mjs`. 343 insertions, 16 deletions.
- The task record names base 15fb5ee; the branch was rebased onto d6e0559 before review. The diff checked here is against the PR base d6e0559.
- `git merge-tree --write-tree --name-only origin/main 3e62c6c9` produced a clean tree (352b1cab). No conflicts.
- `git diff --check` clean. Secrets scan of the diff matched only the test's synthetic signing secret (`"synthetic-wa-menu-secret"` — a fixture, not a real credential). No real secret in the diff.
- Zero v0.9 drift: `git diff --exit-code -- roster-update/ public/ shared/` clean. No `public/` file is touched.

## CI verified at the exact head

- **Product ("Isolated v1 product"):** run 44908822031, completed, failure, head_sha 3e62c6c, attempt 1. The failed-job log contains exactly one failing program: `v1-product-deploy-save-recovery-browser.mjs` (exit 1), failing at the known line-1161 assertion — "Review heading shows readable teacher/class/subject label: [\"Assign Unavailable teacher to Unavailable class or teaching group · EL\"]". That is the Deploy fixture failure documented as repair item 1 in draft PR #262, already reproduced locally at #262's head. It is unrelated to this PR: none of #261's files is involved, and this PR's own test (`v1-product-roster-whatsapp-public-menu.mjs`) is not among the failures.
- **Node/LORD ("Verify GSiS queue changes"):** no run exists at this head. The workflow triggers only on `codex/**`, `muse/**`, `claude/**` branches, and no manual dispatch was made for this head. See the review-basis note above.

## Local verification (21 Nov 2026, TZ=Asia/Singapore, Playwright chromium-1234)

Worktree at the exact head 3e62c6c9. `npm ci` root and `v1/` both exit 0.

- `node tests/v1-product-roster-whatsapp-public-menu.mjs` — exit 0. Unknown sender receives the exact 5-item notice, `3` returns the layout link, `2` is refused with zero SMC notifications queued.
- `node tests/v1-product-webhook-integration.mjs` — exit 0. Signed gateway webhook → durable Roster fanout → named LORD/Venues receipts; duplicate/tampered callbacks and public internal-route denial; zero provider sends.
- `node tests/roster-whatsapp-public-menu-edge.mjs` — exit 0. Domain-level public menu and urgent gating, including inactive sender and durable duplicate replay; signed webhook → durable D1 inbox → public menu with duplicate reply suppressed.
- `npm run build` — exit 0, zero legacy drift.
- `node scripts/v1/build.mjs` — exit 0.
- `node scripts/v1/verify-build.mjs` — exit 0.
- Working tree clean after the runs.

## Quality gates Q01–Q08

- Q01 (scope): confined to the Roster WhatsApp public menu, its reply dispatch, and one regression test. Pass.
- Q02 (tests): the new test proves the public path end-to-end with real built Workers/D1 and a signed webhook; the verified path and urgent gating are covered by the integration and domain edge tests. Pass, with the boundary stated in handoff verification 1 above.
- Q03 (no live change): no Worker deployment, D1 migration, or live-data change in this PR; the menu and dispatch are v1 Roster service code. Pass.
- Q04 (no secret in diff): only a synthetic test fixture. Pass.
- Q05 (regression): webhook integration and the public-menu edge tests pass; the single product-CI failure is the unrelated Deploy fixture. Pass.
- Q06 (build): canonical build and v1 build + verify-build pass with zero drift. Pass.
- Q07 (docs): task record names the source PR, the exact scope, and the verification. Pass.
- Q08 (review): this record is the exact-head review. Pass.

## Findings

None.

## Release notes

- Any WhatsApp sender now receives the 5-item public menu; items 1, 3, 4 and 5 work without an identity check.
- `2. Urgent Message` stays restricted to verified staff and engaged relief teachers; unknown senders are refused and no SMC notification is queued.
- Public menu replies are dispatched only inside the 24-hour reply window, to the exact sender, with lease and idempotency protection against duplicate sends.
- Hosted UAT is Not tested. No deployment authorised by this review.
