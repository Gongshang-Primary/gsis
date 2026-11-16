# v1-contacts-lifecycle-design

- Status: documentation claimed; settled owner decisions being specified, four follow-up policy questions pending. No product implementation.
- Owner/model: Codex. Coordinator: ChatGPT v1. Independent reviewer: Claude, exact document head; review not yet performed.
- Updated: 16 November 2026, Asia/Singapore.
- Refreshed main/base: `08791559faf91aeb3307f655a199ed0b2d420580`.
- Working branch: `codex/v1-contacts-lifecycle-design`.
- Owner instruction: define Contacts as sequentially updated records and partial working drafts; record the clarified Contacts/Deploy/Roster lifecycle in a Markdown document **on main**, and ask remaining policy questions. This explicitly authorises publishing this documentation to main; it does not authorise product changes, merging unrelated PRs, deployment, migration, live data or provider activity.

## Exact documentation scope

1. `docs/coordination/tasks/v1-contacts-lifecycle-design.md`
2. `docs/v1/contacts/CONTACTS_LIFECYCLE_DESIGN.md`

The claim-only commit lands first through a non-force expected-head update. The documentation commit then uses the owner's specific instruction to publish the design on main. Preserve all existing source/specification/history files. Do not edit `OWNER_DIRECTIVES.md`, which is in open PR183's scope; the new design explicitly identifies its supersession of older Contacts-master precedence wording and is linked from this discoverable task record.

## Refreshed ownership and source evidence

Open PR182 at `592fac9982b8935b1d14b8bbff500a1af78aa2c7` is the separate v0.9 hotfix. PR183 at `9d6db12edf510a34a19516e901e9fb9531b703e4` is the Roster workload-copy correction, approved by Claude on main; PR184 at `688e2aef42f3c552645cd7e1d65df1b5b410d9fa` is the separate Google backup design. Actual complete file inventories were checked; neither claimed path overlaps any of them. No implementation/review branch is changed by this task.

Read the current root/v1 instructions, workflow, lanes, status, owner directives and deployment/README guidance. Relevant sources are `docs/v1/contacts/DIRECT_AUTHORITY_CODEX_JOB_2026-11-15.md`, `docs/v1/contacts/EO_AUTHORITY_READINESS_PLAN.md`, `v1/services/contacts/grid-projection.mjs`, `v1/services/contacts/contributions.mjs`, `v1/services/deploy/model.mjs`, `roster-update/public/roster-operations-ui.js` and `shared/roster-operations.js`. The old direct-authoring job forbids Deploy publishing over Contacts facts; the owner's current instruction supersedes that ordinary-data precedence rule. Existing identity/permission safeguards are not silently redesigned here.

## Deliverable and questions

Record separately: confirmed owner rules; engineering consequences/recommendations; unresolved policy decisions; acceptance scenarios not yet executed. Preserve stable IDs, timestamped name precedence, Deploy publication's tag/Active precedence, immediate effect, the shared TTb namespace, partial drafts, and dated use of inactive teachers. Do not interpret publication/copy time as a fresh name edit. Record Roster's mobile requirement and Deploy's lack of that prerequisite.

Ask the owner to define the exact deployment-tag fields, which name fields use latest-change precedence, whether Roster can correct existing mobile numbers into Contacts, and the long-term Active flag for a newly created ad hoc teacher. Do not reopen immediate publication timing or missing-mobile permission: the owner has answered those.

## Verification and handoff

Check Markdown links, exact path scope, whitespace, preservation of existing tracked files and remote main after publication. No application tests, build, hosted UAT or implementation claims are appropriate for this prose-only task; list actual checks in the final record. No skill package is executed or vendored. Repository ownership, recovery and explicit-evidence principles apply.

Future implementation needs its own exact scope after the relevant questions are settled. Claude's review of this document remains separate from approval of the earlier product contracts. F5 OPEN; official T1B-01/T1B-02 and hosted/runtime UAT Not tested. No product PR merge, deployment, database migration or live data access in this task.
