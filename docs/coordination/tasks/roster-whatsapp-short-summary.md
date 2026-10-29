# roster-whatsapp-short-summary: period numbers only in teacher relief messages

- Status: claimed; approved for Friday 30 Oct release (owner go 29 Oct 2026); priority 2 after roster-allocation-run-once
- Owner/model: Codex
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 29 Oct 2026 16:43
- Branch: codex/roster-whatsapp-short-summary
- Base SHA: 590971c263fd5560f08f703825d209da5c223f2a
- Current head SHA (or PR head; avoid self-referential commit hashes): none
- PR: none
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

Claim retry: main advanced during the first expected-head update with a documentation-only Stapler policy directive at 590971c. Re-read that directive and task ownership; no summary-scope implementation overlap. This claim preserves the new directive and supersedes the unpublished first claim attempt.
