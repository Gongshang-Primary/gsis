# GSiS v0.8.9a Roster frontend patch

Baseline: full v0.8.9 (`eeadf88306fc0e8c5e65bae620a13d425127a49b`).

Move the home timetable status above the Roster heading. Show `Normal timetable today Fri, 23 Oct 2026` when baseline is active, or `Suspended timetable in effect today Fri, 23 Oct 2026` when the effective day comes from a confirmed or published suspension. Dates use Asia/Singapore. An unconfirmed draft alone remains normal.

Use existing authorised batch content, without extra API reads or a new timer. Keep checking, failed verification, baseline mismatch and no-active-timetable states explicit. Update after preload checks and Singapore day rollover. Status is plain wrapping text with a polite live region; existing headings, icons and controls remain usable.

Deploy only the included `Roster_Frontend_v0.8.9a.zip` to the existing Roster Pages project. Preserve all variables, secrets and bindings. Apps Script and the cron Worker remain v0.8.9.

Verification: seven relevant source test programs pass (home timetable, home duty, elapsed counter, home navigation/roles, acknowledgement, cache and suspended absence load). JavaScript syntax, diff whitespace and the component package validator pass. The package contains only the Roster frontend ZIP and matches the committed runtime source. Mobile/desktop status layout was checked in Chromium. No live deployment or school data change was performed.

Five code lenses: Ponytail, PStack, Thermonuclear correctness/quality, Vercel and Superpowers. Two independent Thermonuclear reviewers examined the change. A real draft-only null timetableDay case found in review was fixed and tested; no remaining material finding. Design review retains the existing product style, plain hierarchy, text wrapping and nonblocking feedback using Awesome Design, Frontend Design Premium, Taste, UI UX Designer and Apple Design principles. No new dependencies or decorative animation.

Merge the runtime edits and regression test into the next full suite; preserve the v0.8.9 backend/Worker versions unless a later change updates them.
