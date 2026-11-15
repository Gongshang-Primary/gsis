# v1 PR #176 review (Contacts direct editing), Claude

Project: **v1**. Model: Claude. Reviewed 15 Nov 2026 (Asia/Singapore). Advisory; the owner merges.

| PR | Head | Base | Size | Verdict |
|---|---|---|---|---|
| #176 Contacts direct editing, history and signatures | `5e44fdf` | `db63a0e` | 40 files, +8,759/−3,259, 14 commits | **Approve**, with two conditions before deployment (C-1, C-2) |

## Method and its limit

Risk-based review. I read every server-side change that touches permission, authority, identity and concurrency guards, and listed every removed guard line. I ran the full product suite at the exact head. I did not read every line of the new browser editor (`contacts-ui.js`, 1,189 lines changed) or of the new tests.

## Evidence I produced

Worktree at `5e44fdf`, `npm ci` (root and `v1/`), `TZ=Asia/Singapore`, Node 22:

1. `node scripts/v1/test.mjs`: 65 of 97 passed on the first run. All 32 failures were browser programs that could not find Chromium in my environment. Rerun of those 32 with `GSIS_BROWSER_EXECUTABLE` set: **32 of 32 pass. Total 97 of 97.**
2. Scope: all 40 changed paths are v1-only (`v1/`, `tests/v1-*`, `scripts/v1/`, `docs/v1/`, the v1 task record).
3. Privacy (public repository): added email and phone-like strings are synthetic (`example.invalid`, `81234567`, bare domain names). No owner or staff names.

Not verified by me: CI at this head, canonical build drift, behaviour on the hosted site, any live conversion. I ran on Node 22; the package asks for Node 24.15 or later.

## Guards checked

1. **Authority stays separate.** Ordinary writes that contain `smc`, `eo` or `schoolLeader` are rejected (`AUTHORITY_ACCEPTANCE_REQUIRED`), for create, update and the grid. The grid schema has no authority column.
2. **No self-acceptance.** Acceptance requires a linked actor Staff ID that differs from the target, and an owner review reference.
3. **Capability checks kept.** Grid save needs `contacts.manage` or `admin`. Self-service is limited to own record and to statutory name and mobile.
4. **Derived name protected.** A caller cannot supply TTb Name.
5. **Removed guard lines are accounted for.** The `CAPABILITY_DENIED` and `sourceChangeGuard` lines removed from `catalogues.mjs` belonged to the retired catalogue write route, which is gone from `policy()`. The per-staff `sourceChangeGuard` in `grid.mjs` is replaced by one set-based guard over all affected Staff IDs in the same transaction, plus the same held-pin check and cancellation request. Same protection.
6. **Identity check improved.** The duplicate check now compares the qualified name (TTb Name) and not the basic name. Two people with one basic name and different modifiers can now be created. This fixes the RUN-B-021 class.
7. **Content is open.** The 11 formerly catalogue-bound fields accept bounded free text. No catalogue setup is needed. This matches the owner's 15 Nov validation rule.

No permission was loosened.

## Conditions before deployment

### C-1 (medium, data): Memberships are no longer derived from Role anywhere

v0.9 derived each person's groups (SL, SC, SMC, KP, TL, SDT, CMT, SAT, Support, MK) from the role table. This PR removes the last such path (`roleCatalogue` in the Deploy screen) and Deploy's `membership` is now always empty. Groups come only from each person's own Memberships field. That follows the approved job. But Run B migrated 17 fields per person and Memberships was not one of them. If the field is empty for the 182 migrated staff, every Deploy feature that reads groups will see none after this ships.

Before deployment: fill Memberships for current staff from the v0.9 role table, as an owner-authorised data step, and check one KP and one non-KP teacher in Deploy. I did not trace which Deploy calculations read groups; treat the effect as unproven but likely.

### C-2 (medium, rollback): the stored format is one-way

New writes use value schema 2. The contract says older builds cannot read it. A code rollback after the first direct save needs a Contacts write freeze and a restore. Take a Contacts D1 backup immediately before deployment and record it.

## Findings for follow-up (not blocking)

### F-1 (medium): Deploy staff registration rejects tags outside a fixed list

`/internal/register-provisional` accepts only six employment tags and four subject tags (`service.mjs`, near line 871). Any other tag returns 409 `CONTACTS_FIELD_REVIEW_REQUIRED`. Run B records a real subject modifier that is not on the list. This conflicts with the owner's 15 Nov rule (accept, store and flag). The rule was recorded after this claim, so fix it in the validation job, not here.

### F-2 (low, owner decision): duplicate qualified names are rejected, inactive staff included

The uniqueness check runs against every row in `contacts_staff`, active or not. A former staff member's name blocks a new person with the same qualified name. Under the 15 Nov rule a duplicate display name is flagged, not rejected. TTb Name is also the timetable matching key, so a reject among active staff is defensible. Owner to choose; at minimum exclude inactive staff.

### F-3 (low, direction): the build patch layer still grows

`scripts/v1/build-web.mjs` gains 80 lines. The editor logic itself moved into the v1-owned `contacts-ui.js`, which is the right direction and answers the earlier F-1 for Contacts.

## Merge order

After #175. This PR's base is a review base, not main: retarget to main after the stack lands, check the resulting diff, and rerun the suite at that head.
