# Revision H validation

Offline verification is complete with seven inherited G test limits. No new runtime failure remains after the fixture-only rerun below. This is not a claim of a single green full-suite run or production delivery.

## Measured results

| Gate | H result | Evidence |
|---|---|---|
| H-focused Node programs | 19 passed | Every program whose name includes 098h passed. |
| Initial complete Node run | 750 passed, 58 failed, 808 total | Integration evidence retained separately; real defects and obsolete fixtures were resolved. |
| Frozen generated Node run | 801 passed, 8 failed, 809 total | Four workers, 90-second per-program limit, local Chromium, Singapore timezone. |
| Post-gate fixture rerun | stapler717-reopen passed | The prior-context simulator now recreates its historical quota prerequisite. Exact plan/response equality and all performance thresholds remain. Save/Confirm verifies quota independence. Runtime files did not change. |
| Aggregate Node result | 802 passed, 7 inherited failures, 809 total | Raw complete-run results and the isolated rerun remain distinct. No timeout or unavailable dependency counts as a pass. |
| Complete LORD gate | 38 passed, 0 failed | Separate complete gate: 113 static and 17 setup checks, 22 new background-work cases and desktop/mobile browser flow. Final source hashes match its inputs. |
| Syntax and generation | Passed | 212 Apps Script files parse as ES2020. Canonical models, helpers, renderer, edge domains, 28 LORD templates and both standalone Workers synchronised. |
| Runtime stability | Passed | All 474 runtime/source hashes stayed identical through the frozen gate and fixture-only rerun. |
| Matched deployment package | Passed before commit | All 17 components, source/assets parity, archive hashes, self-contained Pages entry points and authentication/recovery smoke routes. Postcommit recheck recorded in the release receipt. |
| Independent review | Findings closed | Fresh correctness/privacy/concurrency reviews for Stapler, policy/communications, LORD and secrets, plus maintainability/integration review. Reproduced findings received regressions and independent rechecks. |

The complete Node command was `npm run test:release -- --skip-package` with `GSIS_TEST_WORKERS=4`, `GSIS_TEST_TIMEOUT=90` and `ROSTER_TEST_CHROMIUM=/tmp/chromium`. The package program was checked separately through the actual component verifier and packaged entry-point tests. The suite route uses the matching component verifier/archive/provenance format, with tamper and valid-prior-output preservation tests. The numeric full-release verifier was not loosened.

## Behaviour and regression evidence

- A real signed future standalone Create → Save → Confirm → authenticated teacher read succeeds without a registered baseline or Deploy quota. Optional baseline changes preserve cells, confirmation and source identity. Native import keeps grid, Card Pit, mats, recess, IDs and periods while rejecting imported confirmation authority. Reset/deleted archive recovery retains receipt/version guards and trusted provenance.
- Compact Confirm measured 8,967 bytes against a 1,464,479-byte full response, meeting the unchanged under-10% gate. Changed comparisons refresh; unchanged arrays require matching tags. Exact lazy-read/compression limits remain green: one draft save among eight historical dates uses one ungzip, two gzip calls and zero Venues calls.
- Ordinary publication/private capabilities stay separate from authenticated confirmed Stapler navigation and captured communications. Actual backend/edge tests cover an older empty publication, later unshared confirmation, removed/replaced baseline, timing metadata and a retained published plan. Missing historical published data reports unavailable instead of exposing private current content.
- Publish changes visibility without implicit notification/allocation or business-warning gates. Explicit communication captures only its recipient. Original correction-cycle, duplicate authority, acknowledgement and unknown-attempt checks pass. Restoring baseline retires safely unsent obsolete intent. Absence deletion withdraws its future derived duty while retaining history and still-needed shared cover.
- An independent offline chain executes the actual gateway, verified signed envelope, edge claim/prepare/settle, signed link and scoped read/acknowledgement. A mocked provider receives one submission, then zero on retry. D1 persistence and provider HTTP are substituted; production delivery is not established.
- UT automatic capacity requires verified configured weekly evidence, including effective suspended work and relief. Missing Contacts UT metadata cannot bypass the cap. Manual SMC warning/audit and non-UT suspended rules remain. All 22 H policy cases and relevant inherited accounting/allocator cases pass.
- GSIS_SECRET accepts 32–8000 printable non-whitespace ASCII characters, including 33. Malformed configured values fail closed; absent settings retain legacy credentials. Session/link/provider credentials remain independent. Startup preserves configuration errors before sign-in diagnostics, including a config/session race.
- OVERLORD management uses live administrator checks, recipient-scoped hashes, bounded previews, stable commands and deterministic audits. Unknown sends remain unknown. Server recovery works after browser state is lost. Retirement does not claim delivery or resend an uncertain message.

Historical expectations changed only where H explicitly changes the contract. Browser success stubs now model real HTTP ok/status; selectors distinguish standalone creation and separate Publish/WhatsApp. Legacy dynamic attendance/provider checks remain explicit legacy fixtures. No performance threshold, stored baseline provenance or missing Git history was fabricated.

## Seven inherited G limits

All seven were independently reproduced on frozen G and remain in H.

| Program | Measured reason |
|---|---|
| release084-absence-browser.cjs | Historical v0.8.3 Git object is absent. |
| roster717-inbox-performance.cjs | Historical v0.7.16 Git object is absent. |
| roster718-absence-performance-browser.cjs | Historical v0.7.17 Git object is absent. |
| stapler718a-relief-import.cjs | Required historical Stapler path is absent at 32d2c2d17621319ba1d57aea34046229544f5513. |
| roster-draft-cell-save-speed.cjs | G and H both measure 3,073 response bytes against the unchanged 3,000-byte threshold. |
| roster080-batch-backend.cjs | Imports the same response-size benchmark. |
| roster719-performance.cjs | Imports the same response-size benchmark. |

## Release identity and recovery

Tag v0.9.8h identifies the committed release. PATCH.json records its exact source commit and committed state. The outer RELEASE_VERIFICATION.json records postcommit package verification, bundle verification, a fresh bare clone/fsck, tracked source parity and fresh-clone critical reruns. These receipts live outside the source commit to avoid self-referential metadata.

The complete recovery bundle contains all reachable release history, including the reconstructed baseline. It does not invent unavailable older source. Source/history files are maintenance material, not Pages uploads.

## Live status and boundaries

No production deployment, cloud configuration change, school record mutation or real message send was performed. No new database, Worker, Queue, cron, migration, relief ledger or timetable-cache activation is required. D1/R2 preparation remains separate. Preserve existing authority, bindings, data IDs, URLs and independent credentials.

The user reported a ready recovery Preview for 28/29/30 October. A successful live Restore is not confirmed. Package tests do not establish restoration of school records. No private incident payload or recovery fixture is shipped.
