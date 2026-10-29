# roster-whatsapp-short-summary: period numbers only in teacher relief messages

- Status: proposed, approved for Friday 30 Oct release (owner go 29 Oct 2026); priority 2 after roster-allocation-run-once
- Owner/model: Codex
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 29 Oct 2026 10:45
- Branch: codex/roster-whatsapp-short-summary
- Base SHA: df8c93a
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
