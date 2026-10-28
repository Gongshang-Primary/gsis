# SDD ledger — plan: docs/superpowers/plans/2026-10-27-098h.md

Baseline: cb7a44ec1f42ecda6262e781de988330f465f62c (v0.9.8g). Release branch patch/v0.9.8h, isolated release098h-source worktree. User authorised execution and commit; no live deployment.

## Preflight and rulings

| Tasks | Shared surface / interface | Ruling |
| --- | --- | --- |
| 1 / 2 | Standalone plan, comparison, reset archive API | Task 1 owns model/backend; Task 2 owns editor. Coordinate before payload changes. |
| 1 / 3 | Canonical Code.gs; confirmed effective day and capacity | Disjoint named functions; Task 1 owns Stapler context, Task 3 owns publication/notify and UT cap. Shared changes require an explicit message. |
| 3 / 5 | roster.js and canonical backend | Task 5 owns start() and API secret helpers only. Task 3 owns notification/publication controls. |
| 4 / 5 | LORD canonical Code.gs | Task 5 owns GSIS_API_SECRET region only, Task 4 owns runner/manager. |
| 1–5 / 6 | Generated mirrors/version metadata | Root serialises generation after canonical edits; docs agent does not run a global replacement. |
| 1 | Standalone plan legacy compatibility | Stored creation provenance can remain internal; current baseline is optional comparison and never confirmation authority. |
| 3 | UT versus suspended workload exemption | User explicitly requests hard UT automatic cap; this supersedes F exemption only for UT automatic eligibility. |
| 4 | Unknown outcomes and queue draining | Preserve uncertainty and recipient evidence; retirement is not delivery and is not permission to resend. |
| 5 | Key length | Minimum32 printable ASCII, storage-bounded; no silent trims/truncation/fallback. |
| 6 | Live recovery | Preview ready was reported; live Restore success has not been reported. Never imply release creation restores school data. |

Ruling: parallel implementation is used with explicit file/function ownership because developer instructions require proactive parallel delegation. Canonical generation, staging, reviews and commits remain serial. No agent commits.

Ruling: no additional approval pause is needed for this authorised commit. Existing accepted scope is binding; optional implementation details use the simplest compatible design.

Ruling: keep frozen G available for baseline failure comparison. Seven inherited failures were documented in G and must be reproduced/classified rather than concealed.

Ruling: build-release.py inserts canonical shared models and backend/RosterOperations.gs into backend/Code.gs. Tasks1/3 edit canonical modules, not the combined generated regions. This corrects the initial brief wording before implementation; agents were notified.

Baseline smoke: frozen G gsis098g-backend-secret.cjs, stapler098g-own-timetable.cjs (plain and Name Bridge), and roster098g-export-headers.cjs passed. Full H gate remains required.

## Progress

- Planning: complete; authoritative queued source read from its current saved version.
- Task 1: complete; implemented and independently reviewed, follow-up findings closed.
- Task 2: complete; implemented and independently reviewed, follow-up findings closed.
- Task 3: complete; implemented and independently reviewed, follow-up findings closed.
- Task 4: complete; implemented and independently reviewed, follow-up findings closed.
- Task 5: source-ready and independently reviewed, no findings. Integrated generated-helper tests pending.
- Task 6: metadata/docs/routing complete; measured release evidence pending.
- Task 7: complete with the seven reproduced inherited limits; exact runs recorded below.
- Task 8: commit/tag and delivery verification use the postcommit RELEASE_VERIFICATION.json receipt in the complete release archive.

## Integration evidence

- Task 2b was added within authorised scope after tracing exports: a plan without matching baseline must export from its own exact periods. Exporter source-ready; focused OOXML/style/timing/operational tests pass, caller integration owned by Tasks 2/3.
- Frozen G seven inherited failures reproduced independently on 27 October. Four depend on unavailable Git source history; three share the unchanged 3073-byte response versus a 3000-byte threshold. No historical objects or thresholds modified.
- Task 5 config/session race received independent no-findings review; full generated-source gate remains.
- Root transport regression failed for large Unicode import, then passed after treating importStapler and its receipt command as bounded native plans in both Worker signing/request limits and backend envelope limits. Existing ordinary/oversize limits retained. Added actual gateway test.
- Runtime version harmonisation G to H applied to runtime surfaces only; canonical generation not yet run.
- Independent Task 4 review found server audit recovery dependent on browser command retention; author fixing durable deterministic recovery with regression.
- Independent Tasks 1/2 review found inverted standalone end-of-day boundary versus UI; author aligning server validation and real-model regression.

## Review closures and full gates

- Tasks1/2: timing boundary, deleted standalone restore, and compact comparison findings closed by independent recheck. Compact Confirm measured 8967 / 1464479 bytes (0.61%), retaining the original <10% requirement. Changed references refresh, invalid tags retain local content, exact retry adds no write.
- Task3: independent review found canonical edge transport rejecting explicit unpublished snapshots, missing Contacts UT metadata fail-open, and misleading published labels on communications. Author fixes passed focused actual protocol1/2 claim/prepare, scoped signed link/display and UT/manual audit regressions. Independent offline full dispatch-to-settlement-to-link/ack chain sent once then zero on retry, with mocked storage/provider only.
- Task4: server-owned deterministic review-audit recovery closed; unknown sends remain quarantined, per-recipient retirement cannot resend, lost browser state no longer jams audit completion.
- Task6: component-patch suite verifier/archive/provenance dispatch fixed; real synthetic all17 suite test replaces stubbed verifier coverage. Independent quality recheck closed finding; numeric full verifier unchanged.
- Serial generation completed: canonical modules, individual renderer, edge domains, 28 LORD template files, both standalone Workers, 212 Apps Script syntax inputs.
- Complete LORD gate passed all 38 programs. Complete Node release gate in progress; runtime hashes stable during gate. Initial fixture errors from realistic Response validation and deliberately superseded publication/baseline assertions are being corrected and rerun; original results retained.
- Precommit real deployment archive: all17 source parity, hashes/assets and packaged Worker smoke verification pass. Two packaged-entry tests initially ran before archive creation; fresh reruns pass after the build. Committed provenance remains a postcommit gate.

## Initial complete Node gate and follow-up

Initial gate completed 808 programs: 750 passed, 58 failed. This is retained as initial evidence, not final status. Seven match reproduced G limits. Others include realistic browser Response fixture fixes, obsolete combined publication/send or baseline-invalidates-plan assertions, missing archive precondition on two package tests, and genuine new issues.

Genuine follow-ups being fixed/reviewed: compressed/plain confirmed source revision parity; context inflation of unrelated compressed plans; legacy private capability seeing uncommunicated confirmation; communication A→B→A identity/retry authority; safe-unsent supersession when current content returns to baseline; absence deletion withdrawing its derived future duty. Original safety/privacy/performance assertions are retained when they expose a defect. Runtime changes require serial regeneration and a fresh full gate before commit.

Root updated only roster701-r01 quota expectation so publication no longer requests business quota evidence; other lightweight/legacy quota and preload/account fencing checks passed unchanged. Both actual packaged entry point smoke tests passed once the real archive existed.

Privacy clarification: authenticated own confirmed Stapler navigation is distinct from ordinary publication/private capability access. A legacy duty link without communicationId cannot read later confirmation cells, names or timings, including through missing-baseline or wrapper fallbacks. Missing historical published data is unavailable, never replaced with private current content. This applies the existing publication/privacy requirement, not a new visibility policy.

## Final freeze

Domain and policy authors froze canonical source. Reviewer independently closed the reopened legacy private fallback/wrapper timing, recipient correction, duplicate authority and newly-present work findings. Actual backend/edge private tests retain original privacy expectations. Future standalone create/save/confirm/teacher-read works without baseline or quota source. Existing decode/compression thresholds pass unchanged.

Final serial generation and real 17-component precommit archive verification passed. Final runtime fingerprint covers 474 files. LORD's complete 38-program report still exactly matches all current LORD source hashes. A fresh complete Node release gate has started on the frozen, generated tree with a real archive already available. Initial 808-program results are separately retained; the new privacy regression increases the final catalog by one program.

## Final measured source validation

- Initial complete Node run: 808 programs, 750 pass and 58 fail during integration.
- Fresh frozen generated Node run: 809 programs, 801 pass and 8 fail. Seven are the unchanged inherited G limits. One was the Stapler717 historical-context test fixture after quota independence; the fixture alone was corrected and the program passed twice, including root's fresh rerun.
- Aggregate: 802 pass and 7 inherited fail across 809 programs. This is explicitly not a single green full-suite result. All 19 H-named programs pass.
- All 474 runtime hashes were identical before/after the frozen gate and post-gate fixture rerun. No performance threshold was loosened; H still measures 3073 response bytes against the inherited 3000-byte limit.
- Complete LORD gate: 38/38 programs; final source hashes match its recorded input. Syntax:212 Apps Script files parse as ES2020. Real 17-component precommit package source/assets/hashes and bundled entry-point checks pass.
- Fresh independent correctness/privacy/concurrency and maintainability reviews have no remaining reproduced material findings. Frozen plan, legacy private and captured communication access remain separate. No production data/configuration/deployment/message operation occurred.
- Postcommit source/tag binding, final component archive verification and fresh complete-bundle clone are recorded outside the commit in RELEASE_VERIFICATION.json to avoid self-referential commit metadata.

User scope already authorises this commit. The finishing workflow retains the release branch and known-baseline test limits; no integration menu, live deployment, storage migration or new approval pause applies.
