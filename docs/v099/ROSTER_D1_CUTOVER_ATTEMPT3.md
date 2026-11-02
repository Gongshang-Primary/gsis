# Roster D1 cutover, attempt 3 (Mon 2 Nov 22:00, v0.9.9h)

Owner: Song Wee (every click). Checks: Claude. Page: `https://roster.gsps.edu.sg/edge-setup.html`. Keep the custom domain **up** all night.

**New since attempt 2 (merged today):** D1 reset after manual rollback (#51), Roster on D1 reads Deploy from Google (#54), peer-mail stays quiet on D1 (#53), import runs on the server (#55), Google backup runs only in the Worker (#56), Contacts permissions refresh every minute (#50), import-session archive and cap 24 (#59), lease-order fingerprint and lease-only tolerance (#49).

## Timeline
| Time (SGT) | Step |
|---|---|
| by 21:15 | 0. Deploy v0.9.9h and check |
| 21:15 | Staff notice |
| 21:30 | 1. Reset D1 and archive old sessions |
| 21:45 | 2. Freeze, import (server-driven) |
| ~22:00 | 3. First drift check |
| ~00:30 | 4. Claude parity |
| then | 5. Cloudflare `d1` (3 places), 6. Activate |
| +0 and +20 min | 7. Test window (Assign Relief twice) |
| **02:30 hard stop** | Not activated and passed: Cancel freeze (before activation) or roll back (after) |

**Staff notice (21:15):** "Roster maintenance tonight from 9.45 pm. Roster will not save changes overnight. Absence reports you submit will be queued and applied when maintenance ends; urgent matters, please WhatsApp the duty SMC."

## 0. Deploy v0.9.9h (before 21:15)
Follow DEPLOY_STEPS.md (six files). Cloudflare `ROSTER_EDGE_AUTHORITY` stays **legacy** for now on gsps-roster, gsis-roster-notifications and gsis-operations. Check: Roster header v0.9.9h, Assign Relief loads (Google).

## 1. Reset D1 and archive old sessions (5 minutes)
1. edge-setup → **Check status**. Expect `roster`/`roster-register` mode **active** (left from last night) and a **Reset D1 after manual rollback** button.
2. Section 3 tick the box → **Reset D1 after manual rollback** → Review → Continue. Expect both modes **legacy**, revision 0. Evidence is kept in D1. Screenshot to Claude.
3. **Archive retained import sessions** → Review → Continue (copies old abandoned sessions to R2, verified, then frees D1). Screenshot to Claude.

## 2. Freeze, then import (about 2 to 3 hours)
1. Section 2 **Download private export** (keep private).
2. **Freeze Google for cutover…** → Review → Continue.
3. Section 2 **Import / retry same import** → Review → Continue. Send Claude the import reference.
4. The import now runs on the server. The tab may close or sleep; reopen and **Check status** to see progress. Retry only if it shows a stopped error.

## 3. Drift checks
About 15 minutes after the import starts, press **Check snapshot is current** (now works while frozen). **Current**: continue; repeat about hourly. **Changed: …**: screenshot to Claude at once; do not activate.

## 4. Parity (Claude, 10 minutes)
When complete: **Check status** (both **imported**) and **Check snapshot is current** → screenshots. Wait for **"parity OK"**.

## 5. Cloudflare `d1` (10 minutes, before activation)
Set `ROSTER_EDGE_AUTHORITY` = `d1` on gsps-roster (Save, then Deployments → latest → ⋯ → Retry deployment), gsis-roster-notifications (Deploy), gsis-operations (Deploy). Roster still loads on Google (it may show "Roster is being moved" on save while frozen; that is expected).

## 6. Activate (2 minutes)
1. Section 2 **Download private export** (evidence), then section 3 tick → **Activate verified owner** → Review → Continue.
2. Expect both modes **active**, freeze activated. Screenshot to Claude.
3. Refused: screenshot (it names what changed) → **Cancel freeze…** → Monday-style Google.

## 7. Test window (40 minutes; Assign Relief twice)
Future date (next Friday), your own name.
1. **t+0:** Ctrl + Shift + R. Assign Relief (for tomorrow and Friday), Daily Notify, System Config, Storage, Statistics, My Calculations all load live.
2. Report Absence for yourself on Friday, two periods, relief required. Assign Relief: auto-allocate, change one cell, Save.
3. Do **not** press "Let teachers see", WhatsApp or "Archive now".
4. **t+20 minutes:** Ctrl + Shift + R and open Assign Relief again. It must still load live (this is where attempt 2 failed).
5. Delete the test absence; Save.
6. Tell Claude. Claude checks the permissions refresh, Google backup progress (cursor rising) and job health.
Do **not** press Update backup repeatedly; it now only requests a Worker run.

**Pass** = every screen loads at t+0 and t+20, saves succeed, backup cursor rising, no new job failures.

## 8. Rollback
- **Backup complete (Claude confirms):** edge-setup → **Switch back to Google…** → wait for "Verified Google backup restored" → Cloudflare `legacy` in 3 places (Pages: Retry deployment).
- **Backup not complete:** emergency route as on 2 Nov: Cloudflare `legacy` in 3 places, then Apps Script **Roster GSiS** → run `edgeAuthorityRollbackToLegacy` (EdgeAuthorityTools file). Claude lists anything written to D1 since activation for re-entry.

## Never
- Never force activation or set the Apps Script fence by hand (the tools file only lifts it).
- Never activate without "parity OK", or after a "Changed" drift result.
- Never leave the freeze on past 02:30 without activation.
