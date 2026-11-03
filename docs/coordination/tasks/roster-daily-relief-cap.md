# roster-daily-relief-cap: maximum relief periods per day per non-SRE teacher (changelog)

- Status: authorised (owner 4 Nov: "codex work"); lane R, Codex; queue after roster-import-duplicate-audit-id
- Branch: codex/roster-daily-relief-cap
- Owner/model: Codex when authorised
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 4 Nov 2026

## Owner request (verbatim)
"change log: add business rule of max number of relief periods given per day per non-SRE teacher, default 3, but ship unchecked (not enabled). place here (screenshot)"
Placement: System Config → Automatic Allocation → "Daily workload limits", as a fourth row after "Maximum consecutive periods", same checkbox + "Periods" number style.

## Rule (Claude draft; owner to confirm the open points)
1. Label: **"Maximum relief periods per day (non-SRE)"**. Default value 3. **Ships unchecked (Off).** When Off, behaviour is exactly as today.
2. When On: automatic allocation will not give a non-SRE teacher more than N relief periods on one date. Counts relief periods only (not their own lessons, PD, duties, invigilation). Daily SREs are not affected (they keep "Ad hoc relief max periods").
3. Counts every relief period already held that date (auto, manual, peer-approved) when deciding the next automatic one. Existing assignments stay in place (same as the other limits).
4. Manual assignment: warning only, same override rules as the other limits ("Manual assignment override rules remain separate").
5. Same rule on Google and D1 (shared allocator); stored in systemConfig with the other limits; audit/explanations name the limit when it blocks ("Daily relief limit 3 reached").
6. Tests: Off = no change; On with 3: fourth automatic relief blocked, SRE unaffected, peer-approved relief counts, manual shows warning, value validation (1 to 17).

## Owner rulings (4 Nov)
- Peer-approved arrangements count toward the cap: "peer counts".
- Manual assignment over the cap: "warn only".

## Related wording fix (from roster-consecutive-after-gap, Option A)
The section text "Other duties and PD still block availability, but do not count towards these limits ... The consecutive limit still applies." must say that the consecutive limit counts every occupied period except "Periods excluded from the consecutive count". Muse's consecutive PR updates this sentence.
