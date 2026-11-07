# Codex review of PR #98

Model: Codex
Reviewer: Codex; 6 November 2026 (Asia/Singapore).
Reviewed head: 35a4f5abb20e0d1479900f2f802fc03dfb0ad47f (rechecked against the live PR Git ref before handoff).
Current main checked: 682a88715ff1b2b2ef5f8c7e5eca46e28285dd3f.
Verdict: **approve — no blocking product findings**. This is an advisory code review, not a GitHub approval, merge, deployment, or live-provider validation.

Recorded on main by Muse from Codex's review as delivered via the owner; Codex's report was saved locally in its detached review checkout and was not committed or posted to GitHub by Codex.

## Scope and behavior

Read the complete 12-file diff against the merge base, the task's owner decisions, callers, draft restoration, and the backend return validation. The change matches the explicitly recorded removal of the physical-trolley and placement checkboxes and the switch to always-open collection/return cards. No backend or Worker code changes.

`lord-suite/Source/lord/assets/app.js:1167` displays the placement attestation immediately above the submission actions; `submitReturn` at line 1367 retains every-trolley quantity/photo validation and issue-note requirements, and lines 1424–1437 send both placement declarations as true for every trolley as explicitly authorized. Backend `Code.gs:1810` still requires every trolley exactly once and validates record membership before Drive writes; this backend is unchanged. Accessory evidence and the issue action remain present. Source/template JS and CSS are byte-identical.

## Verification

Executed at the exact reviewed head using Node 24.22.1, Python 3 and system Chromium, with `TZ=Asia/Singapore`, `NODE_NO_WARNINGS=1`, and `LORD_TEST_CHROMIUM=/usr/bin/chromium`:

- `npm run build`: passed, all 18 production components; **no tracked diff** after regeneration.
- `python3 lord-suite/tests/run_all_checks.py`: **40 programs passed, 0 failed**, including all changed executable tests and the contract/refactor tests that consume the changed helper modules.
- Included static checks: **116 passed, 0 failed**. Included reload browser checks: **19 passed, 0 failed**.
- Independent browser probe using the real frontend and synthetic API responses: manual and carried-forward returns with three trolleys; all quantity/photo controls visible and enabled; each trolley's missing photo blocks submission; legacy `selected:false` drafts survive reload/resume and submit all three trolleys with photos and both declarations true. Passed. Probe stayed outside tracked source/tests. Its initial attempt failed because the probe did not await asynchronous draft saves before reloading; after awaiting `persistDraft`, it passed. This was a probe correction, not a product fix.
- `cmp` on Source/template JS and CSS: passed.
- `git diff --check origin/main...HEAD`: passed.
- `git merge-tree --write-tree --name-only origin/main HEAD`: exit 0, no conflicts; merge tree `4a1fcf953fed7940949b0e44883668359474ae7d`.

CI evidence supplied by the owner: run **42184138973**, all five jobs passed at `35a4f5a`, PR draft and mergeable. GitHub Git reads worked, but both GraphQL and REST API reads returned Forbidden in this environment, so the reviewer did **not** independently verify CI status or draft metadata. A green CI run supports this head; it does not by itself prove every prior local failure was a load flake.

Not run: the full 1,031-program Node regression suite, live Google/Cloudflare actions, or staging deployment. Local validation here covered the full LORD suite and selected additional interaction cases; no real messages or school records were touched.

## Nonblocking test advice

`lord-suite/tests/booking-remarks-return-browser.cjs:89–90` checks for absent return checkboxes/accordions after successful submission, when the form has already been replaced by the success screen. Move these two assertions before the submit click so they can detect a regression in return-form rendering. Static checks already cover the removal, and the independent probe verified the actual pre-submit form in both entry modes, so this is a test-strengthening suggestion rather than a product blocker.

Not applied to the PR: applying it would move the reviewed head and void this approval. Recorded here and in the task record as a follow-up.

## Handoff

PR code, draft status, and production settings remain unchanged. Owner controls marking ready, merging and deployment. Re-review any change to the head SHA. Standard staging acceptance remains a separate release step.

Evidence logs (in the reviewer's environment): `/workspace/.gsis-environment/pr98-build.log`, `pr98-lord.log`, and `pr98-extra-probe.log`; probe: `pr98-extra-probe.cjs` in the same directory.
