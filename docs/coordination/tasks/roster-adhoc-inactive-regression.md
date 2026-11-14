# roster-adhoc-inactive-regression: Activated ad hoc relief teachers are blocked as "inactive" (HOTFIX)

- Status: proposed (URGENT HOTFIX; needed before Mon 16 Nov 07:00 SGT)
- Owner/model: Codex
- Reviewer/model: Muse (owner may name Claude for speed)
- Last updated (Asia/Singapore): 2026-11-14 ~23:30
- Branch: codex/roster-adhoc-inactive-regression
- Base SHA: current main (889669a or later). Lane R: this jumps the queue.
- User-authorised scope: owner, 14 Nov ("urgent bug fix. dig deep to investigate. planning for 16 nov relief. we have many adhoc relief. but cannot manually assign them (do not turn up in search), auto also cannot. urgent.")

## Diagnosis (Claude, read-only D1 + code, 14 Nov)
- 16 Nov has 6 ad hoc activations in D1 (`adhoc`, all periods P0-P16): Chai (FAJT), Seow Yann (FAJT), Fue Yan (FAJT), Mai Ling (FAJT), Sheila (SRE), Mawar (SRE). 17 and 18 Nov have more. The records are correct.
- All of them are `active:false` in Contacts (`roster-references` / `key:rosterPeople`, Contacts sheet `Active`=N). This is **by design**: Roster's "Manage ad hoc relief → add person" creates the Contacts row with `Active:'N'` (backend/Contacts_Code_with_Deploy_API.gs:381). Ad hoc teachers are inactive staff who become available only on the dates and periods of an ad hoc activation.
- Before 13 Nov this worked. On 12 Nov 22:59 auto-allocate gave 16 Nov drafts to Seow Yann, and on 13 Nov Chai, Mai Ling and Suraya had 8 published duties each.
- **Regression: PR #38 "inactive staff safeguards"** (rebased backlog, merged 13 Nov as 05ff0f1, source 22e6bd8), deployed in **v0.9.9x**. It replaced every "active, or activated ad hoc for this date" check with a plain `active===true`:
  1. `candidates()` (manual search list): `p.active||s.adhoc.some(...)` → `activeReliefCandidate(p)`, so ad hoc teachers vanish from Find a teacher / Assign Teacher.
  2. Manual assign / mutual choice: `staff()` → `activeStaff()`, which fails 403 "Teacher is inactive in Contacts."
  3. Auto-allocate: `eligibility()` adds "Teacher is inactive in Contacts." for `person.active!==true`, with no ad hoc exception, so every period fails. This shows as "received no relief: not available that period".
  4. WhatsApp `queue()`: `if(p?.active!==true&&!personal)return;` silently drops duty messages to ad hoc teachers, even for published duties.
  5. Daily report `externalTeachers`: filter flipped from `active===false` to `active===true`, so ad hoc (external) teachers drop out of the report and export.
  6. Shared-lesson `sharedPresentIds` and the reconcile pass mark retained ad hoc duties "Teacher is inactive in Contacts. Review this retained duty."
- The UI chips "(inactive)" come from `staffName()` and are cosmetic; the blocks above are the real failures.

## Required behaviour
Define one helper and use it everywhere #38 added an `active===true` gate on relief:
`reliefActive(s, ctx, person, date, period?)` is true when `person.active===true`, **or** a non-deleted `adhoc` row exists for that person (alias-aware via `samePerson`) on `date` (and, when `period` is given, covering that period).
1. Manual search (`candidates`) lists activated ad hoc teachers for that date, as before #38.
2. Manual assign, combine and mutual choice accept an activated ad hoc teacher for that date and period. They still reject a truly inactive teacher with no activation (keep #38's safeguard for that case).
3. Auto-allocate treats activated ad hoc teachers as eligible within their activated periods (priority 1 as per #84). `employmentPeriodRestrictions` still apply as before.
4. WhatsApp duty messages queue for an ad hoc teacher who has an activation on the duty's date. Messages to a truly inactive person stay suppressed.
5. `externalTeachers` lists activated ad hoc teachers who are inactive in Contacts (restore `active===false` plus the activation).
6. Reconcile/shared-lesson checks do not flag a duty held by an activated ad hoc teacher on that date.
7. Label: show "(ad hoc)" instead of "(inactive)" for a person with an activation on the viewed date. Cosmetic, but SMCs read it as "unavailable".
8. Audit every other `active===true` / `activeStaff` / `activeReliefCandidate` use added by #38 (`git show 22e6bd8`) and state for each whether the ad hoc exception applies (e.g. name bridges and employment-report recipients: no; relief paths: yes).

## Out of scope
Changing Contacts data or the `Active:'N'` creation rule; allocation rules; any live data, settings, merge or deploy.

## Acceptance checks
1. Test (fails on current main): an inactive person with an ad hoc row for date D appears in manual candidates for D and can be manually assigned in an activated period. The same person on another date without activation is rejected with "Teacher is inactive in Contacts."
2. Test: auto-allocate assigns an activated inactive ad hoc teacher (priority 1) and the run log no longer says "not available that period" for them.
3. Test: publishing a duty to an activated ad hoc teacher queues their WhatsApp. A truly inactive teacher with no activation queues nothing.
4. Test: the daily report `externalTeachers` lists the activated ad hoc teacher.
5. Test: a retained duty for an activated ad hoc teacher is not marked "inactive, review".
6. Regression: all #38 tests still pass for truly inactive staff.
7. Canonical build no diff; full suite; full CI; draft PR at exact head; DEPLOY_STEPS for a hotfix release on top of x (Roster Pages + both Workers; no backend change unless `RosterOperations.gs` mirrors it).

## Owner workaround until the hotfix is deployed
In Contacts, set **Active = Y** for the ad hoc teachers needed on 16 Nov (Chai, Seow Yann, Fue Yan, Mai Ling, Sheila, Mawar). Wait for the references refresh (a few minutes), hard refresh Assign Relief, then Auto-allocate. Side effects while active: they can appear in manual search on other days and in colleague lists. Set them back to N after the hotfix is live.

## Decisions and changes
- 14 Nov: diagnosed by Claude (read-only). No live change made.

## Verification

## Review
