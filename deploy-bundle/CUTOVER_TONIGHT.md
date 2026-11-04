# Roster D1 cutover, attempt 4 (Wed 4 Nov, v0.9.9k)

Owner: Song Wee (every click). Checks: Claude (only when you message). Page: `https://roster.gsps.edu.sg/edge-setup.html`. Keep the custom domain up.

## Timeline (SGT)
| Time | Step |
|---|---|
| 16:30–17:30 | Deploy v0.9.9k (DEPLOY_STEPS.md), check |
| by 21:00 | #75 dry-run and apply (Claude gives the apply line) |
| 21:00 | Tell Claude "extend quiet 21:00 to 05:00" (Claude sets quiet mode in D1) |
| 21:15 | Claude health go/no-go; staff notice |
| 21:30 | 1. Check status. 2. Download private export → Freeze Google → Import / retry same import. Send Claude the import reference. |
| ~22:00, hourly | Check snapshot is current |
| by **01:00** | Preparation finished (else Cancel freeze) |
| by **03:30** | Rows written and Claude "parity OK" |
| then | `venuesFenceDiagnose` (ready, no pending) → Cloudflare `d1` on gsps-roster (Save, Retry deployment), gsis-roster-notifications, gsis-operations → Activate verified owner |
| by **04:00** | Activated |
| +0 / +20 min | Test window (Assign Relief twice, as before) |
| by **04:40** | Test passed → End quiet mode |
| **05:00** | No go: begin rollback |

**Staff notice (21:15):** "Roster maintenance tonight from 9.30 pm. Roster will not save changes overnight. Absence reports you submit will be queued and applied when maintenance ends; urgent matters, please WhatsApp the duty SMC."

## Message Claude at least
21:15, ~21:35 (import reference), 22:00, 23:00, 00:00, 01:00, then every 30 minutes. Claude cannot watch on its own.

## Stop rules
- Import shows "attention"/stopped: send Claude the screen; one retry; same step fails twice → Cancel freeze.
- Snapshot **Changed**: do not activate; Claude decides.
- Activation refused: screenshot → Cancel freeze.

## Rollback (from 05:00, or any failed test)
- **Not activated:** Cancel freeze… (also stops the server import).
- **Activated, backup complete (Claude confirms):** Switch back to Google… → Cloudflare `legacy` in 3 places (Pages: Retry deployment).
- **Activated, backup not complete:** Cloudflare `legacy` in 3 places → Apps Script Roster GSiS → `edgeAuthorityRollbackToLegacy`. Then `venuesFenceDiagnose`.
- Either way: End quiet mode so allocation runs before 06:30.

## Never
Never force activation, never activate without "parity OK" or after "Changed", never leave the freeze on past 05:00 without activation.
