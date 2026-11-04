# roster-daily-relief-cap: maximum relief periods per day per non-SRE teacher (changelog)

- Status: claimed for implementation; owner v0.9.9j item 4, lane R
- Branch: codex/roster-daily-relief-cap
- Owner/model: Codex
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

## Bounded v0.9.9j claim

Model: Codex. Reviewer: Claude at final head. Branch `codex/roster-daily-relief-cap`, base main `661e79004a274a33bdee6753507c9efa524cf007`. Owner exception permits this separate draft PR after item 3 is published for CI. The owner has ruled peer-approved duties count and manual override warns only. The new fourth workload row defaults to 3, range 1 to 17, disabled for existing and new configuration. All SRE classifications remain exempt from this non-SRE rule. Count distinct relief periods held on the selected date, including imported, approved peer, manual and proposed duties; exclude own lessons, ordinary duties and null-period aggregates. Existing assignments remain.

Owned scope: shared allocator and operations configuration projections, data-driven System Config UI, generated copies, focused tests and this record. Preserve Muse's existing consecutive-count wording and logic. No cutover, freeze, import authority, live configuration or deployment change. Acceptance requires disabled parity, fourth-period automatic rejection when enabled, imported/peer accounting, SRE exemption, manual warning without refusal, persistence/validation and shared Google/D1 behavior. Build all 18 components and require exact-head full GitHub Node/LORD CI before immediate Claude handoff.

## Implementation and local proof

Shared workload metadata adds `dailyRelief` / `maxDailyReliefPeriods` with default 3, Off, and whole-number range 1 to 17. Existing nine rule defaults remain On. The fourth UI row follows Maximum consecutive periods; its saved value is retained when switched Off. Google and D1 use the same allocator and stored configuration.

Held relief uses distinct periods from current assignments and the existing corrected/imported ledger, including approved peer and zero-cost combination or repurposed recess cover. Aliases merge into the same person. Cancelled/invalid/superseded cover and null-period aggregates do not consume slots. Own lessons, PD and ordinary duties do not count. All SRE classifications are exempt from this non-SRE cap; existing SRE verification rules still apply. Solver headroom, complete-plan validation, consecutive blocks and bounded exchanges enforce the enabled cap. Existing protected duties stay. The reason names the daily relief limit without replacing an explicit incomplete-block explanation.

Manual rankings, candidate previews, ordinary saves and combination saves show the cap warning without refusing the assignment. The warning stays out of the peer acceptance gate; an approved arrangement still succeeds and counts toward later automatic headroom. Configuration validation and safe learning projection include the new setting. The existing consecutive wording and count logic are preserved.

Tests first reproduced missing fourth-period enforcement, the zero-cost recess bypass, absent manual warnings and generic complete-plan explanations. The 20-case cap program covers disabled parity, imports/corrections/aliases, all SRE modes, peer reservations and approval, manual assign/combine/replacement, whole-plan flow/exchanges, PAL blocks and actual automatic/scheduled entry points. Existing rank byte digest, allocator/policy and UI/persistence/privacy checks pass. All18 components and focused Google/D1 integrations are rebuilt and checked before publishing; full exact-head GitHub Node/LORD CI is the final review gate. No live setting or records changed; not deployed.

Final local integration: all18 components regenerated; the 20-case cap program passes, including Google shared versus rebuilt D1-domain output parity. Existing allocation index byte digest, workload allocator, policy, consecutive-subject, real edge SRE context, Chromium settings, backend/client persistence, learning privacy and peer-quota override programs pass.

A final regression audit found two suspended-day metadata expectations that enumerated the original three workload settings. They now explicitly include `dailyRelief:null` while retaining every policy/behavior assertion. The suspended-day program passes16 cases, including a new enabled-cap case proving workload-ignored dates still enforce relief headroom. No production behavior changed in this follow-up.
