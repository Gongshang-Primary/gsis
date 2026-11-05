# roster-calculations-relief-done: "cumulative relief done" headline must match "Completed relief"

- Status: changelog (owner 6 Nov, on v0.9.9n D1); lane R (UI); Codex or Muse when authorised. Small.
- Reviewer/model: Claude
- Owner report: "changelog the 2 highlighted numbers should match" (My Calculations: headline "your cumulative relief done is Unavailable" vs "Relief completed so far … Completed relief: 2 periods").

## Cause (roster-update/public/roster-calculations.js line 25)
The headline shows `percent` = `completion.percentage` (completed ÷ recorded quota × 100), labelled as "cumulative relief done". With quota 0 / not recorded the percentage is null, so it prints "Unavailable", while the card below shows the completed count (opening balance + D1 relief) = 2.

## Required
1. Headline: "your cumulative relief done is **<completed> periods**" using the same `completion.completed` value as the card (opening balance done + completed D1 relief after the as-of date). Shown whenever history is verified, independent of quota.
2. Show R% only as a separate, clearly labelled value when a quota exists: "(<percent>% of your recorded quota)"; when no quota, say "No relief quota is recorded" (as the card does), never "Unavailable" for the count.
3. "Unavailable" only when the completion itself cannot be computed (history unverified), with the reason.
4. Same numbers on Google and D1, and in any other place that shows "relief done" for the user (Home duty card, statistics) — reuse one source.
5. Tests: opening balance 2 + quota 0 → headline "2 periods", no "Unavailable"; quota present → count plus percent; unverified history → "Unavailable" with reason.
