# roster-peer-quota-override: a colleague's own approval may exceed weekly R (changelog → Codex)

- Status: claimed by Codex, 3 November 2026, Asia/Singapore. Owner authorisation: 08:37, "need to allow peer arrangement overwrite of relief quota".
- Owner/model: Codex
- Reviewer/model: Claude
- Branch: codex/roster-peer-quota-override
- Lane: R (serial). Must work on Google and D1.

## Evidence (owner screenshot, 08:37)
Colleagues' relief requests: Alvinna, 4 Nov (Wed) P3 and P4, EL 3R / D2-09, "Relief cover · pending". Approve fails: "Weekly R quota exceeded. Stage: backend · Backend: 0.9.9".

## Cause (Claude)
`respondMutual` approve (`shared/roster-operations.js` ~line 1611) calls `mutualChoice(...)`, which runs the full `A.eligibility(...)` per period (`shared/roster-allocation.js` ~280-302). Eligibility adds "Weekly R quota exceeded." when `Rviolation = poolMember && !t.ext && !t.dailyRoster && !options.repurpose && (unknown || remaining < 1)`. The R quota is a fairness limit for **automatic** allocation; a teacher voluntarily accepting a colleague's request should not be blocked by it.

## Requirement
1. On a peer arrangement **approval by the recipient** (`respondMutual` approve), skip only the weekly R quota rule (`Rviolation`, including "R is unverified"). Pass an explicit option (e.g. `peerApproval:true`) through `mutualChoice` to `eligibility`; never a global switch.
2. Keep every hard rule: timetable clash/teaching, restricted periods, weekly teaching cap, attendance, inactive staff, six-consecutive-periods streak, protected/started duties.
3. The approved relief **still counts** as relief done for R and fairness (no change to `accounted`/`reliefCompleted`).
4. Record the override on the assignment and in the audit ("Approved by colleague above weekly R") so SMC sees it; show it as a warning, not an error, in Assign Relief.
5. Automatic allocation and SMC auto-fill behaviour are unchanged.

## Acceptance
- Test: a recipient at R=0 remaining approves → assignment saved, counted, flagged; same recipient with a timetable clash → still refused; auto-allocation still respects R.
- D1-path test (same result on D1).
- Full CI green.

## Implementation claim

Model: Codex. Base: 87b9662d8018cb6c822a0dc9b46dec70a84e4024. Scope: shared/roster-allocation.js, shared/roster-operations.js, the Assign Relief warning display if required, focused Google/D1/UI tests, CHANGELOG and generated copies from npm run build. No quota/accounting formula, automatic selection, hard eligibility, provider-send, live-record or authority changes. Reproduce zero/unverified R approval failure first; test clash and hard-rule refusal, accounting, SMC warning and D1 persistence. Claude reviews the exact final head; owner merges.
