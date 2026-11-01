# Release build metadata Phase 2 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this approved plan task-by-task. No product changes before the coordinator's GO.

**Goal:** Show truthful page/server build differences and prevent delivery of a repeated release label.

**Architecture:** `package.json` `gsisBuildLabel` remains the only input. The build stamps additive `GSIS_BUILD_LABEL` constants; Google JSON envelopes expose `gsisBuildLabel`, narrow gateways forward that observed value in `X-GSiS-Build-Label`, and browser request helpers read that bounded header. The release packager gates final packages separately from repeatable builds and previews.

**Tech Stack:** Existing JavaScript, Apps Script, Python, Node assert/jsdom; no new dependencies.

**Spec:** `docs/coordination/tasks/release-version-letter.md`, Phase 2; owner scope/constraints supplied 1 November 2026.

## Global constraints

- Keep `gsisRelease`, component versions and `GSIS_DEPLOY_VERSION` at `0.9.9`; current build label stays `0.9.9f`.
- No deployment, authority/configuration/schema changes, live calls, messages, dependency installation or real final delivery bundle.
- Metadata must describe the observed Google backend or executing D1 Worker; unknown old-backend labels stay unknown.
- No global fetch/Response monkeypatch, response clone or extra body parsing for metadata; preserve retries, timeouts and save outcomes.
- Canonical generated copies are rebuilt and committed; no test assertions are removed or weakened.

## Review focus

- An old Google backend with no build metadata must never be reported as the new gateway build.
- Roster D1 version reads must not initialize authority or storage; success and error envelopes identify the executing build.
- Cached/sanitized Layout and Roster response paths must retain observed metadata without exposing private payloads.
- A malformed label or DOM insertion failure must never block a read/save or inject markup.
- Failed final packaging must not consume a label; build-only and preview runs must not touch the tracked last label.

## Task 1: Runtime metadata and the notice

**Files:** `shared/version-notice.js` (new); `scripts/build-release.py`; all manifest frontend HTML/helper copies and existing request helpers; the six Google backend JSON helpers; manifest frontend gateway JSON helpers; `roster-update/public/edge-roster.js`; notification/operations/Calendar job Workers; canonical generated outputs. Calendar edits are metadata only; LORD edits avoid queue behavior.

**Interfaces:** `window.GSISversionNotice(response)` reads `X-GSiS-Build-Label`; the HTML meta field `gsis-build-label` identifies the page. Additive Google/D1 envelope field is `gsisBuildLabel`. Worker health JSON contains `version` equal to `GSIS_BUILD_LABEL`. Gateway response headers use observed envelope metadata, while separately identifying their own Worker build where useful.

- [x] Add executable Node/jsdom behavior tests for equal/mismatched/malformed labels, exact notice copy, accessible non-blocking rendering and existing request/save results.
- [x] Add Google envelope/helper and gateway tests, including stale upstream `0.9.9e`, missing upstream metadata, errors, retained Layout/cache metadata and D1 no-storage version response.
- [x] Run focused tests and record expected missing-feature failures before product edits.
- [x] Implement minimal helper/header hooks and package-driven build stamping, including LORD setup parity.
- [x] Verify focused tests and all relevant Worker/backend syntax/parity suites; record exact omissions.

## Task 2: Mandatory final bundle label gate

**Files:** `scripts/package-099-suite.py`, `scripts/verify-099-suite.py` only if provenance requires additive label handling; `release/LAST_BUNDLE_VERSION` (new), release operator documentation, focused Python gate tests.

**Interfaces:** Existing final suite packaging is the mandatory delivery path. A final bundle uses a full-label folder and `DEPLOY_STEPS.md`/`COMMIT.txt`; final package metadata carries `buildLabel`. Final success records the consumed label. `--preview` and `--build-only` never consume or reject a repeated delivery label.

- [x] In isolated temporary fixture roots, prove repeated-label refusal, successful advancement only after verified package creation, failure retention, full-label names and repeatable preview/build behavior.
- [x] Run red tests before implementation.
- [x] Add the gate at final packaging entry and record only after all archive checks; initialize last label to existing cutover label `0.9.9f` with documented provenance.
- [x] Verify isolated gate tests without generating a real delivery or advancing the repository's last label.

## Task 3: Verification and exact-head handoff

- [ ] Run `TZ=Asia/Singapore npm run build` then focused checks and `TZ=Asia/Singapore npm test`; preserve failures and unavailable Chromium/history coverage explicitly.
- [ ] Inspect the entire diff, additive protocol behavior, saved-outcome behavior and all generated parity.
- [ ] Record task status, base/head, scope, checks/results, gaps, operator use and rollback; commit locally with `Model: Codex`.
- [ ] Ask the coordinator for independent exact-tree review and full GitHub Node/LORD verification; do not publish remotely.
