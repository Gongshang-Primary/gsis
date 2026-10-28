# Revision J validation

Baseline: I commit `f512ac6f584c26a027c1cf2aefb3b19d01fd6838`. Google remains the production record authority. No live deployment, production record change, provider submission or authority cutover was performed.

## Selected Node suite and exact limits

All 829 selected Node programs were exercised across preserved attempts. Final aggregate: **822 passed, seven inherited failures**. This is not one entirely green full-suite run.

The initial long-running attempt recorded 791 programs: 773 passed and 18 failed. Its process became unavailable before its final group and no terminal exit code was observed. The exact remaining 38 programs were run separately: 37 passed and one failed. The raw combined result was 810 passed and 19 failed.

Twelve affected programs then passed in scoped reruns: two package checks initially ran before the J archive existed; eight UI/export fixtures expected retired home/toolbar/DRAFT output; one Calendar fixture expected publication validation before rejecting a nonexistent sync session; and one glossary fixture expected physical row sorting. Fixtures now directly assert the requested UI/output, independent controls, active-session publication fence, actual zero provider calls, and unchanged independent glossary records/tokens. Runtime source remained byte-identical across these attempts (458-file hash inventory). No threshold was relaxed and no missing historical source was fabricated.

Raw initial results, remaining-program results, scoped reruns and final aggregate are separate files in the complete release. The seven unresolved programs were reproduced against restored I; the three browser cases were also rerun after Chromium was installed.

| Program | Remaining baseline limit |
|---|---|
| `roster-draft-cell-save-speed.cjs` | 3,073 response bytes against the unchanged 3,000-byte threshold. |
| `roster080-batch-backend.cjs` | Imports the same response-size benchmark. |
| `roster719-performance.cjs` | Imports the same response-size benchmark. |
| `release084-absence-browser.cjs` | Historical Git reference `v0.8.3` unavailable. |
| `roster717-inbox-performance.cjs` | Historical Git reference `v0.7.16` unavailable. |
| `roster718-absence-performance-browser.cjs` | Historical Git reference `v0.7.17` unavailable. |
| `stapler718a-relief-import.cjs` | Historical `shared/roster-stapler.js` unavailable at `32d2c2d17621319ba1d57aea34046229544f5513`. |

## Feature and integration evidence

| Gate | Observed result |
|---|---|
| Eleven new J programs | All passed, including publication/learning/classification/UI/exports, Calendar commands/native reads/glossary/venues and the private catalogue. The Calendar jobs aggregator runs six further focused programs. |
| Compact publication | Eleven cases passed: receipt-first exact replay, unavailable-source recovery, saved-day conflicts, no cover/intake/allocation gates, stable compressed-plan tokens and both Venues failure boundaries. Provider evidence retained; no implicit send. |
| Roster UI and communication | Synthetic DOM and real Chromium desktop/mobile checks passed for the two-stage combined action, independent buttons, lower Save row, retained drafts/retries, owner isolation, learning access and exact prompt. |
| Final Excel export | Actual XLSX XML checked for absent DRAFT markers, wrapping styles, heights after final overlays, merged names, multilingual text, timing rows, frozen panes, both views and immutable inputs. Three synthetic workbooks were additionally rendered with LibreOffice and representative pages inspected. Microsoft Excel itself was not exercised. |
| Calendar sync | Controlled retained-I comparison reproduces 44 Values reads for five events; J sync path uses zero. Interrupted 365-date run resumes to 365 unique provider identities; incremental edit and 20-command burst pass. Native reads retain authority checks; provider claims and bounded deadlines remain. |
| Calendar backend and Sheets | Generated backend 38/38 and Sheets 63/63 passed in Asia/Singapore. Initial UTC-only attempts failed their weekday fixture; their distinct logs are retained, not counted as successful runs. |
| Calendar queue | Real local SQLite, mocked Google transport and real Chromium checks passed for durable acceptance, four operations, per-event ordering, original actor revalidation, nonce/owner isolation, leases, receipt-first uncertain recovery, bounded list omissions, frozen retries and retained editors. |
| Glossary and venues | In-place glossary revision/cache/concurrency tests and append-only stable VenueID/custom-text tests passed. Catalogue excludes booking/private staff projection. |
| LORD | 38/38 programs passed with the supplied Chromium executable. An earlier attempt without the required browser setting stopped at its first browser program; retained separately. |
| Independent reviews | Five reviews completed with no open material findings after scoped corrections: Roster backend, Roster frontend, Calendar backend, Calendar jobs/frontend, and release/package integrity. |
| Generation and packaging | Canonical module/factory parity, 227-file Apps Script syntax gate, 18-component working package parity/hash/smoke verification, duplicate-entry rejection and unchanged I rehearsal verification passed. Final committed package and fresh recovery are recorded externally after the commit. |

## Production and provenance boundary

The optional Calendar job Worker needs its own dedicated D1, Worker, cron and Pages service binding. Direct Calendar mode remains available without that binding. Optional sync continuation is false by default and resumes only an existing session with current original Admin authority and leases/deadlines. It never starts a new sync.

Cloudflare provisioning/deployment, real D1/R2 persistence, school sign-in, production latency and provider delivery were not verified by these local checks. No real message was sent. The existing I Roster rehearsal is unchanged, isolated, and is not a production installation or cutover.

Expected tag: `v0.9.8j`. `PATCH.json` records the actual committed source and state. The complete release's external `RELEASE_VERIFICATION.json` records the exact tag/commit, hashes and post-commit fresh bundle clone/fsck, I ancestry and tracked-source byte parity. Source foundation remains `703d3975e05d64acc512511ae2d09b0942cc900c`; patch and preserved rehearsal baseline remain I. Unavailable older historical objects are not reconstructed or claimed.
