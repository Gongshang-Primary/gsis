# Roster daily throughput implementation plan

**Goal:** Publish and notify for one relief date while another date is allocating, with fewer remote waits and safe concurrent writes.

**Architecture:** Reuse the existing daily state and publication snapshots. Prepare expensive work outside the final shared writer lock, validate dependencies against current state, then commit changes and their receipts to the existing operational document. Reduce request count and unnecessary data before introducing transport compression.

**Tech stack:** Cloudflare Worker and browser JavaScript, Apps Script, Drive JSON operational store, Calendar and Contacts APIs.

**Spec:** Canonical queued changelog items 050 and 051; user request 052 on 20 October 2026 at 16:48 Singapore time. Baseline commit 4f9ba7ba3cdff57e91fde9fcd6fff8e9a4a53b29, including the v0.8.00a absence shortcut.

## Constraints

1. Commit and package v0.8.1 after review; no live deployment, timetable publication or staff message.
2. Preserve stored settings, permissions, audit, receipts, uncertain-send recovery and weekly workload limits.
3. No parallel stale whole-document writes. Server remains authoritative; local rendering does not authorize changes.
4. Keep existing date and started-period policies; accurate errors replace generic allocation conflict messages.
5. Older clients retain safe revision fallback. New clients use operation-specific daily tokens.

## Review focus

1. A notification claim/result arrives while tomorrow's proposal is computing: both survive the commit.
2. Today's publication changes after a user reads it: Notify rejects an unreviewed version.
3. The baseline, quota or shared policy changes while work is outside the lock: stale proposal is rejected or recomputed.
4. A save finishes after navigation or acknowledgement is lost: preserve date ownership and exact request retry.
5. Calendar batch failure or malformed response: preserve per-date verification and deny unverified publication.

## Task 1: Daily backend transaction scope

Files: backend/RosterOperations.gs, shared/roster-operations.js, focused adapter tests.

Interface: views supply dayToken; publish, reliefBatch, autoAllocate and optimise submit expectedDayToken; notifyDaily submits expectedPublicationRevision using the existing publishedRevision view field. Old clients without scoped tokens keep global revision protection.

1. Add failing tests for tomorrow scheduler versus today's Notify, same-day stale publication, receipt retry and interleaved callbacks.
2. Implement scoped validation, proposal preparation and fresh-state commit without overwriting unrelated state.
3. Revalidate day/source/shared workload dependencies and time cut-offs; avoid invalidating day tokens for scheduler bookkeeping alone.
4. Run focused backend suites and record observed constraints.

## Task 2: Daily browser ownership

Files: roster-update/public/roster-operations-ui.js and browser regressions.

Interface: consume Task 1's tokens. Keep immutable pending commands keyed to the owning user and affected dates; broad commands conservatively block their full affected scope.

1. Add failing browser checks for unresolved tomorrow save then today's Notify, same-day guards, navigation and exact retries.
2. Send scoped tokens and preserve meaningful publication failure messages.
3. Run affected browser checks and retain the v0.8.00a shortcut behavior.

## Task 3: Reduce remote waits

Files: roster-update/public/_worker.js, Calendar service dispatch where needed, narrow Contacts projection only if justified, gateway tests.

1. Measure source call chains and representative response sizes; compare gzip/base64 cost without treating local timings as Apps Script measurements.
2. Add failing checks for a single authenticated Calendar batch for today/tomorrow and no unnecessary Calendar call for pure Notify.
3. Implement bounded batching and projections while preserving current authority and signed transport.
4. Prefer local filtering/rendering of already authorized snapshots; do not add client-side writes or stale authorization caches.

## Task 4: Planning summary and notification dispatch

Files: scheduledTick summary hunk in shared/roster-operations.js, notification-worker/index.js, tests and relevant template documentation.

1. Verify sender/template constraints for multiline summary before selecting the delivery format.
2. Add failing tests for distinct teacher count/list, retained qualifiers, compact coverage paragraph and length limits.
3. Add a deferred-promise test proving notification dispatch starts before slow allocation finishes.
4. Implement independent bounded task execution, preserving claims and scheduled receipts.

## Task 5: Integrate, review and release

1. Sync runtime source and generated backends/bundles; bump the suite to v0.8.1 and normalize the v0.8.00a frontend label.
2. Run the project suite and focused concurrency/performance checks. Record failures explicitly and resolve material regressions.
3. Independent Thermonuclear correctness and structural reviews inspect the full baseline diff; apply Ponytail, Pstack, Vercel and Superpowers throughout.
4. Fix evidenced material findings, verify, commit and tag v0.8.1; produce full package, repository history, checksums and installation notes.
5. Update canonical changelog items 050 to 052 and save the deliverables.

## Execution ledger

Initial ruling: user explicitly authorized implementation and commit, so proceed without an extra plan-approval pause. Existing isolated worktree is reused on release/v0.8.1. Independent tasks have assigned file ownership; generated artifacts are synchronized only by the root agent.

Baseline: prior v0.8.00a validation recorded 428 applicable scripts passing across the full invocation and parity rerun, with the full-package gate inapplicable to the surgical package. This release must pass the full-package gate for its own artifacts.


Implementation completed: canonical backend prepared transactions and source guards; selected-date browser ownership; authenticated Calendar batch and pure-Notify bypass; independent notification dispatch; compact inline planning names chosen by the user. Preserved existing local data manipulation and compressed Stapler storage after measuring a synthetic gzip round trip. No new transport codec.

First broad parallel check: 430 of 433 selected scripts passed. Three failures were investigated rather than omitted: two legacy/new fixture projections assumed all mutation reads or dates were locked/broad; their assertions were scoped to the actual command contracts. One authentication teardown dirty-state regression was fixed while retaining the immutable request. Final sequential npm test and package gate remain the release authority.

Independent review found two concrete UI recovery defects: a displayed Notify Retry selected an older allocation, and a draft-batch Retry shown on Daily Notify could not act after its editor unmounted. Fixes require exact task binding and a truthful path back to the owning assignment editor. Permanent browser regressions cover these paths before completion.

Final npm result: 433/435; both failures and four related browser suites passed the final scoped rerun. The direct-render dependent-page barrier was restored; the intentional date-isolation contract retains the original queue/conflict on return. Independent correctness reviewer rechecked this final delta. All 435 current scripts are verified across these recorded runs. Proceed to commit/tag and final package parity/provenance gate.
