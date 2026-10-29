# roster-whatsapp-short-summary: period numbers only in teacher relief messages

- Status: review; approved for Friday 30 Oct release (owner go 29 Oct 2026); priority 2 after roster-allocation-run-once
- Owner/model: Codex
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 29 Oct 2026 17:00
- Branch: codex/roster-whatsapp-short-summary
- Base SHA: 590971c263fd5560f08f703825d209da5c223f2a
- Current head SHA (or PR head; avoid self-referential commit hashes): exact review head is recorded in the PR description
- PR: opening from codex/roster-whatsapp-short-summary
- User-authorised scope: Song Wee, 29 Oct 2026: option B; peer messages unchanged; no new template.
- Files/domains owned (include generated outputs): `publicationSummary()` and its callers in shared/roster-operations.js (~line 851, 875, 922), the D1 edge copy if it duplicates the builder, generated backends, tests asserting summary text.
- Out of scope: template bodies (no Meta submission), mutual_request, mutual_override, relief_reminder, relief_unacknowledged, SMC summaries, stapler_timetable.
- Acceptance checks: see below.

## Background
See docs/coordination/review/whatsapp-messages-29oct.md. Today {{3}} of relief_assignment, relief_updated and relief_urgent lists every period with time, class, subject, group, venue, lesson instructions and SMC notes. Owner finds it too long.

## Required text for {{3}}
- relief_assignment and relief_urgent: `2 relief duties: P3, P5.` (singular `1 relief duty: P3.`). Periods ascending, unique; a combined class counts once per period.
- relief_updated: only the parts that apply, in this order: `New: P4. Changed: P3. Cancelled: P5.`
- relief_reminder keeps today's full one-duty text (it also calls publicationSummary at ~line 934; keep its output unchanged).
- Lesson instructions and SMC notes are no longer in WhatsApp; they stay behind the private link.
- Text must stay within the template limit and contain no newline-only lines (WhatsApp rejects some whitespace patterns).

## Acceptance checks
- Unit tests for each format, singular/plural, combined classes, mixed new/changed/cancelled.
- relief_reminder output byte-identical to before.
- Template contract tests still pass (no body or field change).

## Claim and serial handoff, 29 Oct 2026
Model: Codex. The owner's latest instruction explicitly prioritises this task after the exact-head re-reviews of PR #5 at a5db470 and PR #6 at 24452e5. Those advisory reviews are posted. PR #5 retains one P2 replay-retention finding for Claude; Codex will not edit that branch. PR #8 stays paused and unchanged. This is the sole implementation task owned by Codex in this session, branched from the accepted claim commit on current main.

Bounded design: keep the full publicationSummary default for reminders and peer messages. Add template-specific short formatting only for relief_assignment, relief_updated and relief_urgent at enqueue and dispatch revalidation, including reminders promoted to relief_urgent. Reuse the canonical Roster model and regenerate its Google and Worker copies. Do not change template contracts, delivery identities, notification recipients, published duty data, private links or ROSTER_EDGE_AUTHORITY. Newer stapler_timetable daily notifications are outside this task and retain their current text.

Acceptance: ascending unique period numbers; singular/plural counts; mixed New/Changed/Cancelled categories; no lesson/SMC text in the short variants; byte-identical relief_reminder and mutual_override output; existing template contracts and focused notification regressions pass. No production sends or deployment. Claude reviews the exact PR head; the owner merges and releases. Generated Worker output overlaps PR #5 mechanically and must be rebuilt after integration.

Claim retry: main advanced during the first expected-head update with a documentation-only Stapler policy directive at 590971c. Re-read that directive and task ownership; no summary-scope implementation overlap. This claim preserves the new directive and supersedes the first claim attempt that was not accepted onto main.

## Decisions and changes
- Model: Codex. Accepted claim/base commit: 0c2efde9aa0a99accde34754b86c8f5bc2ec5951.
- publicationSummary(rows, templateKey) opts into compact text only for relief_assignment, relief_updated and relief_urgent. Its default retains the exact full-detail format. Numeric unique periods count combined classes once; update groups follow New, Changed, Cancelled order.
- Enqueue and dispatch-time revalidation use the final selected template. A 20-minute relief_reminder remains byte-identical; a reminder promoted to relief_urgent uses compact text.
- Contract clarification: the task's "{{3}}" shorthand is correct for assignment/updated. In the approved relief_urgent contract, field 3 is minutes_remaining and the summary is field 4. Preserve both fields and all approved bodies.
- Full instructions remain in assignments and immutable publication snapshots for the private link. Peer messages, SMC messages, conditional instruction messages and stapler_timetable retain their existing behavior. Prepared/uncertain provider attempts retain existing frozen payload and receipt rules.
- Generated copies rebuilt through npm run build: backend/Code.gs; root Roster/Deploy v0.9.9 backends; Roster browser/edge models; both notification and operations Worker bundles and text copies. No dependencies, schema, settings or authority flags changed.

## Verification
All commands used TZ=Asia/Singapore. Exact review head and its post-commit focused checks are in the PR description. Local source inventory was checked against current main; generated file hashes matched before implementation.
- Red/green: tests/roster-whatsapp-short-summary.cjs failed four cases against unchanged source, then passed all six final tests. Covers singular/plural, combined classes, P0/P16 numeric order, each update group and mixed groups, maximum school periods below 1024 characters, byte-identical full reminders/peer text, enqueue, stale queued-summary revalidation, urgent promotion, generated Worker domain and emitted approved-template fields.
- npm run build PASS, including Apps Script ES2020 parse gate and Worker generation. git diff --check PASS.
- PASS: tests/roster701-whatsapp-contracts.mjs (29 contract/private-link/countdown/approval checks); roster701-whatsapp-domain.cjs (7); roster093-targeted-publication.cjs (13); roster087-notification-store.cjs; roster099a-edge-model-fetch.cjs; roster098h-communication-display.cjs; roster098j-publication-compact.cjs (11); roster-allocation-run-once.cjs (18); paid097-bundles.cjs.
- Broad TZ=Asia/Singapore npm test completed the Node stage: 859/865 programs passed on the initial run. It is not a clean full-suite pass.
- Recovered on focused rerun: roster-prepared-parts-browser.cjs and roster097-batch-lifecycle-browser.cjs passed with ROSTER_TEST_CHROMIUM=/tmp/chromium; their initial failures were a missing default executable path. roster701-r19.cjs initially asserted that full instructions were in the WhatsApp summary; updated that obsolete assertion to Changed: P2. and verified full instructions remain in the published snapshot. All 5 R19 checks pass.
- Three remaining known baseline failures, retained explicitly: package.cjs lacks historical Q commit 50c977d; roster098o-preparation-package.cjs and roster098o-timetable-export.cjs fail the expired 28 Oct native-export capture window. Do not count these as passes. Broad run plus the three recovered programs gives coverage of 862/865 programs; the full run was not repeated.
- npm run test:lord separately PASS: 38/38 programs, because npm test stops before LORD after the Node-stage failures.
- Not run: historical comparison branches excluded by the standard runner, staging, live school sign-in, real WhatsApp delivery or production deployment. Module-type warnings are inherited; no package type change was introduced for this task.

## Review
Claude to review the exact PR head. The implementer self-reviewed every canonical change and the emitted template payload. Advisory model review is separate from owner merge/release.

## Deployment and rollback
Not deployed to staging or production. No messages sent and no live records changed. Google remains authoritative; ROSTER_EDGE_AUTHORITY stays unchanged. No operator configuration change is required.
Rollback: revert this PR and rebuild/redeploy the previously accepted matching source/bundles; do not reset receipts, prepared payloads or uncertain provider outcomes.

## Handoff
Owner passes the PR link and exact head to Claude. Keep PR #8 paused at 55c266b7ca00f2f228f52f40b13febcebfdd9994; no files or refs on that branch changed. Claude retains PR #5's quiet-mode replay finding at a5db470. This PR does not include quiet mode; after integrating #5, regenerate the shared Worker bundles from the combined canonical sources before release. No auto-merge or deployment performed.
