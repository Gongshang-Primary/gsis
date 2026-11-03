# GSiS development continuity

Start with the current `RELEASE_SUMMARY.json`, `CHANGELOG.md` and `README.md`, then the handover and requirements register they identify. For 0.9.9 these are `docs/v099/HANDOVER.md`, `REQUIREMENTS_STATUS.md` and `ROSTER_WORKER_ROADMAP.md`.

- Production Roster remains Google-first while the Worker route is developed in parallel. Do not activate historical full-Roster D1 authority flags or replace production readers as part of preparation work.
- Record each future implementation step and changelog: scope, route and authority, receipt versus saved outcome, code/evidence reference, configuration changes, verification, rollback and remaining gates. Keep the roadmap current when a stage advances; distinguish proposed, locally verified, deployed and live-verified work.
- A Worker acknowledgement is not an applied absence, published allocation or delivered notification. Preserve request identities, manual SMC work, peer arrangements, provider uncertainty and recovery history.
- Confirmed Stapler plans represent the intended timetable independently of the baseline. Preserve current allocator rules and privacy boundaries; venue projections contain only permitted occupancy and necessary display names.
- Keep production and administrator-only rehearsal paths separate. Preserve existing settings, resource bindings and credentials; examples are not replacement configuration.
- Run relevant checks using `TZ=Asia/Singapore`. State which checks actually ran and any excluded historical comparisons. Keep failed evidence when it materially explains a release correction; never turn missing comparison inputs into a claimed pass.
- Package current source, build/test dependencies, essential comparison fixtures and concise handover history. Prune redundant delivery material with an auditable index; this does not authorize deleting live Google/D1/R2 records or Git history.

Apply the user's latest instructions and actual session authorization. Do not send notifications, change live school records or enable a production authority handover merely to test a locally prepared release.

## Shared model coordination

Three models work here: Codex and Muse build, Claude coordinates jobs and lanes and reviews (see `docs/coordination/LANES.md`; entry files `CLAUDE.md`). Before editing, read `docs/coordination/WORKFLOW.md`, `docs/coordination/LANES.md` and `docs/coordination/STATUS.md`. Work only in your assigned lane. Claim a bounded task using `docs/coordination/TASK_TEMPLATE.md`. One implementer owns each task/branch; Claude reviews the exact head commit (Codex may review Claude's own PRs). Check GitHub for active work before changing shared or generated files. Record handoffs in the repository, not only in chat. Follow the workflow's claim-only exception; implementation changes use pull requests. Human release approval and existing production restrictions remain in force.
