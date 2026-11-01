# Roster D1 rehearsal 3: parity evidence (Claude, 1 Nov 2026 ~09:50 SGT)

Import request f5f336a2-80c2-46ed-a02c-a12e58ab1fe2, session 5d942437…; v0.9.9e (main 8df5a92). Capture 31 Oct 21:24 SGT; preparation resumed twice after the browser tab paused (steps 85 and 131); staging 225/225 parts committed by 09:42 on 1 Nov. Session state `imported`.

## Integrity
- Session source digest = both heads' metadata source digest = `bf1ab4526cabb6e20e172a46eeb9cd1c6b44bbafca7b7c878286ed745102bcc1`; manifest digest `71a3f4d8…` on both heads.
- Manifest: 225 parts, 22,702,880 bytes; all 225 part receipts present.
- Heads: `roster` imported, revision 1, 13,092 records; `roster-register` imported, revision 1, 21 records; `roster-references` active (746, references store); `deploy` legacy.

## Counts against Google (Storage report, 31 Oct 04:47 SGT)
D1 stores one `$` marker row per collection; counts below exclude it.

| Collection | Google | D1 |
|---|---|---|
| absences | 351 | 351 |
| assignments | 936 | 936 |
| audit | 3,169 | 3,169 |
| outbox | 1,053 | 1,053 |
| staplerPlans | 10 | 10 |
| staplerArchives | 9 | 9 |
| optimisationRuns | 215 | 215 |
| receipts | 520 | 520 |
| smcAlerts | 517 | 517 |
| acknowledgements | 184 | 184 |
| rotationEvents | 657 | 657 |
| publicationSnapshots | 277 | 277 |
| dailyPublicationStates | 5 | 5 |
| dailyEmploymentSnapshots | 5 | 5 |
| scheduleReceipts | 1,130 | 1,144 (+14 scheduled runs between 04:47 and capture) |

## Spot check, 2 to 13 Nov (D1)
Absences per date: 2 Nov 11, 3 Nov 12, 4 Nov 6, 5 Nov 7, 6 Nov 8, 7 Nov 4, 8 Nov 4, 9 Nov 4, 10 Nov 7 (6 live), 11 Nov 6, 12 Nov 5, 13 Nov 9. Assignments: 2 Nov 4 draft; 3 Nov 13 draft; 5 Nov 6; 6 Nov 6; 11 Nov 1; 12 Nov 3; 13 Nov 14. Owner to confirm 2 Nov against Roster.

## Verdict
Copy is complete and internally consistent; collection counts match Google exactly where Google was unchanged. Not activated (the copy is stale by design: Google kept changing after capture). Next: cutover freeze (row F), then a frozen import and activation.
