# v1 Roster: remove obsolete quiet mode (F08)

- Status: claimed.
- Owner/model: Codex; v1 coordinator ChatGPT; independent exact-head reviewer Claude.
- Updated: 16 November 2026, 11:39 SGT.
- Branch: `codex/v1-roster-remove-quiet-mode`.
- Base: `49ceb9b` (main; accepted deployment-checklist claim on top of `5386513881734c8b9177896b9a89bb19ae42324f`).
- Authority: owner's 16 November work order item 3(c), following the explicit instruction that native D1 Roster needs no Google-era quiet mode. Remove only F08 and its actual caller. No other control is retired.

## Exact five-path allowlist

1. `docs/coordination/tasks/v1-roster-remove-quiet-mode.md`
2. `scripts/v1/remove-roster-quiet-mode.mjs`
3. `scripts/v1/build-web.mjs`
4. `tests/v1-product-roster-native-quiet.mjs`
5. `tests/v1-product/operation-probe-allowlist.json`

Open PRs refreshed: #183 at `cca9f2146f382c97468f9bb8621eb8492ec1a2d3` and separate v0.9 #182 at `592fac9982b8935b1d14b8bbff500a1af78aa2c7`. Their actual file lists do not intersect this claim. The deployment-checklist branch owns two distinct documentation paths. #183's recheck/merge is not a dependency of this UI-only removal. No stacking on its unreviewed head.

## Bounded design and ownership

The copied Assign Relief code closes quiet-mode functions inside an IIFE, unconditionally creates the control and performs its request. A runtime wrapper would merely hide it or fabricate a result while retaining the broken caller. Use a small v1-only build adapter to remove that obsolete block, markup and hookup with strict source-shape checks, and call the adapter from the existing builder. This is the reason a build adaptation is necessary; no new feature logic or growing patch block is added inside `build-web.mjs`. Preserve line positions so unrelated operation-probe call-site pins remain meaningful. Do not copy or rewrite the whole v0.9 screen.

Notification quiet hours, existing native saves/allocations, capabilities, revisions, leases, idempotency and uncertain-result recovery remain unchanged. No backend, schema, workflow, provider, v0.9 or live-data change. Visible change: Quiet mode button/status disappears from v1 Assign Relief only.

## Acceptance

Reproduce the control/request through the actual built browser with synthetic local Workers/D1, then prove neither remains after navigation/reload. Exercise native allocation and save/reload on the same product path. Keep notification quiet-hour code unchanged and run relevant unchanged regressions. Remove exactly F08's one allowlist row (27 to 26); no other allowance or dynamic pin changes. Run the operation probe and its negative controls, canonical build/no drift, runner discovery, product suite, required Node/LORD exact-head CI and Worker/local-upgrade checks. Record failures and omitted checks honestly.

Q01–Q08 evidence and exact head/base belong in the final task/PR. Repository debugging/simplicity principles applied; skill catalog inspected, no separate skill package needed or executed. No new dependency or third-party source copied.

## Handoff

Implementation and tests pending. No merge/deploy/activation authority for this PR. Runtime UAT and official T1B-01/T1B-02 remain Not tested; F5 OPEN. Claude reviews the exact head; owner decides merge/deployment separately.
