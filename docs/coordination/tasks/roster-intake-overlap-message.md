# roster-intake-overlap-message: overlapping absence reports — say why, and show the true status

- Status: changelog (owner 6 Nov); lane R; Codex when authorised. Small.
- Reviewer/model: Muse or Claude

## Evidence (D1 `gsis_absence_transport`, 6 Nov)
- db77bad5… (Yoke Yeong + Widayu, 18 Nov P5–P6 "WR"): state needsReview, BACKEND_REJECTED_409; both already have 18 Nov P5–P6 "WR" absences (duplicate).
- 9b500d10… (Jenny Tan, 10 Nov P10 "Mathcheckplus"): needsReview after 2 attempts, BACKEND_REJECTED_409; existing 10 Nov absence P7–P10 "Work review" overlaps P10. The teacher's card still said "Received; sending to the school register".

## Required
1. Map the overlap 409 to a plain reason for the reporter and SMC: "You already have an absence for P<n> on <date> (<reason>). SMC will review." List the overlapping existing absence(s).
2. Exact duplicates (same teacher, date, periods, type/reason): resolve automatically as "Already recorded" with an audit note; no SMC work.
3. Partial overlap: SMC review offers "Merge into existing" (extend periods / update reason), "Keep existing, close report", or "Edit existing then retry".
4. The reporter's card shows the true transport state (needs review / already recorded / applied), never "sending" for a parked report.
5. Tests: duplicate auto-resolves; partial overlap shows reason and options; card state matches transport state.
