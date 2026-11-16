# v1 Roster: remove obsolete quiet mode (F08)

- Status: implemented; verification and exact-head review pending.
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

Claim accepted at `6b6a402124ffeeed174b7eedbb9213a0ce6d934d`; implementation starts from that claim. The five-file change removes the quiet-mode functions, control/status markup, click handler and background refresh, preserving other polling and notification quiet hours. No dynamic probe pin moved.

Local evidence (Node 24.22.1, `TZ=Asia/Singapore`, Chromium `/usr/bin/chromium`):

- Before the fix, `node tests/v1-product-roster-native-quiet.mjs` failed with two obsolete DOM nodes and an actual `/api/roster/quiet-mode` 404. After the fix it passes through the built browser, nine Workers and D1: no control/request, native auto-allocation commits one assignment, reload preserves it, anonymous mutation remains 401. The strict removal guard also caught a retained polling call during development; the call was removed, not masked.
- `node tests/v1-product-operation-probe.mjs`: pass, 396 discovered requests, 26 known missing handlers; all 15 dynamic pins unchanged and negative controls retained. Only F08 was removed (27 to 26).
- `npm run build`: canonical build passes, no generated drift. Discovery: 105 product / 1,206 Node programs. `git diff --check` and exact five-file scope pass before commit.
- Full product suite and required exact-head Node/LORD CI are running/pending at commit preparation; the PR records actual final results. No full-suite pass is claimed here.

Q01/Q02: pass, explicit owner consent and isolated v1 adapter. Q03/Q04: unchanged server ownership and guards, authentication negative and real durable allocation/reload check. Q05: no dependency or runtime background work added; strict source-shape failures prevent silently retaining the retired caller. Q06: focused/probe/build pass, full suites pending. Q07: Claude exact-head review pending. Q08: no deployment or activation; runtime UAT Not tested.

Rollback is code/build only: reverting this PR restores the obsolete control and its broken request; no data conversion or schema rollback is required. G03 is already disproved and tested in #181; it is not claimed as a new fix here. No merge/deploy/activation authority for this PR. Runtime UAT and official T1B-01/T1B-02 remain Not tested; F5 OPEN. Claude reviews the exact head; owner decides merge/deployment separately.
