# roster-reoptimise-priority-adhoc: Auto-allocate must re-plan unpublished automatic relief so ad hoc/daily SRE priority applies

- Status: PR #84 rebased onto main v0.9.9n; canonical build and focused checks passed; final-head CI and Claude review pending; lane R.
- Reviewer/model: Claude. Related: roster-sre-daily-priority (PR #14, merged 30 Oct: daily/ad hoc SREs are priority 1 above annual R%).

## Owner report (verbatim)
"auto-allocate didn't reoptimse all unpublished allocation: evinced because I added an adhoc relief teacher but auto-allocate didn't give adhoc relief any periods"

## Evidence
6 Nov on D1: first Auto-allocate filled all periods (0 uncovered, 23:54). The owner then activated an ad hoc relief teacher and ran Auto-allocate again; the log says "Preparing to reoptimise blanks and unpublished automatic assignments" and "Allocation draft saved", but the ad hoc teacher received no periods.

## Likely cause (to confirm in code)
The reoptimise accepts a new plan only if it improves coverage or the R% fairness score (optimisationRuns record `reason: "higher coverage"`, `fairness.before/after`). With coverage already 100% and SREs excluded from R% fairness, moving lessons to the ad hoc teacher never counts as an improvement, so the existing draft stays. Priority 1 (PR #14) then only affects blanks.

## Required
1. Reoptimise re-plans every unpublished, unstarted, automatic assignment for the date from scratch with the current ranking (daily SREs and any teacher explicitly activated ad hoc for the date with no baseline timetable first; then the existing order), and keeps the new plan when it is better on an ordered objective: (a) coverage, (b) use of priority-1 staff within their limits, (c) fairness, (d) fewest changes. Never move manual, peer, protected, Stapler-imported, published or started cells.
2. Activating or deactivating an ad hoc relief teacher marks the date "re-plan suggested" in Assign Relief (no automatic run).
3. The allocation log lists, for each priority-1 teacher who got no periods, the reason category (not available that period, restricted period, daily max reached, consecutive limit, activation window, no lessons to cover).
4. Tests: full coverage plan + newly activated ad hoc teacher → reoptimise gives them periods up to their limits; manual/published cells untouched; reasons logged when an SRE stays idle; Google and D1 parity.

## Claim
- Owner/model: Codex
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 2026-11-06, PR #84 rebase
- Branch: `codex/roster-reoptimise-priority-adhoc`
- Base SHA: `fabc1c8c9c00c8635770f7fc402fe9c174d43321` (requested specification `05bfa9c`)
- Integration base: current main `e7d4f028ec1f6db499b44f14c0fea798fec55eca`; original accepted claim `662ccfb692fd08fb8318829923ad76b6cd79f803`.
- Validated implementation and test head: `719e547b271b72193ec6caf0836a45d6dd42c3de`; the documentation-only handoff commit follows it. No remote branch or PR yet.
- Files/domains owned: lane R allocator and operations in `shared/roster-*.js`, Assign Relief frontend, Google/D1 adapters only as required, focused regressions, this task record and changelog; canonical generated Roster/Deploy backend and Worker copies.
- User-authorised scope: all four Required items above.
- Out of scope: backups/daily outputs, Deploy/Contacts catalogue sync, live allocation, deployment, authority/configuration changes and notification sends.
- Acceptance checks: full-coverage reoptimise adopts priority-1 staff within limits; protected/manual/peer/Stapler-imported/published/started assignments preserved; durable date notice after activation changes; truthful idle reason categories; Google/D1 parity; canonical build then full Node and LORD suites with TZ=Asia/Singapore.

## Coordination
Owner's new work instruction advances the same Codex builder to this task. PR #81 and PR #82 have merged. Their current main changes are integrated into this branch. This branch starts from the accepted claim on current main and does not modify the daily outputs branch. Muse's Deploy/Contacts task stays outside this allocator/Assign Relief scope. No other active Roster implementer claim was found in the refreshed GitHub state.

## Verification
Canonical build completed for all 18 production components. All 1,013 current Node programs are verified, including a targeted rerun of the corrected Stapler policy assertion, plus all 40 LORD programs. Focused allocation, UI and actual Google/D1 adapter checks pass. A fresh independent read-only Codex review found no additional product defect. Detailed evidence and the initial failed expectations are recorded below. Remote exact-head CI and Claude review remain pending publication.

## Deployment
Not deployed to staging or production.

## Handoff
Obtain explicit approval to publish after the earlier automatic upload rejection, then refresh main and the destination, upload this separate branch, run remote exact-head CI and open the draft PR for Claude. Owner merges and releases. Do not bypass the denied publication through a different transport.

## Implementation decisions (6 Nov, Model: Codex)
1. Confirm the actual objective before changing the solver. The starting code already rebuilds automatic drafts and accepts a better ordered preference score, including verified daily SRE priority. The simple complete-draft/newly-activated-SRE case already allocates that SRE. The proposed R%-only root cause is therefore not confirmed, and no live incident records were inspected.
2. Two reproducible gaps are fixed: recess-duty reuse previously preceded priority-1 use, and teacher-ID tie-breaking preceded draft stability. The flow and its complete-plan comparison now maximise coverage, then priority-1 periods, then retain the existing policy order, then minimise changed previous choices before deterministic ID ties. Daily and consecutive hard limits and verified SRE classification stay intact.
3. Activation/period changes and deactivation retain a date-local `replanPending` bit on the existing ad hoc record, including its tombstone. A successful full replan clears it; blanks-only, paused and failed runs do not. Actual activation changes bump the day revision, so other planners see the update. No automatic run starts on activation.
4. Compact idle evidence covers all six requested categories, including daily SREs with no eligible solver edges. It persists with the optimisation run even when verbose evidence is disabled. Google projects these messages with Assign Relief, avoiding a full-state read in the fast status poll; D1 also records them in its run log. Neither path performs a new provider call for the messages.
5. Regression coverage includes full coverage plus a new SRE, daily caps, recess-priority conflict, stable ties, SMC/peer/protected/Stapler/published/started cells, durable notices, all idle categories, actual Google adapter and D1 SQLite/reference-context parity, and same-request retry. The independent exhaustive policy oracle still validates the same non-SRE matching objective; its reported vector adds the explicit priority and stability coordinates.

The separate owner-authorised `roster-remove-why-capture` task remains a separate follow-up before release n. This task does not change the Allocation Audit TXT format or introduce Why capture. Muse's Stapler picker is confined to its assigned UI files.

## Resume corrections (6 November 2026, Model: Codex)

Recovered local implementation `63830b6` and integrated current main `90b2523`. Reproduced the three failed programs from the prior full run. The allocation-status path passes a receipt-only projection, so idle-log lookup now tolerates an absent optimisationRuns collection without loading full state. Two test expectations were updated to the specified objective: the added priority/stability coordinates and equal-score complete-plan permutations. Daytime coverage, protected started duty and improved fairness remain asserted. Actual Google/D1 parity and the independent exhaustive policy oracle pass. Full verification and advisory review follow.

## Advisory review corrections (6 November 2026, Model: Codex)

A separate advisory review identified three gaps. New regressions reproduced each before the corrections below, then passed after the canonical build. Claude's exact-head review remains required.

1. Stability now rewards retained prior choices, so dropping a previously covered demand also counts when comparing otherwise equal complete plans. A higher-coverage fixture proves the solver keeps the old choice when that is feasible at the same policy cost.
2. Idle reasons check the complete required lesson block. Daily and consecutive limits now explain an idle priority-1 teacher whose individual periods look eligible but whose indivisible block exceeds those limits.
3. Scheduled D1 runs retain their schedule key and append the same priority-1 idle messages as interactive runs. The real D1 fixture verifies both the stored log and the projected status lookup.

Focused verification passed: 14 priority regressions, actual Google/D1 adapter and scheduled-run parity, the independent exhaustive policy oracle, allocator coverage, 11 allocation-run checks and the anytime-search regression. All 18 production components rebuilt. Full suite verification follows on the committed implementation.

## Owner clarification during resume (6 November 2026)

The owner clarified that priority is not limited to SREs: any teacher activated ad hoc for the date who has no timetable in the baseline must receive first priority; their R% is effectively zero for this decision. This overrides the earlier SRE-only interpretation.

The confirmed code defect is the external-candidate gate: it previously excluded all activated ad hoc teachers unless `dailyRoster` classified them as verified daily SREs. Non-SRE activation therefore left a complete automatic draft unchanged. Six new regressions reproduced this exclusion before the fix; actual Google and D1 adapters now exercise a non-SRE with no baseline block as well as the original daily-SRE case. The earlier statement that the simple SRE case already worked remains true, but did not cover the owner's intended case. No live school records were inspected.

The shared allocator now grants `adhocPriority` from explicit activation plus absence of every linked identity from the verified baseline. A blank day, a compact projection or an alias with a baseline entry cannot create that priority. The ranking, solver capacity, manual candidate projection and idle messages all use this same classification. It bypasses the R quota for this activated availability and ranks ahead of ordinary R% preferences, without changing saved entitlements, completed relief counts or the teacher's employment type.

The configured ad hoc daily limit and consecutive limit apply. The separate optional non-SRE daily relief cap still applies to non-SRE teachers; a new regression caught and corrected an over-broad exemption. Activation windows, absences, peer reservations, employment-period restrictions and identity checks remain enforced. Candidate cards identify this priority without labelling the teacher an SRE. No automatic run starts on activation.

The previous implementation at `26b78d3` passed all 1,013 Node programs and all 40 LORD programs. That evidence predates this clarification. Fresh full verification is required on the extended implementation before handoff.

## Final verification and recovery (6 Nov 2026, Model: Codex)

The final identity correction gives priority to the explicitly activated Contact, not an older linked identity. Both FT and UT alias fixtures passed after first reproducing the wrong identity selection. Baseline membership is checked across linked identities; activation, Contacts exclusion, employment restrictions, weekly employment caps, daily limits and consecutive limits remain enforced. The saved relief history and entitlements do not change.

The previous workspace had lost the unpublished `63830b6` parent object. The recovered source was placed on verified current main `e7d4f028ec1f6db499b44f14c0fea798fec55eca` as `50fc5e3`; the earlier local tip remains at `archive/local-adhoc-before-history-recovery`. Exact historical commits and required blobs were restored from GitHub with matching object hashes for packaging and import-resume checks. Current main adds only a separate Deploy task document relative to the earlier integrated main.

Validation used `TZ=Asia/Singapore` and the installed Chromium runtime. All 18 components rebuilt. The complete 1,013-program Node inventory was checked without duplicate or omitted programs: shard 1 passed 254/254, shard 2 passed 253/253, the rerun of shard 3 passed 253/253, and shard 4 passed 252/253 before its obsolete Stapler manual-only expectation was corrected and rerun successfully (6/6 cases). The resulting 1,013 current programs are verified. All 40 LORD programs passed in a separate complete run and in each successful full shard. Six optional historical comparisons remain excluded by the unchanged runner and are not counted as passes.

Three old policy assertions required updates, without further product changes: activated non-baseline staff are no longer manual-only, their priority precedes recess-duty reuse, and the same dated activation works for an eligible SRE added through Stapler. The revised checks also assert the activation window, explicit priority classification, automatic eligibility and the retained exclusion safeguards. Initial failures are retained in the logs. The first shard 4 attempt ended without a complete program summary; it was not counted and was rerun.

Shards 1 and 2 used identical product bytes and identical selected test bytes to the final implementation. Shards 3 and 4 ran on `70077d3`; the only subsequent executable change is the corrected Stapler test at `719e547`. `tests/package.cjs` also passed after recovery onto current main. Fresh focused checks passed all 23 priority regressions and both actual Google/D1 adapter scenarios (daily SRE and non-SRE outside the baseline). The final independent advisory review found no further product defect; this is not Claude approval.

An isolated combined check with the Why-removal/backfill branch passed nine programs covering priority, Google/D1 parity, relief pool, manual ranking, no-Why saves, legacy TXT, backfill, queue and workbook. The allocator hunk overlaps, so whichever PR lands second must resolve it and rebuild the generated files. The combined check is not a third product branch or deployment.

Recovery path: `/workspace/scratch/13f97e1820a9/gsis-adhoc`. Evidence is in sibling `adhoc-generic-ci-1.log`, `adhoc-generic-ci-2.log`, `adhoc-policy-ci-3.log`, `adhoc-policy-ci-4.log`, `adhoc-final-stapler-check.log`, `adhoc-resume-lord.log`, `adhoc-resume-packaging.log` and `combined-final-tests.log`. The separate Why branch is locally complete at `0830d7926cc8a1118765b45e4e8016e25795809a`.

GitHub still has no ad hoc branch or PR. The earlier automatic approval review rejected publication because it could not verify authority to upload repository content. No further upload was attempted during this resume. These changes are prepared for explicit publication approval; no merge, deployment, live allocation, authority change or provider send occurred.

## Publication approved (6 Nov 2026, 02:36 SGT)

The owner explicitly replied "approve" to uploading both prepared branches and opening draft PRs in `helper-gsps/gsis`. This resolves the earlier publication approval blocker. The destination was rechecked as the private owner repository with push access. Proceed with the approved uploads, remote exact-head verification and draft PRs for Claude. No merge or deployment is authorised by this approval. Product code is unchanged from the local verification above.

## Published recovery (6 Nov 2026, Model: Codex)

The approved upload is complete. Implementation head: `219d987b08244022ab3b30b31013acd0de71b5b9`; published tree `c320f0d1c141d8ff46cdcca9450586ab2c0a2e91` exactly matches the previously tested local tree. The remote branch now contains all prepared product changes. This documentation-only handoff follows that implementation commit. GitHub full CI is running; open the draft PR after green CI and give Claude its final exact head. Earlier publication-blocker entries above are historical and resolved. No merge, deployment, live backfill or notification occurred.


## PR #84 rebase onto main (6 Nov 2026, Model: Codex)

Owner requested: rebase #84 on main, regenerate bundles and re-run CI. This resumes the existing Codex claim on the same branch; no new feature scope is claimed.

- Base: `63ce6bdfd060ebc19cdcc9b44d0afcbf3604d558` (v0.9.9n).
- Previous published head: `5c7fb3a75ce5612a8636b77161e38e1ed56d25ad`.
- Rebased implementation: `a6f9080fb3584a39df63ef55bf046ee6769f57df`; tree `0b62d7109e57cc5fbd17c6393fd3c9fd2f592d2b`, identical to the locally built and checked implementation.
- PR: https://github.com/helper-gsps/gsis/pull/84. Reviewer: Claude, at the final published head reported in the PR. This following commit updates this handoff only.

Resolved both canonical allocator conflicts by keeping the ad hoc priority and idle-reason code while retaining main's removal of `captureDecisionWhy`, `decisionEligibility`, `whyChecks`, `whyForPlan` and the report-only Why call. Changelog entries from both sides remain. All conflicting generated files were regenerated with the canonical build, not hand-merged. Main's audit backfill, Deploy targets and v0.9.9n labels are retained. Existing PR #84 regression files are unchanged.

Verification: `TZ=Asia/Singapore npm run build` passed for all 18 components; `git diff --check` passed. Ten focused programs passed: `roster-reoptimise-priority.cjs`, `roster-reoptimise-priority-parity.mjs`, `roster-remove-why-save.cjs`, `roster-daily-audit.cjs`, `roster-audit-backfill-edge.mjs`, `roster-daily-edge.mjs`, `roster-daily-queue.mjs`, `roster-daily-workbook.cjs`, `roster714-allocation-policy.cjs` and `roster098l-allocation-modes-ui.cjs`, all under `tests/`. Chromium was supplied for browser checks. Full GitHub CI will run on the final branch head; its outcome and exact SHA belong in the PR handoff, not inferred from the older green run. No full local-suite pass is claimed for this rebase.

Next: publish with an expected-head lease, inspect all four CI shards and the full-suite aggregate, then hand the final SHA and CI run to Claude. Owner merges. No deployment, live records, authority/settings changes or notifications are included.
