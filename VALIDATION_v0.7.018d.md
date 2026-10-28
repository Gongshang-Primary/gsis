# v0.7.018d focused validation

Scope: Roster frontend only, compared with v0.7.018c commit `91f3d03e078352356975ca777bcde96079d755fe`. Backend, domain models, storage and signing code are unchanged. All checks use synthetic staff and local service fixtures. No live deployment, absence report or staff message was made.

## Corrected write boundary

The old top Submit absence action saved immediately without instructions. The preview's No relief instructions action also saved immediately, and preview Own arrangements saved implicitly before opening the colleague request flow. These three routes contradicted the requested review stage.

The first action now prepares a local review. No relief instructions is a reversible local choice below the lesson rows, retaining entered text. The bottom Submit absence action alone creates the report and includes its dated instructions in the existing command. Saved instruction settings also wait for their bottom Save. Own arrangements starts from an existing saved absence. The obsolete save-while-opening-dialog path was removed.

The instructions section has no disclosure wrapper. A heading is present before review, the lesson rows appear after review, and the section stays open after saving. Native dates and individual period selectors are preserved. Error and retry messages are placed in the Report Absence page flow outside the frozen form, so they do not cover the bottom action. Other pages keep their existing feedback layout.

## Checks performed

| Check | Result and scope |
| --- | --- |
| `tests/absence718d-flow.cjs` | Chromium: zero writes on review or No relief instructions; final action below the rows; retained text; separate notes by date; rejected-save recovery; atomic two-date command; exact receipt lookup after a lost response; no duplicate records; saved-only Own arrangements; explicit Save for later instruction settings. Both entry routes use the same flow. |
| Same focused Chromium suite, responsive checks | Controls and document fit at widths 320, 390, 768 and 1280. Error recovery is exercised at 390 pixels. Desktop and phone captures inspected. Pending retry remains visible and usable outside the locked report. |
| `tests/roster-draft-absence-instructions-browser.cjs` | Preserves the draft-first instructions workflow, multi-date notes, explicit no-instructions submission and saved colleague arrangements. Migrated early-write expectations to the new final action. |
| `tests/roster716-absence-fast-browser.cjs` | Explicit dates/periods, atomic range submission, exact retry, retained inputs, type rules, instruction review, Singapore date rollover and narrow layout. |
| `tests/roster718-absence-performance-browser.cjs` | Existing bootstrap/date read deduplication, dirty input preservation, receipt handling and Singapore rollover. Local fixture timings do not establish production latency. |
| `tests/roster707-ui.cjs`, `tests/roster711-workspace-ui.cjs`, `tests/roster711-workspace-browser.cjs` | Existing workspace/report permissions, saved colleague requests and adjacent workflows. Updated obsolete early-submit assumptions. |
| `tests/roster712-absence-eligibility-browser.cjs` | Existing teacher eligibility and reporting restrictions with the corrected review/final-save sequence. |
| `tests/roster710-absence-policy-ui.cjs` | Excluded subjects, stale revision rejection, obsolete instruction keys and per-date rule-change review retain the existing guards. |
| `tests/roster701_browser.py` | Selectors and flow migrated; Python syntax checked. Its browser run was not executed because Python Playwright is unavailable. Equivalent affected paths ran in Node Chromium checks above. |
| `tests/hotfix718d-package.py` | One frontend deployment item; exact committed source/tag, version, unchanged backend and other assets/components, incremental Git history and checksums. Run after commit and package creation. |

## Review and limits

Ponytail and Pstack guided the shared-handler change. Two independent Thermonuclear passes reviewed correctness and code quality against the fixed baseline. No remaining material finding was reported. Root completed the last mobile feedback placement and retry-visibility verification after those reviews.

The focused design review used Awesome Design, Frontend Design Premium, Taste, UI UX Designer and Apple Design. Existing product controls and styling were retained. Review found and fixed a narrow-screen teacher-picker overflow and floating feedback that could cover the final action. The instruction table retains its existing horizontal scrolling on narrow screens.

This is a local functional and layout verification. Live configuration, production saves and production loading times were not tested. The previous Stapler fixes remain present, but this frontend-only patch does not add a new backend or broad performance refactor.

## Reproduce

Run Node checks from the repository root with the existing dependencies. Browser checks use Playwright and Chromium; set `NODE_PATH` for the installed runtime and `ROSTER_TEST_CHROMIUM` for its executable where needed. After committing and tagging `v0.7.018d`, run `python3 scripts/build-718d.py`, then `python3 tests/hotfix718d-package.py`.
