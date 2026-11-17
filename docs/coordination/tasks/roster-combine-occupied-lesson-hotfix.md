# Combine an occupied teaching lesson

- Model: Codex
- Status: implementing
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

Pending. Earlier CI and test counts cover the previous memory hotfix head only.
