# v1-venue-allocation-lifecycle-design

- Status: owner design documented; publication to main uses the owner's explicit instruction. Five owner answers and the aSc pipeline correction incorporated; no implementation claim. Claude exact-head review pending.
- Owner/model: Codex. Coordinator: ChatGPT v1. Independent reviewer: Claude, exact document head.
- Updated: 16 November 2026, Asia/Singapore.
- Initial refreshed main: `d84a38ce907e7866f9331003ef4f26bb5a08851f`. Expected-head check detected an intervening documentation-only review update before any claim commit. Inspected it and fast-forwarded to claim base `47b2d2c5da3d2cbb551259b44e2aa7536a2f79f9`.
- Branch after the accepted claim: `codex/v1-venue-allocation-lifecycle-design`.
- Accepted claim: `df5335b732e9d97cb47d93b447f8b674ee1a6115`; published alone to main, then reread before authoring. Document head: the commit containing this update, to avoid a self-referential hash.
- Owner instruction: specify the split-timetable-room and Deploy/Venues/Layout allocation lifecycle in a Markdown document **on main**, asking genuine workflow/policy questions. This authorises this design record on main, not implementation, unrelated merges, deployment, migration or live-data operations.

## Exact documentation scope

1. `docs/coordination/tasks/v1-venue-allocation-lifecycle-design.md`
2. `docs/v1/venues/VENUE_ALLOCATION_LIFECYCLE_DESIGN.md`

Publish this task record alone as the claim using a non-force expected-head main update; start the documentation branch from the accepted claim. The owner's direct-main documentation instruction is the scoped exception to the normal implementation PR route. Preserve existing specifications as history and state any new supersession explicitly in the new design. Do not change `OWNER_DIRECTIVES.md`, owned by open PR183.

## Refreshed scope and evidence

Fetched main and all remote heads; read root/v1 instructions, coordination, engineering policy and relevant source/reviews. Actual open-PR file inventories were checked: PR182 `592fac9982b8935b1d14b8bbff500a1af78aa2c7` (v0.9 absence hotfix), PR183 `9d6db12edf510a34a19516e901e9fb9531b703e4` (Roster workload copy), PR184 `720fe385adaabde05fe2908c0fcf2968a3861d90` (direct Drive backup design). Neither claimed path overlaps them. Existing venue-publication/import implementation claims are not reopened. Main's latest addition is Claude's Contacts/backup review; it changes documentation only.

Read-only source scope: `v1/services/deploy/service.mjs`, `v1/services/roster/service.mjs`, `v1/services/venues/domain.mjs`, `v1/services/venues/service.mjs`, `v1/services/venues/projection.mjs`, `v1/services/layout/publication.mjs`, `shared/venues.js`, relevant v0.9 frontend aliases and accelerated-delivery requirements. Static source findings are not behavioural test results.

## Deliverable and acceptance

Record the owner's confirmed version ownership and local-copy rules, split labels versus physical rooms, dated occupancy provenance, immutable publication and app-owned overlay boundaries. Separate engineering recommendations from unresolved owner choices. Preserve current identity, capability, revision, audit and recovery safeguards. Do not claim atomic transactions across D1 databases or fabricate occupancy from a planning-room reference.

Owner answers: ISH-1A/B are two interchangeable class slots in one physical venue; offer one-slot and whole-venue bookings, default whole; Deploy publication replaces its allocation set immediately for all dates; retain existing bookings and flag new conflicts; baseline import updates Venues/Layout immediately. The owner then clarified that Deploy must not be tightly coupled to Venues: Deploy informs aSc, aSc exports the timetable, and Venues/Roster consume that export. Do not require a matching Deploy publication, attachment to a Deploy draft, or another Publish/Republish to activate an import. Keep planning allocations and imported timed occupancy distinct.

Acceptance checks: exact two-path documentation inventory; relative links; whitespace; confirmed/pending wording; synthetic future acceptance cases; no application/test/build/CI/configuration/generated changes. Record exact commands and outcome after authoring. Build, product/Node/LORD suites, hosted UAT and live recovery are not run by this design task. F5 remains **OPEN**; official T1B-01/T1B-02 and runtime UAT remain **Not tested**.

## Handoff

The [venue allocation lifecycle design](../../v1/venues/VENUE_ALLOCATION_LIFECYCLE_DESIGN.md) records the owner's answers and final correction. Deploy informs aSc; imported aSc timetable data reaches Roster, Venues and Layout without a matching Deploy publication, Deploy availability or a subsequent republish. Consumers retain separate planning and timed snapshots plus local overlays. ISH-1 has two interchangeable class slots; offer one-slot/whole-venue bookings, default whole. Keep existing bookings and flag new conflicts. Deploy's active planning copy changes immediately regardless of its term label, without erasing independent imported occupancy.

Source inspection identified the existing room/start/end occupancy deduplication and Boolean venue conflict/displacement logic as implementation work to reproduce and change. These are static findings, not executed behavioural reproductions. The document supplies V01–V22, all **Not tested**. No owner question remains; future implementation still requires bounded claims and Claude review.

No skill package executed or vendored; applied the repository's ownership, simplicity and evidence principles directly. No product behavior, other active claims, provider credentials or live school data are changed. Revert this documentation commit to withdraw the design text; doing so would not undo an owner decision or change runtime data.

## Verification

Actual documentation checks: five local links resolve; exactly the two approved files differ from the accepted claim; V01–V22 occur once each and remain **Not tested**; whitespace check passes. Read the final wording against all owner answers, including the correction that baseline import must not be gated on Deploy. No application, test, workflow, build, configuration, dependency or generated path changed.

Reproduce from the repository root at the document commit:

```bash
TZ=Asia/Singapore python3 - <<'PY'
from pathlib import Path
import re, subprocess
paths = ['docs/coordination/tasks/v1-venue-allocation-lifecycle-design.md',
         'docs/v1/venues/VENUE_ALLOCATION_LIFECYCLE_DESIGN.md']
links = 0
for name in paths:
    source = Path(name)
    for target in re.findall(r'\]\(([^)]+)\)', source.read_text()):
        if '://' in target or target.startswith('#'):
            continue
        assert (source.parent / target.split('#', 1)[0]).resolve().is_file(), target
        links += 1
changed = subprocess.check_output(['git', 'diff', '--name-only',
    'df5335b732e9d97cb47d93b447f8b674ee1a6115'], text=True).splitlines()
assert set(changed) == set(paths), changed
spec = Path(paths[1]).read_text()
assert re.findall(r'^\| (V\d{2}) \|', spec, re.M) == [f'V{i:02d}' for i in range(1, 23)]
for row in spec.splitlines():
    if re.match(r'^\| V\d{2} \|', row):
        assert row.endswith('| Not tested |'), row
print(f'PASS: {links} relative links; two approved paths; V01-V22 all Not tested.')
PY
TZ=Asia/Singapore git diff --check df5335b732e9d97cb47d93b447f8b674ee1a6115
TZ=Asia/Singapore git diff --name-status df5335b732e9d97cb47d93b447f8b674ee1a6115
```

Run against the staged working tree and committed head; staging is needed for the new document to appear in the working-tree diff. No build, Node/LORD/product suite, browser/Worker/D1 test, provider activity, live read or hosted check ran for this documentation-only task. CI, if triggered, does not prove the proposed behaviour. No implementation or deployment is claimed.

| Gate | Documentation evidence |
| --- | --- |
| Q01 | Pass: owner-authorised main documentation, accepted claim, refreshed disjoint open-PR file inventories, exact two-path scope. |
| Q02 | Pass for design: independent planning/timed source ownership, local copies, immutable editions and overlays. |
| Q03 | Pass for documented boundaries: no authority weakening, staff records, credentials or live data; runtime not tested. |
| Q04 | Pass for design: capacity-aware serialisation, idempotent adoption, retained conflicts and explicit cross-D1 delivery limits; implementation tests pending. |
| Q05 | Pass for design: reuse existing owner stores/import receipts; bounded projections and future measurement; no added dependency/framework. |
| Q06 | Pass for documentation checks; all proposed behaviour, build/regressions and hosted UAT untested by this task. |
| Q07 | Pending: Claude independent review of the exact document head. Owner's direct-main instruction permits publishing this record before that review. |
| Q08 | Not applicable to deployment: no implementation, migration, activation or release; runtime UAT remains Not tested. |
