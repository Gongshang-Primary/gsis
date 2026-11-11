# roster-intake-instruction-orphan-close: Close or dismiss relief instructions whose absence was deleted

- Status: proposed
- Owner/model: Codex
- Reviewer/model: Muse
- Last updated (Asia/Singapore): 2026-11-11 ~16:00
- Branch: codex/roster-intake-instruction-orphan-close
- Base SHA: re-check main's head before branching. Lane R is serial: start only after `roster-intake-instruction-edit` is merged (same files).
- Current head SHA (or PR head; avoid self-referential commit hashes):
- PR:
- User-authorised scope: owner, 11 Nov ("yes" to Claude's proposal). When every absence a retained relief-instruction draft points to has been deleted, the draft can never apply. Today it stays in "Needs attention" for good: "Retry processing" fails again with ABSENCE_CHANGED, and "Withdraw" refuses with ROSTER_ABSENCE_ALREADY_SAVED. Fix both sides:
  1. **Auto-close.** When an absence is deleted, any `edgeInstructionDrafts` row whose `savedIds` are now all deleted moves to status `withdrawn`. Record `resolvedAt`, `resolvedBy` (the person who deleted it), `resolutionReason: 'ABSENCE_DELETED'`, and the deleted absence ids, all in the same mutation. The processor (`processEdgeInstructionDrafts`) also closes the draft this way, instead of setting `needsReview`, when it finds all `savedIds` deleted. This covers drafts that were already stuck before this release.
  2. **Dismiss.** SMC/Admin get a "Dismiss" action on a `needsReview` instruction item, next to "Retry processing". It needs a confirm and a short reason (required, plain text). It sets status `withdrawn`, keeps the original submitted text, and writes an audit row (`dismissAbsenceInstructions`). The teacher who reported sees it in history as "Closed by SMC: <reason>".
  3. **UI.** A withdrawn draft moves from "Needs attention" to the review history. It shows its plain reason ("The absence was deleted on <date> by <name>; these instructions were not applied.") and the retained text. If the reporter still has a live absence on that date, show "Copy instructions to the current absence" only when the existing edit flow from `roster-intake-instruction-edit` can do it safely. Otherwise show the text so the SMC can re-enter it.
- Files/domains owned (include generated outputs): roster-update/public/edge-roster.js (delete hook, processor close, `dismissAbsenceInstructions` operation, `edgeIntakeEntries` mapping of `withdrawn`), shared/roster-operations.js only if absence deletion must call the hook there, roster-update/public/roster-operations-ui.js (Dismiss action, history wording), backend/RosterMirror.gs only if the pending/needsReview status list needs `withdrawn` handled, tests, CHANGELOG.md, generated bundles via the canonical build.
- Out of scope: deleting any rows (records are kept; status change only); changing the timetable scope check; editing instruction text; the Google path beyond keeping parity of the status list; any live data, settings, merge or deploy.
- Acceptance checks:
  1. Test: deleting the only absence linked to a pending or needsReview draft sets it to `withdrawn` with `ABSENCE_DELETED`, in the same revision (fails on current code).
  2. Test: the processor closes an already stuck draft whose absences are all deleted, instead of retrying or setting needsReview.
  3. Test: a draft linked to two absences stays open if only one is deleted. The processor applies to the live one, as today.
  4. Test: Dismiss by SMC/Admin works and needs a reason. A teacher who is not SMC/Admin gets 403. Dismiss on an applied draft is refused. The audit row is written.
  5. The `edge-health` check and `RosterMirror` no longer count `withdrawn` drafts as pending.
  6. Browser test: the item leaves "Needs attention" and shows in history with the reason and retained text.
  7. Canonical build leaves no diff; full local suite green; full CI green; draft PR naming Muse as reviewer at the exact head.

## Decisions and changes

- Live example (Claude, read-only D1 check, 11 Nov): Sri Asilah reported 12 Nov P5-P9 on 6 Nov 12:13 (request adbaa6cc-a44c-4107-bdb9-f24953842de7) with "Lesson swap with Syahirah". The absence 99094fed-7bff-4689-9261-d1d3805a13d0 was deleted 7 Nov 10:26 by the owner and re-entered as 8607afdb-adbc-4190-8782-38a029250bef (P5-P7, no instructions, no relief needed). Draft status: needsReview, ABSENCE_CHANGED, retryCount 1. Claude's direct D1 fix (status → withdrawn) was blocked by the safety check. The owner can apply the SQL Claude gave in chat, or wait for this task; after release, the processor closes it automatically (acceptance 2).
- Live fix done (owner "go D1 write", 11 Nov ~16:10): Claude set draft adbaa6cc… to `withdrawn` with resolvedBy/resolutionReason at roster head revision 10683 (head bumped first). Record kept. Seven other drafts are still needsReview: all 10 Nov, absences live, code INSTRUCTIONS_NEED_REVIEW (likely the pre-#111 drain failure). Left untouched for the owner.
- Relation to `roster-intake-instruction-edit` (Muse wrote it, Codex builds it): that task handles an absence that *exists but mismatches* (edit it, then the note applies). Its acceptance 3 says the deleted case "fails plainly". This task makes the deleted case close cleanly instead of staying stuck.

## Verification
Exact command, tested commit, outcome and evidence. Explicitly list checks not run.

## Review
