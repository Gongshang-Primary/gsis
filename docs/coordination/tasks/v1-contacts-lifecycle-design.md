# v1-contacts-lifecycle-design

- Status: owner specification complete, all six clarification questions answered; documentation published with this commit under the owner's direct-main instruction. Claude exact-head review pending; no product implementation.
- Owner/model: Codex. Coordinator: ChatGPT v1. Independent reviewer: Claude, exact document head; review not yet performed.
- Updated: 16 November 2026, Asia/Singapore.
- Refreshed main/base: `08791559faf91aeb3307f655a199ed0b2d420580`.
- Publication parent after a documentation-only main refresh: `8bfd315f9cb7b1893e73cc24c7d2a70ea3f14b2d`.
- Working branch: `codex/v1-contacts-lifecycle-design`.
- Owner instruction: define Contacts as sequentially updated records and partial working drafts; record the clarified Contacts/Deploy/Roster lifecycle in a Markdown document **on main**, and ask remaining policy questions. This explicitly authorises publishing this documentation to main; it does not authorise product changes, merging unrelated PRs, deployment, migration, live data or provider activity.

## Exact documentation scope

1. `docs/coordination/tasks/v1-contacts-lifecycle-design.md`
2. `docs/v1/contacts/CONTACTS_LIFECYCLE_DESIGN.md`

The claim-only commit landed on main first as `3c80c023bb46eb565b62e2052416f78de4a48b8c` through a non-force expected-head update. The documentation commit uses the owner's specific instruction to publish the design on main. Preserve all existing source/specification/history files. Do not edit `OWNER_DIRECTIVES.md`, which is in open PR183's scope; the new design explicitly identifies its supersession of older Contacts-master precedence wording and is linked from this discoverable task record.

## Refreshed ownership and source evidence

Open PR182 at `592fac9982b8935b1d14b8bbff500a1af78aa2c7` is the separate v0.9 hotfix. PR183 at `9d6db12edf510a34a19516e901e9fb9531b703e4` is the Roster workload-copy correction; PR184 at `688e2aef42f3c552645cd7e1d65df1b5b410d9fa` is the separate Google backup design. Actual complete file inventories were checked; neither claimed path overlaps any of them. Claude's newer review on main at `8bfd315` approves PR183's code with separate O-1/O-2 owner gates and PR184 as a document. Those PRs and gates are not changed by this task. No implementation/review branch is changed.

Read the current root/v1 instructions, workflow, lanes, status, owner directives and deployment/README guidance. Relevant sources are `docs/v1/contacts/DIRECT_AUTHORITY_CODEX_JOB_2026-11-15.md`, `docs/v1/contacts/EO_AUTHORITY_READINESS_PLAN.md`, `v1/services/contacts/grid-projection.mjs`, `v1/services/contacts/contributions.mjs`, `v1/services/deploy/model.mjs`, `roster-update/public/roster-operations-ui.js` and `shared/roster-operations.js`. The old direct-authoring job forbids Deploy publishing over Contacts facts; the owner's current instruction supersedes that ordinary-data precedence rule. Existing identity/permission safeguards are not silently redesigned here.

## Deliverable and owner answers

The [Contacts lifecycle design](../../v1/contacts/CONTACTS_LIFECYCLE_DESIGN.md) separates confirmed owner rules from engineering consequences and unexecuted acceptance scenarios. It preserves stable IDs, actual-edit name timestamps, Deploy publication's tag/Active precedence, immediate effect, the shared TTb namespace, partial drafts and dated use of inactive teachers. Copy/read/publication time is not a fresh name edit. Roster requires mobile; Deploy does not.

All clarification questions are settled by the owner on 16 November:

- All eleven enumerated fields are deployment tags; a stored published blank clears the corresponding Contacts value. An omitted save field is not a clear.
- Only Basic Name uses latest actual edit precedence. Statutory Name is edited in Contacts. Contacts and each Deploy version derive their own TTb Name from their own inputs.
- Planner notes are Deploy-only unstructured notes, with no use elsewhere.
- The latest explicit permitted Roster mobile edit updates Contacts.
- New Roster ad hoc people default to long-term Active = No, with selected-day/period activation. New Deploy teachers default to Active = Yes.

No remaining owner questions for this design. No product implementation scope is opened by the documentation.

## Verification and handoff

Documentation checks passed: 9 relative links resolve, exactly the two allowlisted paths differ from the publication parent, the design contains C01–C16 exactly once, obsolete pending-question text is absent, and whitespace is clean. The design is new; the earlier claim is updated. All other existing files, application behavior, tests, CI, configuration, dependencies and generated outputs remain unchanged. Refreshed open PR182/183/184 heads and complete file inventories were unchanged and disjoint.

The initial expected-head check stopped publication before committing/pushing because main advanced from the accepted claim `3c80c02` to `8bfd315f9cb7b1893e73cc24c7d2a70ea3f14b2d`. The only intervening change was Claude's new review record. Inspected that record, fast-forwarded without conflicts or edits to it, and repeated documentation checks against the new publication parent. No force-push or unrelated merge was used.

Reproducible checks, from the repository root, using `TZ=Asia/Singapore`:

```bash
TZ=Asia/Singapore python3 - <<'PY'
from pathlib import Path
import re, subprocess
paths = ['docs/coordination/tasks/v1-contacts-lifecycle-design.md',
         'docs/v1/contacts/CONTACTS_LIFECYCLE_DESIGN.md']
links = 0
for name in paths:
    source = Path(name)
    for target in re.findall(r'\]\(([^)]+)\)', source.read_text()):
        if '://' in target or target.startswith('#'):
            continue
        assert (source.parent / target.split('#', 1)[0]).resolve().exists(), target
        links += 1
changed = subprocess.check_output(['git', 'diff', '--name-only',
    '8bfd315f9cb7b1893e73cc24c7d2a70ea3f14b2d'], text=True).splitlines()
assert set(changed) == set(paths), changed
design = Path(paths[1]).read_text()
assert re.findall(r'^\| (C\d{2}) \|', design, re.M) == [f'C{i:02d}' for i in range(1, 17)]
assert 'Remaining owner questions' not in design and 'after Q' not in design
print(f'PASS: {links} relative links; two approved paths; C01-C16; no pending questions.')
PY
TZ=Asia/Singapore git diff --check 8bfd315f9cb7b1893e73cc24c7d2a70ea3f14b2d
TZ=Asia/Singapore git diff --name-status 8bfd315f9cb7b1893e73cc24c7d2a70ea3f14b2d
```

Run after staging the new document or from its committed head so Git includes it. The final two commands pass and list the modified task record and added design document. Content inspection reconciled all six answers with the field matrix and scenarios, preserving omitted-field semantics, stable identity, immediate publication and the security/data distinction. No personal records or credentials were added.

No build, Node/LORD/product regression, browser or hosted tests were run for this documentation-only publication; no implementation verification is claimed. CI is not used as evidence of the proposed behavior. No external skill package was executed or vendored; the repository's ownership, recovery and evidence principles were applied directly.

| Gate | Documentation result |
| --- | --- |
| Q01 | Pass: explicit owner instruction, accepted claim, exact two-path scope and refreshed overlap check. |
| Q02 | Pass for design: field/transition precedence, partial drafts and stable identity specified. Current owner decisions supersede older all-fields Contacts-master wording. |
| Q03 | Pass for documented boundary: no permission inference or live data; security enforcement stays separate from minimum profile data. Runtime enforcement is not tested here. |
| Q04 | Pass for design: actual-edit timestamps, durable IDs, recovery, publication ordering and no cross-D1 atomicity claim. Implementation evidence remains pending. |
| Q05 | Pass: two documents, no dependencies, new framework or skill copying. Implementation resource bounds need their own scoped work. |
| Q06 | Pass for documentation checks above; implementation scenarios C01–C16, build/regressions and runtime UAT not run. |
| Q07 | Pending: Claude independently reviews the exact document commit. Direct-main publication is specifically owner-authorised; it is not a claim of reviewer approval. The commit containing this final record identifies the reviewed artifact without a self-referential hash. |
| Q08 | Not applicable to deployment: no runtime, configuration, provider or storage change. |

Rollback is a documentation correction/revert only; it does not alter data or revert an implemented feature. The owner decisions remain in the history. Publishing this document does not authorise product implementation; the next step is Claude's exact-head design review and then a bounded implementation scope.

Future implementation needs its own exact scope; all current owner questions are settled. Claude's review of this document remains separate from approval of the earlier product contracts. F5 OPEN; official T1B-01/T1B-02 and hosted/runtime UAT Not tested. No product PR merge, deployment, database migration or live data access in this task.
