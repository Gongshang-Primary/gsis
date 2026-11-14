# v1 relief capacity and weekly forecast

- Status: claimed
- Owner/model: Codex; coordinator ChatGPT; reviewer Claude (exact head)
- Updated: 14 November 2026, Asia/Singapore
- Branch: codex/v1-relief-capacity-forecast
- Main observed: b5b19c3 (owner disposition of PR145 review)
- Dependency: PR145 at f1efe8a687cb640dae8731fe674acb72b33e7f9b; L1 rename only, 62/62 local product tests, canonical build and local migration upgrade passed. Re-review/CI pending.
- Owner authorisation: "oneshot the rest of the to-dos, including F5" and "build and clear the changelog one at a time". This lifts the next-queue recording hold; it does not authorise merge, deployment, live provider activation, live-data writes or deletion.
- Scope: actual v1 layered eligibility reused by relief health, period visualization and a bounded remaining-school-week forecast; preserve saved commitments/weekly R and cap accounting, unknown evidence, current duty-SMC routing, existing notification schedule and template wording. Add materially-changed capacity fingerprint without duplicate sends. No automatic external-staff activation or fabricated staffing optimum.
- Files: v1/allocator/index.mjs; v1/services/roster/{service,context,repository,capacity,allocation-snapshot}.mjs; v1/web/shared/roster-capacity.{js,css}; scripts/v1/build-web.mjs; tests/v1-product-roster-capacity*.mjs; relevant existing tests/v1-product-roster-*.mjs; docs/v1/accelerated-delivery/{NEXT_QUEUE_2026-11-14,RELIEF_CAPACITY}.md; this task record. No legacy source, production output or Core/Contacts library edits.
- PR: open separately, initially stacked on PR145 so only this related change is reviewed. No additional unrelated implementation in the PR.

## Required evidence

Same rules for allocator and health; R=1 across many periods/days never double spent; saved/future/peer commitments retained; strict layers/continuity/employment caps; policy/source changes invalidate forecast; missing/expired evidence yields not-verified, not zero; read-only forecast has no ledger writes; bounded workload with honest solver limitation; warning recipient/date/template/retry/unknown-provider tests; built browser navigation and current-vs-baseline presentation. TZ=Asia/Singapore, focused plus required product/full Node/LORD CI, canonical build/no drift. Claude reviews each head. Runtime UAT Not tested.

## Queue boundaries and subsequent claims

After this item, separately claim small groups: Global Admin-only tenth home tile/toolbox and misplaced maintenance-control inventory; D1/R2 storage inventory and explicit preview/confirm pruning with recovery/reference guards; protected GitHub Environment provider-credential wiring and browser-only operator guide; F5 durable recovery/restart/restore evidence. Do not move routine operational controls away from their authorised users. Do not commit tokens or echo secret values. No automatic retention deletion: D2 remains owner choice; D1 sharing is closed and owner-managed. F5 stays OPEN until evidence supports closure; official T1B-01/T1B-02 remain Not tested.

## Investigation

At PR145 ec68e987, health routes through shared legacy Operations.read while allocationRun loads the v1 layer policy. The chart uses potentialStaffIds for green baseline bars, not current p.green. Two synthetic probes reproduced overstatement (R=1 across 17 opportunities; layer maxRelief=1 ignored by legacy health). Existing capacity-warning and morning WhatsApp templates are recorded approved, not live-verified. Snapshot weekly remaining excludes the current day; the engine subtracts current-day assignments. Preserve this convention in a scratch-week forecast. The solver reports optimalityProven:false.

## Skills and status

Pstack architect/how applied for source tracing and single-owner boundaries. Reuse the actual engine and snapshot builder; reject a second independent eligibility implementation. No new dependency planned. Implementation not yet started; no tests or release claims for this task. Exact PR head/evidence will be recorded at handoff.
