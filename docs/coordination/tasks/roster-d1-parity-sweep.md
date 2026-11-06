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
