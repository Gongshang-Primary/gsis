# Provider delivery time formatting

- Status: implementing on a prepared branch; PR waits for an available slot.
- Owner/model: Codex
- Reviewer/model: Claude
- Branch: codex/roster-delivery-time-format
- Base SHA: 097fbcbf7bedcf77affb63936abde6c3bf03db39
- PR: none

Model: Codex. Queue row 5: provider delivery timestamps arrive as 13-digit millisecond strings or 10-digit seconds strings. Format them as Singapore dates/times rather than displaying raw digits. Keep ISO strings and numeric millisecond inputs supported, preserve safe invalid fallback, and cover the real delivery status markup. No backend records or notification contents change.

Local verification: provider timestamp and delivery markup regression passed for 10-digit seconds, 13-digit milliseconds, numeric milliseconds, ISO timestamps and invalid fallback. The workspace disconnected during the component rebuild; this exact patch was recovered to GitHub and requires the full Linux CI build/test before handoff.
