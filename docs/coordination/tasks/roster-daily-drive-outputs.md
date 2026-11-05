# roster-daily-drive-outputs: daily Excel + LLM-readable decisions log on the GSiS Drive home base

- Status: changelog (owner 5 Nov); lane R; Codex when authorised. Spec by Claude under the standing rule (owner intent, Claude specifies).
- Reviewer/model: Claude. Related: roster-d1-backup-ledger (same writer, ledger and home base).

## Owner intent (verbatim, 5 Nov)
- "continue to use this shared google drive as 'home base' folder": https://drive.google.com/drive/u/0/folders/1pVI5eS4NWxbr8Ct0-2mmYVZEQZwa68_Z (folder "GSiS" in the school shared drive; organizers: owner, faizal.firoz, cleo.tan, helper, group School Leaders).
- "want the daily text file log for teachers to be able to query via LLM and prompt the decisions"
- "want a daily Excel human-readable sheet using the same format as current export but not whole week. frozen period + timings up top and list of all active and activated ad-hoc relief teachers on left column, consistently 4 rows per teacher, colour coded as per stapler conventions (orange relief, pink extra, greyed absence no fill otherwise etc)"
- "the daily (each school day) should be updated at fixed time events eg after each publish and after each autoallocate i.e. OK to be 'latest accurate' and stop being updated once the calendar day has passed"

## Drive layout (home base = folder GSiS, id 1pVI5eS4NWxbr8Ct0-2mmYVZEQZwa68_Z)
- (withdrawn, see Owner answers) `06 Roster Daily/<YYYY-MM>/` : `<YYYY-MM-DD> Relief.xlsx` and `<YYYY-MM-DD> Roster decisions.md` (one pair per school day; each update overwrites the same file id, so Drive version history keeps every version).
- (withdrawn) `07 Roster Backups/` : restricted ("limited access" folder, inherited access off): Admin only; backup JSON, manifests (roster-d1-backup-ledger).
- Folder ids are stored in System Config (Admin), never hard-coded; the writer refuses any folder outside the home base and never writes into the frozen Google archive files.
- Security note: the home base also holds credentials material ("Cloudflare 2FA Token Code" doc, "Cloudflare R2 API" folder). Any wider sharing must be on the `06 Roster Daily` folder only, never on the home base. Recommend moving credentials out of the shared drive into a password manager.

## Daily Excel (`<date> Relief.xlsx`)
- One sheet for the day, built with the existing export renderer (same look as the current Stapler/teacher timetable export), not the whole week.
- Top rows: school, date and weekday, timetable source (baseline name or "Stapler plan"), status line "LATEST as of HH:MM, revision N" or "FINAL (day closed)". Then the period numbers row and the timings row. Panes frozen below the timings row and right of the teacher column.
- Left column: every active teacher plus every ad-hoc relief teacher activated for that day, in the export's usual order; exactly 4 rows per teacher (the 4 cell fields of the export: subject, class, venue, group), always 4 even when empty.
- Colours as in Stapler: orange = relief duty; pink = extra/added duty; grey = absent periods (greyed text); no fill otherwise; legend row at the bottom. Covered-by and absent-teacher names in the relief cells as the export shows them.
- No absence reasons or medical types anywhere in the sheet.

## Decisions log (`<date> Roster decisions.md`, UTF-8 text, LLM-ready)
- Header: what the file is, date, status (LATEST/FINAL), revision, generated time, and a short "how to ask" block (example questions a teacher can paste into Gemini/ChatGPT with the file attached).
- Rules glossary (plain words): weekly R quota, consecutive-period limit and exclusions, daily relief cap (if on), SRE/daily-roster basis, fairness order (R%), Stapler day meaning, peer arrangements.
- Absences: teacher, periods, category "absent" only (no reason, no medical detail).
- One record per relief lesson: period and time, class, subject, absent teacher, relief teacher, method (auto-allocate, manual SMC, peer, Stapler, imported), status (draft/published/cancelled), the checks it passed (free that period, within weekly R, consecutive limit, daily cap), the fairness basis (chosen teacher's R% before and after), and the number of other eligible teachers with reason categories for not choosing them (see open question 2).
- Uncovered periods and why (no eligible teacher, all at limits).
- Timeline: each change with time, revision, actor role (SMC/system), what changed. Records stay factual; no free-text speculation.
- Stable headings and one record per block, so an LLM can quote exact lines.

## Update rules
- Triggers: a committed Auto-allocate (manual or scheduled), a publish/"Let teachers see", and any saved change to that date's relief (manual save, peer approval, absence change), coalesced: one write at most every 2 minutes per date, latest revision wins.
- Writes run from a D1 job queue processed by the Worker timer; never inside a user request; no effect on screen speed. Retry with backoff; a failed write never blocks Roster.
- Scope: each school day from when it first has data, through the end of that calendar day (Asia/Singapore). The first run after 00:00 writes the final version marked "FINAL (day closed)"; after that the files are never updated again. Later corrections stay in D1, the audit log and the backups.
- Each write adds a ledger row (date, kind excel/log, revision, bytes, Drive file id and version, digest, duration, status) in the shared backup ledger; System Health shows the last write per date and alerts SMC/Admin after 2 failed attempts.

## Tests
- Workbook: frozen panes, 4 rows per teacher including empty teachers and ad-hoc teachers, colours per state, legend, no absence reasons; matches the export renderer's cell content for the same day.
- Log: deterministic text for a fixture day; every assignment appears once; no reasons/medical fields; rules glossary present.
- Triggers: auto-allocate and publish enqueue; burst of saves coalesces to one write; FINAL after midnight; no writes for a closed day; writer refuses folders outside the home base.
- Failure: Drive error recorded, retried, alerted; Roster save latency unchanged.

## Owner answers (5 Nov) and revised design
1. Access is managed with Google Drive permissions by the owner; GSiS does not manage sharing. (Question closed.)
2. The LLM workflow already exists: the **Allocation Audit** text export, `01 Live Data/Roster/Allocation Audit/<YYYY>/<MM>/<YYYY-MM-DD>.txt` (backend/RosterAuditExport.gs on Google; `exportEdgeAudit` in roster-update/public/edge-roster.js on D1). **Extend it; do not create a second log.** This replaces the "Decisions log" section above:
   - Keep the file, folder, name and the existing event trail format unchanged (teachers' prompts depend on it).
   - Add at the top: a plain-words rules glossary and a "Day summary" (absences by teacher and periods without reasons; each relief lesson with period, class, absent and relief teacher, method, status).
   - Add to each allocation event a "Why" block: checks passed (free that period, weekly R, consecutive limit, daily cap), the chosen teacher's R% before and after, and the count of other eligible teachers with reason categories. Names of alternatives follow what the existing export already shows; no new personal data.
   - Size: files reach 1 to 3 MB per day today. Keep the full trail, but put the summary first so an LLM reads the important part within its window.
   - Verify it runs in D1 fresh-start mode (the Google mirror is off there) and still writes to the same Drive folder; quiet mode pauses it today, keep that.
3. Folder layout follows the existing tree under the home base, not new top-level folders:
   - Daily Excel: `01 Live Data/Roster/Daily Relief/<YYYY>/<MM>/<YYYY-MM-DD> Relief.xlsx`.
   - Backups (roster-d1-backup-ledger): `01 Live Data/Roster/Backups/` (owner sets its Drive permissions).
   The `06 Roster Daily` / `07 Roster Backups` names above are withdrawn.
4. The credentials note is not a GSiS output: those two items were placed in the home base by hand. GSiS never writes credentials, tokens or private links to Drive (tested).
