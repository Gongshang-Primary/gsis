# Roster D1 cutover, attempt 2 (Sun 1 Nov 21:30, v0.9.9g)

Owner: Song Wee (every click). Checks: Claude. Use `https://gsps-roster.pages.dev/edge-setup.html` (or roster.gsps.edu.sg once re-added).

**Already done, do not redo:** Cloudflare `ROSTER_EDGE_AUTHORITY=d1` on gsps-roster, gsis-roster-notifications, gsis-operations.

**Lesson from attempt 1:** keep the custom domain **up**. The freeze queues staff absence reports safely; removing the domain only hides failed attempts. Removing it does not stop webhooks.

## Timeline
| Time (SGT) | Step |
|---|---|
| by 21:15 | v0.9.9g deployed and checked (DEPLOY_STEPS.md) |
| 21:15 | Staff notice (below) |
| 21:30 | 1. Restart, freeze, import |
| ~21:45 | 2. First drift check after capture |
| hourly | Drift check |
| ~00:30 | 3. Claude parity check |
| straight after | 4. Activate, 5. Test |
| **02:30 hard stop** | Not activated and tested: **Cancel freeze**. Monday on Google |

**Staff notice (21:15):** "Roster maintenance tonight from 9.30 pm. Roster will not save changes overnight. Absence reports you submit will be queued and applied when maintenance ends; urgent matters, please WhatsApp the duty SMC."

## 1. Restart, freeze, import (start 21:30)
1. Windows sleep off. Edge-setup tab in front the whole time.
2. **Check status**.
3. Section 2 **Download private export** (keep private).
4. Section 3 tick the box (**Activate stays greyed**; if clickable, stop) → **Restart incomplete import** → **Restart import** → untick.
5. **Check status**: `roster` and `roster-register` mode **legacy**, revision 0. Screenshot to Claude.
6. **Freeze Google for cutover…** → Review → Continue.
7. Section 2 **Import / retry same import** → Review → Continue. Send Claude the import reference.
8. Timeouts now retry by themselves ("Retrying automatically…"). Only if it stops with an error: screenshot, wait 7 minutes, **Import / retry same import**.

## 2. Drift checks (the new safety net)
1. About 10 to 15 minutes after the import starts (once capture is done), press **Check snapshot is current**.
2. **Current**: carry on. Repeat about hourly; not more often (each check makes Google build a full snapshot).
3. **Changed: …**: screenshot to Claude at once. The import is already stale; Claude decides with you whether to stop (Cancel freeze) or diagnose. Do not activate.
4. If the button answers "Wait for snapshot capture", try again in 5 minutes.

## 3. Parity (Claude, 10 minutes)
When complete: **Check status** → screenshot (both modes **imported**). Then press **Check snapshot is current** once more and send the result. Do nothing until Claude says **"parity OK"**.

## 4. Activate (immediately after parity OK)
1. Section 3 tick the box → **Activate verified owner** → Review → Continue.
2. Expect modes **active**, freeze activated. Screenshot to Claude.
3. Refused: screenshot (it now names what changed) → **Cancel freeze…** → Monday on Google.

## 5. Test (30 minutes)
Future date (next Friday), your own name.
1. Roster: Ctrl + Shift + R. Assign Relief, Daily Notify, System Config, Storage load.
2. Report Absence for yourself, two periods, relief required.
3. Assign Relief: auto-allocate, change one cell, Save.
4. Do **not** press "Let teachers see", WhatsApp or "Archive now".
5. edge-setup → **Update backup** → **Check status**: backup 0 minutes behind.
6. Delete the test absence; Save; backup 0 behind.
7. Tell Claude. Pass = loads, saves, backup catches up within 2 minutes, no new job failures.

Fails and cannot be cleared in 10 minutes: **Switch back to Google…** → "Verified Google backup restored" → set `ROSTER_EDGE_AUTHORITY=legacy` on gsps-roster (Retry deployment) and both Workers (Deploy) → Ctrl + Shift + R → one test edit saves to Google.

## 6. Monday 06:30 to 08:00
Reachable. "check log" to Claude at 06:30. Switch back if Assign Relief will not open or save, absence reports fail, backup over 10 minutes behind, or WhatsApp not sent by 07:00.

## Never
- Never force activation or edit Apps Script `ROSTER_EDGE_AUTHORITY` by hand.
- Never leave the freeze on past **02:30** without a passed test.
- Never activate without Claude's "parity OK" or after a "Changed" drift result.
