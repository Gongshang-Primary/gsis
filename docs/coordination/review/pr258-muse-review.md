# Review of PR #258 — Keep the latest Layout timetable response

- **Reviewer:** Muse, at the exact head, under the owner's 16 Nov 2026 directive (Muse is the v1 reviewer at the exact head SHA, replacing Claude until Claude returns; source commit 12b06eb). No code, merges, or coordination by Muse.
- **PR:** #258, "Model: Codex / Keep the latest Layout timetable response". Branch `codex/v1-layout-timed-read-ordering`. Base 12472f5. Head reviewed: `01a7958f65ab748f020d0f712e8f58fe93c5b965`.
- **Status at review:** OPEN, DRAFT. The owner presented this PR for review on 21 Nov 2026; the draft flag is noted, not a blocker. Product CI green at the head; Node/LORD CI green at the head. MERGEABLE/CLEAN.
- **Verdict: APPROVED at the exact head 01a7958f.** No findings.

## What it does

The Layout timed timetable panel (added by #252) could display the wrong date: it checked the security epoch but applied whichever response arrived first. A slow 23 November reply could overwrite an already rendered 24 November table.

- One sequence for timed reads: `timedReadEpoch`. Each load takes a ticket (`++timedReadEpoch`); only the ticket matching the current epoch may set `timedData`, render, or show an error. A stale success or a stale error is dropped silently.
- Starting a load clears the previous result (`timedData = null`, re-render) before the request goes out.
- `gsis:clear-protected-state` bumps the epoch, so every outstanding timed request is invalidated, then clears the data, re-renders, and clears the status.
- The startup path captures `startupEpoch` before `getSession()` and only starts the timed load if the epoch is unchanged.
- The load button now calls `loadTimedTimetable` directly; the try/catch lives inside it.

No schema, authority, provider, live-data, or deployment change. Rollback reverts this browser change without touching stored records.

## Scope and mergeability

- Diff against base 12472f5: exactly 3 files, matching the task record's scope — `docs/coordination/tasks/v1-layout-timed-read-ordering.md`, `v1/web/shared/layout-editor.js` (+29/−? lines, the race fix only), `tests/v1-product-layout-timed-timetable-browser.mjs`.
- The task record names claim base 0c98b728; the branch was rebased onto 12472f5 before review. The diff checked here is against the PR base 12472f5.
- `git merge-tree --write-tree --name-only origin/main 01a7958` produced a clean tree (8276fe50). No conflicts.
- `git diff --check` clean. Secrets scan of the diff: no secret, password, API-key, or private-key matches.
- Zero v0.9 drift: `git diff --exit-code -- roster-update/ public/ shared/` clean.

## CI verified at the exact head

- **Node/LORD ("Verify GSiS queue changes"):** run 44888903711, completed, success, head_sha 01a7958. This is a `codex/**` branch, so the verify-queue workflow ran; no waiver is needed or used for this PR.
- **Product ("Isolated v1 product"):** run 44890155507, completed, success, head_sha 01a7958, 175/175 programs.
- The first product run at this head (44888903913) reached the 30-minute job limit after 168 passes with no failed assertion and was cancelled; the PR body states its seven unfinished programs passed locally. The PR-triggered run 44890155507 then passed all 175/175 at the same head. The timeout is recorded here as a CI ceiling, not a test failure.

## Local verification (21 Nov 2026, TZ=Asia/Singapore, Playwright chromium-1234)

Worktree at the exact head 01a7958. `npm ci` root and `v1/` both exit 0.

- `node tests/v1-product-layout-timed-timetable-browser.mjs` — exit 0. Log shows the race assertions passing, including "stale real owner failure cannot replace a newer successful result or status", date filtering with uncovered-date flags, and protected-state clearing on session change.
- `node tests/v1-product-layout-timed-source.mjs` — exit 0.
- `npm run build` — exit 0, zero legacy drift.
- `node scripts/v1/build.mjs` — exit 0.
- `node scripts/v1/verify-build.mjs` — exit 0.
- Working tree clean after the runs.

## Quality gates Q01–Q08

- Q01 (scope): the change is confined to the Layout timed read path and its test. Pass.
- Q02 (tests): the new browser test reproduces the reported race with real local Worker replies delivered out of order, and covers reversed successes, stale and current errors, uncovered dates, and late results after protected-state clearing. Pass.
- Q03 (no live change): browser-only change; no Worker, D1, migration, or deployment change. Pass.
- Q04 (no secret in diff): clean. Pass.
- Q05 (regression): timed-source regression passes; the changed browser test passes. Pass.
- Q06 (build): canonical build and v1 build + verify-build pass with zero drift. Pass.
- Q07 (docs): task record describes the bug, the fix, and the verification. Pass.
- Q08 (review): this record is the exact-head review. Pass.

## Findings

None.

## Release notes

- Layout timed timetable: the latest selected year/date now owns the displayed result and error. A slower or failing earlier request can no longer overwrite it. Starting a new load clears the previous result. Clearing protected state invalidates outstanding timed requests.
- Hosted UAT is Not tested. No deployment authorised by this review.
