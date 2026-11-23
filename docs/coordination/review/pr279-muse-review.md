# Review of PR #279 — Roster: inbox alert to duty SMC (W5)

- **Reviewer:** Muse, at the exact head, under the owner's 16 Nov 2026 directive (Muse is the v1 reviewer at the exact head SHA, replacing Claude until Claude returns; source commit 12b06eb). No code, merges, or coordination by Muse.
- **PR:** #279, "Model: Claude / v1 Roster: inbox alert to duty SMC (W5)". Branch `claude/v1-inbox-alert`. Head reviewed: `2d38326e`.
- **Status at review:** OPEN, not a draft. Product CI green at the head; Node/LORD CI green at the head (scope job only — see CI below). MERGEABLE/CLEAN.
- **Verdict: APPROVED at the exact head 2d38326e.** No findings.
- **Head note:** the PR body names the earlier head `29f297e5`. That head was superseded: the branch merged main `800585c8` (integration update, 22 Nov) and the current head is 2d38326e, a merge commit. This review is at 2d38326e, and both CI suites and the local checks below are verified at 2d38326e.

## What it does

Owner decisions (`docs/v1/WHATSAPP_TEMPLATE_REVIEW_2026-11-21.md` row 24 / W5): build the inbox alert as an improvement; bypass quiet hours (21 Nov); unknown senders also alert the duty SMC (22 Nov). v0.9 never sent it (its template was never on Meta).

- `inbox_alert` → `gsis_v1_inbox_new_message` (Meta ID 1798304818089770, **PENDING**, UTILITY), static "Open Roster" → `https://gsis.gsps.edu.sg/roster/`.
- Trigger: **free text** that lands in the Roster inbox, from a **known staff member** or an **unknown number**. Not menu taps or menu numbers (auto-reply) or urgent texts (already `urgent_forward`). Once per sender per day per duty SMC; **sent in quiet hours**; queued only when `inbox_alert` is mapped in `WHATSAPP_TEMPLATES_JSON`. Duty-SMC recheck at send.
- Unknown senders: a once-per-number-per-day fan-out job (`roster-inbox-alert`) reads the current duty SMCs at dispatch and inserts one alert each. Sender shown as "an unknown number ending 5432". Urgent Message stays staff-only.
- `v1/services/roster/inbound.mjs`: `queueInboxAlert`, `inboxAlertConfigured`; unknown-sender fan-out insert; audit `inboxAlerts`.
- `v1/services/roster/service.mjs`: `roster-inbox-alert` handler + registration.
- Tests: new `tests/v1-product-roster-inbox-alert.mjs`; `tests/v1-product-roster-adhoc-delivery.mjs` (fan-out → one alert per duty SMC, sends nothing itself); `tests/v1-product-roster-whatsapp-public-menu.mjs` (unknown free text → one fan-out; menu numbers add none; urgent forward still impossible; earlier "no duty-SMC notification at all" assertion narrowed to urgent forwards per the owner decision).
- Integration update (Codex, 22 Nov): the merge preserves #276's contact-review, #277's button and #279's inbox-alert regressions; #278's final-run logic is included from main and passed its regression. Two inbox-alert issues reproduced locally before correction: typing a number from 1 to 5 could alert the SMC, and the dispatch payload could leave the duty SMC's template field blank. The corrected tests cover the typed choices, both sender labels, static button formatting, and duty-reassignment cancellation without sending.

## Scope and mergeability

- Diff against base 800585c8: exactly 6 files, matching the task record — `docs/coordination/tasks/v1-inbox-alert.md`, `tests/v1-product-roster-adhoc-delivery.mjs`, `tests/v1-product-roster-inbox-alert.mjs`, `tests/v1-product-roster-whatsapp-public-menu.mjs`, `v1/services/roster/inbound.mjs`, `v1/services/roster/service.mjs`. 271 insertions, 5 deletions.
- `git merge-tree --write-tree --name-only origin/main 2d38326e` produced a clean tree (f756d43f) against current main (which now includes all ten Antigravity merges in the owner's order). No conflicts.
- `git diff --check` clean. Secrets scan of the diff: no matches.
- Zero v0.9 drift: `git diff --exit-code -- roster-update/ public/ shared/` clean after `npm run build`.

## CI verified at the exact head

- **Product ("Isolated v1 product"):** run 45017014644, completed, success, head_sha 2d38326e6f0928d11c9e44abd9d10cfc913ddf42, attempt 1. It ran 31m12s — inside the 60-minute cap #274 raised it to.
- **Node/LORD ("Verify GSiS queue changes"):** run 45017010091, completed, success, head_sha 2d38326e6f0928d11c9e44abd9d10cfc913ddf42, attempt 1. The run took 18s: the `scope` job passed (this PR is v1-only), the four v0.9 regression shards were **skipped by design** under #280's scope rule (live on main), and `full-suite` reported success. No waiver is needed or used: this is a `claude/**` branch and both suites ran green at the exact head.

## Local verification (22 Nov 2026, TZ=Asia/Singapore, Playwright chromium-1234)

Worktree at the exact head 2d38326e. `npm ci` root and `v1/` both exit 0.

- `node tests/v1-product-roster-inbox-alert.mjs` — PASS (configuration gate; free text alerts duty SMC once per sender per day, bypasses quiet hours; menu taps and urgent texts do not).
- `node tests/v1-product-roster-adhoc-delivery.mjs` — PASS (six relief kinds, current eligibility and source-bound duty/mutual links; date/period/deletion/identity/qualification/consent negatives and active-only non-relief boundaries; synthetic providers only).
- `node tests/v1-product-roster-whatsapp-public-menu.mjs` — PASS (unknown senders receive 5-item notice and public links while Urgent Message stays strictly restricted).
- `node tests/v1-product-roster-service.mjs` — PASS (15 Roster service acceptance groups).
- `node tests/v1-product-webhook-integration.mjs` — PASS (signed gateway webhook → durable Roster fanout → named LORD/Venues receipt entrypoints; duplicate/tampered callbacks and public internal-route denial; zero provider sends).
- `node tests/v1-product-operation-probe.mjs` — PASS (404 probes, knownMissing 0).
- `npm run build` — exit 0, zero legacy drift.
- `node scripts/v1/build.mjs` — exit 0 (380 artifacts, sourceCommit 2d38326e).
- `node scripts/v1/verify-build.mjs` — exit 0.
- Working tree clean after the runs.

## Quality gates Q01–Q08

- Q01 (scope): confined to the Roster inbox alert, three touched tests, and the task record. Pass.
- Q02 (tests): the PR's tests pass locally and in the product run at the head; the #276/#277/#278 regressions from main are present and passing at the merged head. Pass.
- Q03 (no live change): no Worker deployment, D1 migration, live-data change, or provider send — the template is PENDING on Meta and activation is configuration only. Pass.
- Q04 (no secret in diff): clean. Pass.
- Q05 (regression): product CI green at the head; Node/LORD green at the head with the v0.9 shards skipped by design under #280 (v1-only PR). Pass.
- Q06 (build): canonical build and v1 build + verify-build pass with zero drift. Pass.
- Q07 (docs): task record states the change, the verification, and the out-of-scope bounds (hosted UAT, Meta activation and provider sends unperformed). Pass.
- Q08 (review): this record is the exact-head review. Pass.

## Release notes

- Roster free-text inbox messages now queue a once-per-sender-per-day alert to the duty SMC, including from unknown numbers, and bypass quiet hours; menu taps and urgent texts are unchanged.
- Hosted UAT, Meta template activation and provider sends remain unperformed.
- No deployment authorised by this review.
