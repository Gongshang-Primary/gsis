# GSiS v0.8.9b Roster frontend patch

Move the dated normal/suspended timetable status to the right of the Roster heading. Keep the existing 14 px text, weight, colour, date formatting and status logic. Align the first text baselines; let the status wrap within its column on narrow screens.

This cumulative Roster frontend includes patch a. Upload only Roster_Frontend_v0.8.9b.zip to the existing Roster Pages project, preserving settings and bindings. Backend and cron Worker stay at v0.8.9.

Verification: the dated-status browser regression passes mobile (390 px) and desktop (1366 px), preserved font size, overflow, active baseline/confirmed/published/draft states, failure/mismatch, Singapore rollover and zero extra requests. The existing home navigation/role browser regression, JavaScript syntax, whitespace and exact component package validation pass. Both rendered layouts were inspected. Independent Thermonuclear correctness and quality reviews found no material issue. Ponytail, PStack, Vercel and Superpowers review principles were retained. No live deployment or data changes.

Merge this small layout adjustment with patch a into the next full suite.
