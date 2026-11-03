# roster-peer-quota-override: a colleague's own approval may exceed weekly R (changelog → Codex)

- Status: implemented locally; fresh exact-head CI pending, 3 November 2026, Asia/Singapore.
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

## Implementation and verification

Model: Codex. Base main: 87b9662d8018cb6c822a0dc9b46dec70a84e4024. The documentation-only main claim was rejected by automatic approval review; the claim remains on the authorised feature branch at 4ec2fa24924a1c2d2acf8a90e2465a758edb31c8. No main mutation was made.

Only the recipient-approved respondMutual path passes peerApproval through mutualChoice and availability into eligibility. The weekly R condition and unverified-R warning are skipped there. The original condition remains recorded as peerROverride; every other check and every automatic/SMC allocator call retains its existing options. Positive verified R does not produce an override. Multi-period approvals are flagged if any period exceeds the remaining quota.

Assignments retain rCost=1 for ordinary relief and the existing zero-cost combination rule. A peer-quota-override essential audit survives quiet logging. Assign Relief receives the flag through its actual manual projection and shows the SMC/Admin warning "Approved by colleague above weekly R". No change to accounted, reliefCompleted, quota formulas, notification sends, infrastructure or live records.

Regression first reproduced the existing 409 Weekly R quota exceeded. Tests now pass for zero/unverified R, accounting, quiet-mode audit, a later period crossing the quota, positive R without a warning, timetable clash, absence, inactive staff, employment cap, restricted period and six consecutive periods. Automatic allocation ignores client-supplied peerApproval. The rendered UI test first failed because the manual projection omitted the flag; the actual projection and warning now pass. The D1 external approval test verifies the flag, counted duty, essential audit, saved receipt and idempotent retry with unverified R; missing Deploy service still fails without a commit.

Fresh npm run build regenerates all 18 components. Eight focused programs pass: peer-quota override, rendered peer UI, D1 edge Roster, peer workflow, integrity review, mutual timetable, mutual candidates and shared-subject protection. LORD passes 39/39. Full local npm test was started; final full-suite evidence will be recorded in the PR against its exact head. No tests dropped or weakened; the old D1 rejection expectation is updated to the explicitly authorised unverified-R approval policy. Claude reviews the exact head, owner merges.

## CI parity correction

The first full CI at e95c373b90e30233931f8e6d7cbd3a76091e4afc failed roster0810-allocation-index.cjs because an explicit false peerROverride field changed automatic ranking serialization. The correction emits the field only for an actual peer override, preserving default automatic results byte for byte. The unchanged parity test reproduced the failure before correction. All nine focused programs now pass, including the unchanged byte-for-byte ranking parity assertion. Fresh full CI is required on the corrected head.
