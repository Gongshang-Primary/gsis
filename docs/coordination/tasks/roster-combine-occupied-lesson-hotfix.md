# Combine an occupied teaching lesson

- Model: Codex
- Status: implemented; full local suite and CI verification pending
- Updated (Asia/Singapore): 2026-11-17
- Branch: codex/roster-absence-clash-confirm; existing owner hotfix PR #182
- Base: 412064dba00dab583cc8bb76b2ee04f489c297d8
- Owner request: Roster must allow Combine with a teacher who has an existing class; ordinary relief still requires a blank period. Issue a hotfix. The owner waived Claude review for v0.9 hotfixes. Owner merges/deploys; no v1 work.
- Scope: the canonical combination-base predicate and same-class identity checks used by browser and D1, associated UI/D1 regression tests, generated source copies/bundles/parity references and deployment notes. Keep ordinary-relief eligibility, attendance, staff permissions, protected decisions, receipts and the one-additional-class limit.
- No live reads of school records, provider calls, settings changes, migrations, deletions, automatic allocation changes or deployment. No Google fallback implementation or Apps Script upload is part of the fix. Canonical generated backends may change when their shared domain source is regenerated; they are not deploy files for this hotfix.

## Evidence and root cause

The existing UI sends `combine` correctly and ordinary class-labelled combinations already succeed. A synthetic reproduction using the actual D1 domain, revision policy and SQLite-backed mutation path rejects a timetabled lesson with subject and venue but an empty class label: ordinary availability is correctly false, while `isClassLesson` incorrectly yields no combination base. This matches the visible activity/venue case in the owner's screenshot; no live records were accessed to infer hidden fields.

Allow an occupied instructional subject without requiring a class label. Continue excluding blank periods and the existing explicit PD/BLK/BLOCK/IMP/duty blocks. Blank class labels must never compare as the same class; otherwise an unrelated additional class could evade the existing cap. Use the same predicate for manual and colleague-request Combine. Retain original lesson contents and charge zero R for a combination.

## Acceptance

- Named-class and subject-only occupied lessons permit Combine; ordinary Assign rejects both as occupied.
- A blank period permits ordinary relief and cannot act as a combination base. Non-teaching blocks, absence/inactivity and identity conflicts remain excluded.
- Existing lesson contents survive combine, save, reload and publication; the combined assignment costs zero R.
- An empty class label never grants same-class exemption; an unrelated second combined class remains rejected. Existing named same-class behavior remains covered.
- UI stages and saves Combine for the formerly rejected lesson. D1 command replay applies once; stale/changed timetable validation and denied-access checks remain.
- Canonical build leaves no diff; full local v0.9 Node/LORD suite and all-five-job CI pass at the final head. Owner package contains both Worker scripts and Roster frontend ZIP, checksums and deploy/rollback instructions.

## Verification

- Eight domain groups, three real-DOM cases and two generated D1/SQLite cases pass. Twelve targeted regression programs pass, including existing manual Combine, colleague candidates, UI, ad hoc and D1 checks.
- The new domain test fails on the previous predicate, the generated D1 test fails before regeneration, and the real-DOM test fails on previous head 412064d because Combine is disabled for the activity.
- D1 test injects deterministic authority/timetable context while exercising the actual generated domain, prepared policy, broad state loading, atomic SQLite CAS, exact replay, stale-revision rejection and denied-access handling. It does not claim a live or full HTTP integration check.
- Shared canonical allocation/operations sources feed both frontend and D1 and their generated Google bundles. Only generated parity/source references changed; all 273 operations and probe outcomes remain unchanged. The owner deploys only both Worker scripts and frontend ZIP. No Apps Script deployment is required.
- Full local v0.9 Node/LORD and exact-head CI results belong in PR #182 and the package verification record. Earlier green results do not cover this extension. No live data, provider delivery, production deployment or v1 implementation is tested.
