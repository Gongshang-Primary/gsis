# roster-d1-parity-sweep: find and close every Google-only Roster operation now that Roster runs on D1

- Status: **authorised, priority** (owner 6 Nov: "codex work. sweep now. put priority"); Codex, lane R.
- Reviewer/model: Muse or Claude

## Why
Since the D1 fresh start (5 Nov 23:10) three Google-only features were found missing on D1 one complaint at a time: Allocation Audit TXT to Drive (#82/#85 fixed), Venues occupancy source (config: VENUES_ROSTER_WORKER_URL), and absence report review (`intakeReview`, tasks/roster-intake-overlap-message.md). There are likely more.

## Step 1 — inventory (docs-only PR first, today)
Produce `docs/roster/D1_PARITY.md`: a table of every operation/view/route the Google Roster backend serves (backend/RosterOperations.gs dispatch, `op===`/`p.view===` branches, scheduled triggers, service actions, Drive/Sheets writers) and every operation the Pages Worker forwards (roster-update/public/_worker.js lists), with columns:
operation | who calls it (screen/job) | Google handler | D1 handler (file:line) or MISSING | behaviour on D1 today (works / errors / silently forwards to frozen Google / skipped by design) | risk (high = SMC/teacher daily use) | proposed action (port / retire / keep Google-only with reason).
Method: static analysis of both dispatchers plus a test that calls every listed operation against the D1 edge in the test harness and records the outcome. Mark anything that reaches frozen Google (`rosterEdgeAssertLegacyWrite_`) as MISSING.

## Step 2 — close the gaps (PRs in risk order)
- Port high-risk operations to D1 with Google/D1 parity tests (start with intakeReview if not already done by roster-intake-overlap-message).
- Retire dead operations with an owner-visible note.
- Any operation intentionally Google-only must fail with a clear message on D1, never a generic error or a silent forward to frozen Google.

## Done when
`D1_PARITY.md` shows no high-risk MISSING rows; a CI test fails if a new Google operation is added without a D1 handler or an explicit "Google-only" entry.

## Step 1 claim, 6 November 2026

- Status: implementing inventory and harness only.
- Owner/model: Codex (this continuation).
- Reviewer/model: Muse or Claude.
- Branch: codex/roster-d1-parity-sweep.
- Base SHA: afe4c6ea3d6034c78743e980fa0d8c70c8bb529f.
- Scope: docs/roster/D1_PARITY.md, a machine-readable operation inventory and tests that exercise the real D1 dispatcher; no product changes. 'Docs-only' means no production behavior changes; the requested harness is test code.
- A has an active separate Codex claim at d7b44cd19c28088a649e411db4018c9dd793f3a3. Do not edit that implementation branch or its product files. Record intakeReview as missing in this pinned base until A lands.
- Source restoration: authenticated GitHub connector at the pinned base; verify local files against Git blob SHAs. Direct clone authentication is unavailable.
- Verification required: inventory completeness, real edge dispatch outcomes, canonical build and full Node/LORD CI. No tests yet claimed.
- No deployment, live calls, notifications, settings, authority changes or merge.
- Use branch claim because automatic approval review previously rejected direct main claims. Step 2 ports remain separate, in risk order after the inventory.

## Step 1 implementation, 7 November 2026 — Model: Codex

- Continued the existing claim `870710a`; no re-claim. Merged current main `0890f05` without conflicts in `4da2fa85f86142a9a5a2ec6e16a084dcf7133702`. No force-push or main update.
- Scope remains documentation and tests: `docs/roster/D1_PARITY.md`, its machine-readable `d1-parity.json`, static discovery in `tests/helpers/roster-parity.cjs`, and automatically discovered inventory/guard tests. No production behavior changes or Step 2 ports.
- The earlier claim's pinned-base warning about missing intakeReview is historical and superseded: #96 is on this merged base, and the synthetic D1 intakeReview request succeeds. #90 and #100 are also in the merged main history.
- Inventory: 272 rows, comprising operations (including separately scoped baseline changes), read views, action/HTTP boundaries, and 15 internal Google persistence references. There are 257 request probes: 85 succeed and 172 return recorded errors. Errors include deliberate validation/resource/migration refusals; success is not a claim of complete semantic parity. Internal helper rows are static references, not fabricated public APIs. The table and JSON distinguish these outcomes.
- Every MISSING row has an explicit Google-only exception and proposed action; these include temporary known gaps pending separate Step 2 ports as well as intentional migration/reference/Drive adapters. This does not authorize any frozen Google write. The actual legacy fence is exercised locally; the intentional immutable Deploy publication adapter is mocked separately and is not misclassified as a frozen writer.
- Guard integration uses the existing `tests/run.cjs` discovery: both new top-level test files run in CI without editing the runner or workflow. New missing operations require an explicit catalog exception; normal checks never rewrite evidence.
- Negative control: a temporary `parityDeliberatelyUnmapped` operation was appended to the canonical Google dispatcher. The guard child failed with exit 1 and the expected uninventoried-operation diagnostic; the source was restored byte-for-byte and the normal guard passed. No deliberate case remains.
- Local verification: canonical build passed for all 18 components with no generated diff. Seven relevant check programs passed: inventory guard (including negative control), full inventory probe/Markdown comparison, roster094-edge-roster, roster099n-intake-overlap, roster-drive-blob-content-type, roster-drive-writer, and roster-daily-edge. All seven were rerun after final evidence generation: 7 passed, 0 failed. The final canonical build also passed without production/generated changes.
- Not tested: live D1, Google, school records, provider sends, staging/deployment, or the complete local Node/LORD regression suite. All inventory networking is intercepted; the existing D1 regression tests also use synthetic local providers.
- Release/rollback: documentation/test-only change; remove/revert inventory and guard files if necessary. No authority flags, bindings, credentials, settings or live records changed.
- Handoff gate: push this task branch to trigger full CI; open a draft PR only after the complete run at the final head is green. Reviewer: Muse at that exact head. GitHub API reads currently return Forbidden, so a CI result must be verified after API access is restored or supplied by the owner. Do not claim CI, PR creation, review, merge or deployment without evidence.
