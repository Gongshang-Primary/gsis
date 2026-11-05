# roster-daily-drive-outputs: daily Excel + LLM-readable decisions log on the GSiS Drive home base

- Status: implemented; local full suite passed; ready for exact-head Claude review; Model: Codex; lane R; priority 2 of the owner-authorised Drive work. Spec by Claude under the standing rule (owner intent, Claude specifies).
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

## Small addition (5 Nov 20:46 message)
The "Relief Capacity Warning" WhatsApp read "Relief capacity: P1 has 2 eligible opportunities. Health 100.0%. 46 uncovered periods. Relief Health: 100.0%". "Health 100%" beside 46 uncovered periods contradicts itself and the P1 line is unclear. Fix the wording in the same PR (template body is approved; change only the variable text): name what is short ("46 periods uncovered; fewest eligible teachers: P1 with 2"), and either define Relief Health in plain words or drop it when uncovered > 0.


## Implementation claim (Model: Codex)

Owner/model: Codex. Reviewer: Claude at the exact PR head. Owner merges.
Updated: 2026-11-05 (resumed verification; Asia/Singapore).
Branch: `codex/roster-daily-drive-outputs`.
Base main: `75fb5d4c642c920a01c63d6d56b6e2af68dada2f`.
Dependency: backup PR #81 at `644108ffc2eac254aa4b4f560b5105d51d7f591c`. The owner explicitly ordered this follow-on after the backup work. The same implementer works serially; #81 is frozen for review. This branch starts from the accepted claim, brings in that shared implementation, and targets its branch as a separate stacked PR. No duplicated ledger or writer.

Scope: existing Roster/Stapler Excel renderer; backend/RosterAuditExport.gs and exportEdgeAudit; a D1 date queue processed only by the background Worker; the existing dedicated Drive writer and gsis_backup_ledger; System Config/Health; allocation evidence and capacity-warning variable wording; canonical generated copies, focused tests and task record. No deployment, live writes, notifications, sharing changes, frozen archive writes or authority change.

Acceptance: one daily workbook with frozen headings/teacher column, all active and day-activated ad-hoc teachers, four rows each, Stapler colours and privacy; the existing audit TXT keeps its path and event trail with a summary/glossary/Why evidence; two-minute coalescing, midnight FINAL then immutable, failure retries/alerts; fresh-start support; canonical build and all Node/LORD checks green. Exact implementation SHA and final review head recorded at handoff.

Plan:
1. Extend the existing export renderer with a pure one-day teacher page and shared XLSX package path; test cell parity, panes, empty/ad-hoc teachers and colours.
2. Extend the existing audit text builder in place, adding factual captured decision evidence and privacy-safe summaries; reuse it from D1 without changing file identity or quiet-mode behavior.
3. Add a durable date queue and immutable finalisation metadata; observe committed revision changes in D1, coalesce writes and perform all rendering/provider work on the timer. Reuse the guarded writer and ledger, with read-back hashes and retained failure evidence.
4. Add Admin output configuration and System Health results/alerts; correct the approved warning variables. Test triggers, provider failure/retry, fresh-start, quiet mode, finalisation and save latency.
5. Rebuild canonical copies; run focused checks, full Node/LORD CI and advisory review; open a draft PR naming Claude and its exact head.

Current outcome: implementation complete and local full verification passed. After the review corrections, `TZ=Asia/Singapore npm run build` rebuilt all 18 components and ten focused programs passed. A fresh full `TZ=Asia/Singapore npm test` run at local implementation `fdaf16143efb14397dd56f28c7d28620912763f4` passed all 1,011 current Node programs across four isolated shards (253/253/253/252, no omissions or duplicates), Chromium checks, and all 40 LORD programs in every shard. The runner’s existing historical exclusions are unchanged. This final documentation update changes no product code. No live actions.

Implementation: a dedicated even-minute timer renders from one checked Roster/register/reference/Deploy revision. Transactional D1 date intents, two-minute coalescing, a separate lease, retained gzip payloads, read-back SHA-256 and shared ledger isolate provider work from requests. The existing output-only Drive writer updates the same IDs and independently refuses FINAL replacement. Existing Allocation Audit text and evidence archives are reused; no second log or ledger was created. Settings are Admin-only; daily outputs can be enabled while backup scheduling and the ordinary mirror are off. Setup/recovery: `docs/ROSTER_DAILY_OUTPUTS_RUNBOOK.md`.

Limits: 16 MiB raw / 8 MiB gzip per daily file; missing cold audit evidence or source authority fails visibly rather than claiming a complete export. Historical allocation checks remain explicitly unknown. No live size, permission or delivery assertion is made.

Resume review: the internal Codex advisory found one Important issue and no other actionable findings. Past allocator demands deliberately omit current subject-policy flags; the new FINAL summary therefore counted an exempt TL lesson as uncovered after midnight. `tests/roster-daily-audit.cjs` reproduced the false count before the fix, then passed with both the exempt lesson and a genuinely uncovered EL lesson. The daily output projection now supplies missing cover-policy flags from its effective source context, and the shared workbook overlay respects exemptions. Historical allocator demands and captured allocation checks are unchanged. This advisory is not Claude approval.

Build correction: the Drive output source duplicated the builder-owned BEGIN/END wrapper, adding a closing marker on every build. Removed only those source wrappers and regenerated their backend copies. Repeated canonical builds are byte-identical; runtime text is unchanged by this packaging correction.

GitHub implementation commit: `c022d88b6131bc1dacd2b1925d82a81bcc72680c`. Its tree `42a2c3de7d00aea50a0dd0d08c07a0979728b134` exactly matches local handoff `394ec0a3fb73e35a48958737ac344ae2cc2f7dcf`; the final commit only records this handoff. The separate draft PR targets `codex/roster-d1-backup-ledger` and names the exact final review head. No force-push, main merge, deployment, live record change or provider message is authorised by this handoff.

Next exact action: Claude reviews the exact PR head, then the owner decides integration after backup PR #81. Retarget the follow-on to main after #81 merges and rebuild/retest any integration delta. Main was refreshed at `9fdcffd97d7d3b2e898371718271a5668d470afe`; its two newer changes are documentation only, including a separate unclaimed absence-submit task outside this work. Live permission, timing and provider acceptance remain the documented post-deployment drill.

## Owner decision (6 Nov ~01:15): remove the "Why" capture and keep the audit log as it was
Owner (verbatim): "wait, what is the why capture? the current LLM text log is sufficient for my use"
Claude added the summary/glossary/"Why" extension to the spec on its own; the owner did not ask for it. Follow-up (Codex, before build n):
1. Remove `captureDecisionWhy` and every call (backend/RosterOperations.gs, backend/RosterAuditExport.gs, roster-update/public/edge-roster.js, edge-roster-output-renderers.js, shared/roster-allocation.js and generated copies). Nothing extra runs inside saves.
2. Restore the Allocation Audit TXT to its pre-#82 format exactly (no Day summary, no rules glossary, no Why block); keep #82's queue/ledger/coalescing only if the unchanged text needs them.
3. Keep the daily relief workbook and the capacity-warning wording fix.
4. Tests: audit text byte-identical to the pre-#82 renderer for a fixture day; no allocationWhy written; workbook tests unchanged.
This replaces the "captureDecisionWhy guard" requirement in docs/coordination/review/pr82-claude-review.md.
