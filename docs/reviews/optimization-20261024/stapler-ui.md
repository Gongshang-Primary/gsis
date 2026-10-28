# STAPLER frontend reliability and responsiveness review

Date: 24 October 2026 (Singapore). Working changes only; no commit or deployment.

## Verified changes

- Local recovery format schema 2 stores pending Save plan/base snapshots by reference to the same atomic localStorage record when their contents match. It restores the original command including request ID and both snapshots. Schema 1 reads remain supported. Other dated drafts and other tabs' records are retained.
- A new planner mutation is not sent if its recovery record cannot be persisted. Existing uncertain retries retain their identity. The page stays editable when no command was sent, with an inline message directing the user to retain/export the plan and make storage available. No local storage records are automatically evicted.
- Confirm sends the last server-issued plan content tag only with a clean plan. Compact acknowledgements require the returned tag to match both the immutable request and the retained server tag. The UI uses explicit current planStatus and planRevision. Changed server content still returns and renders the full authoritative plan.
- Unchanged Save/Confirm content updates metadata, absences, access requests and status without replacing timetable DOM. A necessary full redraw preserves table/pit scroll, configured filters and attributable focus. Access/view/baseline changes still force a redraw.
- Historical Confirm acceptance is distinguished from current confirmation: a replay against a restored draft says that the current draft must be reviewed before confirmation.
- Before parsing an embedded workbook, import progress is allowed to paint. The existing load/date/plan/import identity guard is checked again after yielding, preventing the old import from overwriting newer edits.

## Evidence

`tests/stapler0812-draft-recovery-browser.cjs` failed before the patch because the pending identity was not durable before a request was sent. It now passes real Chromium checks for compact pending storage, exact lost-response recovery, new-command quota failure without a network mutation, unchanged Confirm DOM and scroll, compact Confirm lost acknowledgement and context reload, restored-draft replay wording, and server-merged changes that require DOM replacement while retaining scroll.

Synthetic 100-teacher fixture: dirty record 1,342,545 characters; pending record 1,342,776 characters, only 231 additional characters. Confirm retains the table node and scrollTop 1,500.

Supplied P3 LTP Offline JSON: 100 teachers, 44 classes, 21,103 DOM nodes. The historical study's pending record was 2,502,924 characters; the compact record is 1,251,696. With three other retained dates, total storage is 5,006,091 characters. Pending storage succeeds and reload restores the original request ID. Save and Confirm both retain scrollTop 1,500 and invoke drawTables zero times. The sanitized numeric evidence is in stapler-ui-evidence.json.

Existing `tests/stapler080-pending-request-retry.cjs` passes. Existing `tests/stapler718b-save-recovery-browser.cjs` passes with its synthetic full Roster shell/Worker/backend fixture, including signature error, lost response, retry, Confirm, reload, edit/Save/Confirm and genuine browser session expiry. Its expected internal plan revision was corrected to retain the submitted plan revision after the backend same-revision fast path removes the former redundant merge increment. The persisted record revision remains separately checked.

The same older shell test cannot directly consume this supplied P3 file: its fixed even-week synthetic baseline fails import week validation. The dedicated supplied-file probes build the baseline with the file's actual parity and cover the real import and storage/UI paths. No source bypass was added.

## Scope and limits

No wall-clock speedup is claimed from this run because concurrent verification can affect browser timing. The evidence is reduced stored bytes, unchanged DOM, stable viewport and preserved retry identity. The local storage fail-closed guard applies to planner mutations with a retained plan/base; date-list requests keep their existing retry model. No private tokens, staff names, raw plans or request payloads appear in this report/evidence.

The design review applied Awesome Design, Frontend Design Premium, Taste, UI UX Designer and Apple Design to feedback timing, continuity, focus, accessibility and preserving familiar controls. It introduced no visual redesign or dependencies. Engineering followed Ponytail's minimal shared-path changes, PStack retry identity, Superpowers reproduction-first checks and Vercel correctness/performance criteria, with parent-coordinated independent review.
