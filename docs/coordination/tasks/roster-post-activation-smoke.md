# roster-post-activation-smoke: D1 acceptance at t+0 and t+20

- Status: merged (#58 at addcaaa as 92e0bcb)
Model: Codex
Reviewer: Muse at exact final head. Owner merges.
Branch: codex/roster-post-activation-smoke
Base: main 78f6a214781b66fbaf889b8f2958993bcddd19c6

Refresh the existing tests-only PR onto current main. Exercise the actual signed browser freeze, immutable import and D1 activation, then profile, Assign Relief, calculations, statistics, saved absence and automatic allocation at t+0 and t+20. Keep the stale Contacts negative control and actual scheduled reference refresh. Use current authority resolution and allocation-cycle helpers; reject unexpected cron job failures. Deploy remains on Google.

No live activation, live Google writes, messages or product changes. Canonical build, focused harness and full Node/LORD CI are required before handoff.


## Backlog rebase (Model: Codex, 13 Nov)

Original head `8f247febd2e0fe4e2bece6f023dce727fba5786e` was consolidated with its exact tree preserved before rebase. The only conflict was the changelog; both entries remain. Fixture credentials/session derivation now use GSIS_SECRET, including the current Calendar proxy credential. The isolated cron fixture supplies an idle employment-mail dispatcher introduced on main. All activation, stale-authority, quota, statistics, persistence and allocation assertions remain intact.

The affected smoke program passes with TZ=Asia/Singapore and Chromium variables configured. Canonical build leaves no diff; diff versus main is exactly this task record, CHANGELOG and the smoke test (no product changes). Merge-tree is clean. Fresh exact-head CI is recorded in PR #58. Old approvals do not approve this head; no real activation, provider call, live data, main push, merge or deployment.
