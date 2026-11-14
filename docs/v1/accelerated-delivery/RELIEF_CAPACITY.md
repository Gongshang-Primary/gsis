# Layered relief capacity and remaining-week outlook

Implementation owner: Roster. Source baseline: PR145 f1efe8a687cb640dae8731fe674acb72b33e7f9b. Contacts owns staff identity/accepted roles, Deploy owns immutable R publication, Calendar owns school days, Roster owns effective timetable, duties, peer reservations and accounting. No new authoritative copy is created.

## Behaviour

The health renderer uses `inspectCapacity` from the actual v1 allocator, sharing its layer resolution and eligibility. Green means eligible now for a single period; faint rows show baseline choices that are no longer available. Choices across periods are **not additive R**. Whole-lesson continuity and simultaneous demand are evaluated by the allocator, not promised by a green cell.

`capacityForecast` is an SMC/Admin read under `/api/roster/operations`, from the selected non-past date to the end of that Singapore school week (maximum seven dates). The forecast extracts the same allocation snapshot as real allocation, retains saved duties, and carries only newly simulated duties into later dates. Existing future duties already consume weekly R. It neither captures quotas nor changes assignments or ledgers. There is no automatic external relief activation.

Each day is `projected`, `not-school-day` or `not-verified`. Missing earlier evidence makes later projections unverified rather than optimistic. The result records observation time, policy/publication/accounting revisions and source dependencies. It is an as-of projection, not a reservation. Local configuration, baseline and week-accounting guards are rechecked before response; `FORECAST_CHANGED` (409) requires a fresh read. Independent service reads do not form a cross-D1 transaction; source changes after observation require refresh and actual allocation still revalidates.

The bounded solver uses at most 10,000 comparisons per school day and does not prove a global optimum. Uncovered periods mean no cover found in this projection, not the mathematical minimum external headcount. Present this distinction to SMC. Unknown capacity is not zero.

## Warning follow-up

This first small PR changes the read projection and visualisation. Existing notification scheduling is unchanged here. A separately claimed follow-up must replace legacy capacity-warning inputs and add the weekly outlook/change fingerprint before the warning item is considered complete. Do not activate messaging on the strength of this PR.

`notification-worker/template-contracts.json` records `gsis_relief_capacity_warning_v1` with duty SMC name, duty date, capacity details, relief-health summary and Roster URL; its existing wording asks SMC to consider external ad hoc relief without activating anyone. The morning template can carry a labelled outlook. These are repository approval records, not a live Meta availability check.

## Verification and rollback

Tests exercise R shared across periods/dates, strict layer limits, absent/peer/started/unverified exclusions, actual owner D1 read-only behaviour, ordinary-user denial, past-date rejection and built browser rendering with escaped labels/stale-error clearing. Existing Roster accounting tests continue to verify saved/future accounting and employment caps. Exact commands/head/results belong in the task and PR evidence.

Rollback this bounded PR to restore the prior read path and chart; no schema, persisted allocation, provider config or live resource changes are introduced. Earlier PR145 stays independently reviewable. Runtime UAT **Not tested**.
