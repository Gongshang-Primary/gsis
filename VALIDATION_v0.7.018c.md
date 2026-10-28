# v0.7.018c focused validation

Scope: the Roster frontend and shared Deploy backend, based on v0.7.018b commit `977713961ad7f2885ca008b4fa77724dfeb18c82`. Tests use synthetic identities or the supplied Offline JSON privately. The school file is not copied into Git or the package. No production deployment, data change or staff message was performed.

## Confirmed cause and change

The shared Stapler validator rejected imported final lessons when a configured weekly cap had unverified workload, and rejected increased workload over a known cap. Initial Draft Save skipped this check, while Confirm and subsequent saves of a confirmed plan enforced it. This explains a saved draft that could not be confirmed. It is separate from the earlier signature error.

The validator now identifies original-owner imported lesson cards using server-validated immutable provenance. Eligible imported workload exceptions return structured warnings. Save and Confirm store these warnings beside the compressed canonical plan; authorised views expose them through the existing response. The UI presents escaped text in Planning notes. Normal draft saves with no eligible import avoid additional quota/context calculations.

The warning rule covers edits to original imported lesson cards. Actual new manual, Pit-to-grid or transferred-in placements retain the strict cap check. Unrelated baseline metadata edits retain the prior non-increasing workload rule even when another teacher has imported cards. Unknown workload remains unknown rather than becoming zero. Allocation eligibility and capacity rules are unchanged.

## Focused checks

| Check | Coverage |
| --- | --- |
| `tests/stapler718c-import-policy.cjs` | Imported unknown/exceeded cap exceptions, original-owner edits, new manual and transferred-in work, baseline edits, forged provenance, Pit/reset handling and allocation rules. |
| `tests/stapler718c-persistence.cjs` | Signed Save/Confirm, compressed storage and fresh runtimes, warning persistence, imported subject/venue/class/period edits, exact receipts, corrected cap data, structural conflict and new relief cap enforcement. Synthetic and supplied-file runs. |
| `tests/stapler718c-warning-ui.cjs` | Actual Stapler UI in jsdom with fresh disk-backed backend runtimes: Confirm, visible warnings, escaped names, remount, editing, Save and reconfirmation. |
| `tests/stapler718b-save-recovery-browser.cjs` | Real Chromium shell and UI with supplied JSON: import, backend rejection without draft loss, exact retry after a lost successful response, no duplicate write, Confirm, reopen, edit, Save and reconfirmation. |
| `tests/stapler718a-relief-import.cjs` with supplied JSON | All 722 final cells, 17 absent periods and 6 coverage placements match the independent offline export oracle; teachers missing from JSON retain baseline. No replay of attendance or notifications. |
| `tests/stapler715-persistence.cjs`, `tests/stapler716-canonical.cjs`, `tests/stapler718-lifecycle-persistence.cjs` | Durable full-size plan persistence, canonical content/date/source checks, editing, rename/move/delete/restore and receipt behaviour. |
| `tests/roster718b-signature.mjs`, `tests/stapler718b-envelope.cjs` | Existing scoped signing, Unicode roundtrip, tamper rejection, service versus browser authentication boundaries and request-size limits. |
| `tests/cap708.cjs` | Existing weekly cap behaviour outside this import exception. |
| `tests/hotfix718c-package.py` | Two deployment items, exact committed source/tag, generated backend, unchanged other components/assets, incremental history and checksums. Run after commit and package creation. |

## Review

Ponytail and Pstack guided the focused change. The saved Thermonuclear package was recovered and its correctness and code quality workflows were run by two independent reviewers against the fixed v0.7.018b baseline.

Review found and corrected two issues before commit: unnecessary workload calculation on ordinary draft saves, and a global import flag that tightened unrelated baseline metadata edits. Focused regressions cover both. Final generated copies and package checks ensure the reviewed owners reach the deployment files.

These are local functional and persistence checks. The live suspended date, actual deployed configuration and production latency require verification after installation. No broad performance refactor is included; the date-list speed request remains queued for v0.7.19.

## Reproduce

Run the named Node checks from the repository root with the existing dependencies. Pass the school JSON path as the optional argument to the persistence, import and browser checks. Browser checks require Playwright and Chromium; set `NODE_PATH` and `ROSTER_TEST_CHROMIUM` for the installed runtime where needed.

After committing and tagging `v0.7.018c`, run `python3 scripts/build-718c.py`, followed by `python3 tests/hotfix718c-package.py`.
