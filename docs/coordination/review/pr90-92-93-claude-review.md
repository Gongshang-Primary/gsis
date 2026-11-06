# Claude reviews, 6 Nov ~11:40 — all three approve (owner merges)

| PR | Head | CI full-suite | Claude local | Merge |
|---|---|---|---|---|
| #90 Deploy→Contacts publish reporting + retry; viewport refresh (replaces #83) | f8eb9ad | green | 5/5 changed tests pass; build clean | conflicts with main only in CHANGELOG + 4 Worker bundles (mechanical) |
| #92 Calendar stale DISPATCHED recovery | db1cdbf | green | 3/3 pass; build clean | clean |
| #93 Assign Relief export = selected day, daily workbook format, no status tags | 77bf557 | green | 6/6 pass; build clean | conflicts only in 4 Worker bundles (mechanical) |

- #92: `STALE_DISPATCH_MS` = 1 hour; stale never-landed receipts become FAILED with AuditLog and a user message "Your save on … to … did not apply. Please redo it." Younger receipts still block.
- #93: status tags removed ([Published]/[Completed]); Combined/Repurposed kept; `dailyTeacherWorkbook` reuses the daily renderer; file `<date> Relief.xlsx`; adds active teachers missing from the plan.
- #90: supersedes #83 (close #83 after merge).
- Merge order: #92 (clean) → #93 → #90; resolve bundle/CHANGELOG conflicts by keeping both CHANGELOG entries and rebuilding with the canonical build; run the changed tests after each merge.
