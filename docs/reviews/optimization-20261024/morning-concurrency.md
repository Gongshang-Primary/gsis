# Morning reporting and allocation concurrency

Reviewed and prepared 24 October 2026. This report concerns source changes and deterministic local tests. Nothing is deployed.

## Existing safeguards retained

Report Absence prepares reference context outside the writer lock, then reads the latest operational document inside the commit lock. It checks current absence records and policies, appends the absence plus receipt/audit/notification intent in one durable replacement, and keeps the same request ID for retries. Independent new reports can start at an older global revision. Existing-record edits require the appropriate row/document fence. Thirty deliberately overlapping reports with reversed commit order remain thirty records and thirty receipts, with zero duplicate writes on replay.

Assign Relief uses server state, current Contacts authority, current timetable sources and live attendance/capacity constraints. Independent token-aware human edits merge by selected cell. Teacher double booking is still checked across cells, so independent cells are not treated as independent resource reservations.

Automatic allocation works on a prepared snapshot outside the shared writer lock. Before committing, it rechecks timetable/Deploy manifests and domain dependencies under the same lock as human saves. Those dependencies include absence and manual-decision state and weekly workload inputs. A computed proposal cannot overwrite a subsequently accepted human choice or erase a new absence. Current explicit auto requests reject a changed reviewed day token; this is safe rejection, not a claim of automatic conflict-free completion.

Manual assignments, explicit empty choices and No Relief choices remain protected from automatic allocation. Invalidated human cover is marked for review rather than replaced silently. SMC must explicitly return a choice to automatic allocation before the solver may change it. Scheduled optimization retains the server-side 06:29:59.999 cutoff, including a final commit-time check.

## Prepared provenance and decision audit changes

The stored `cellDecisionVersions` map holds one latest human decision marker per date and demand. Each actual human decision receives a new server-generated identifier and a monotonic per-cell version. Returning a cell to automatic allocation retains its marker. This detects A-to-B-to-A changes even when all operations have the same timestamp.

Allocation responses include `cellProvenance`, keyed by demand ID, with `token`, `version`, `actor`, `actorName`, `at` and `kind`. The token also identifies the current assignment and invalid-cover state. `cellStates` retains its existing value-only shape. Clients send `baseCellTokens` with their first observed `baseCells`.

Conflicts expose current provenance and the old comparison token. Explicit review choices use `cellResolutions[id] = {choice: 'keepMine' | 'keepOnline', expectedToken}`. The token must still match when saving. Keep mine is a new reviewed human override; Keep online records the decision without claiming that the reviewer changed the online cell. If another accepted decision arrives after comparison, the client must review again. Request receipts preserve the same choices on retry.

Older clients without per-cell tokens retain a strict current day-token or exact document-revision fence. They must refresh if stale. They cannot use value-only equality to bypass an intervening human decision.

Human changes and explicit conflict resolutions retain compact before/after values, editor attribution, server time and request identity even when verbose logging is disabled. `RosterAuditExport.gs` recognizes these essential events and exports their named decision trail. Optional detailed automatic-solver diagnostics still obey the verbose logging switch. Existing no-essential-event logging-off behavior remains unchanged.

## Verification

New `tests/roster0812-human-decisions.cjs` verifies same-clock ABA, stale legacy rejection, named provenance, explicit overrides, Keep online audit-only receipt, changes after comparison, same-request replay without duplicate audit, return-to-auto decision retention and essential named text export with verbose logging off.

Existing checks passed: 8 backend cell-merge checks, manual-authority domain checks, 18 prepared day-transaction checks, 30 overlapping absence reports, 1/10/30 background concurrency scenarios, 11 counting/logging checks and 8 audit-export checks. These exercise actual domain/dispatch code with deterministic Apps Script/Drive adapters, not live simultaneous cloud runtimes.

## Boundaries

Ordering is determined by accepted server decisions, not device clocks. The displayed timestamp is server event time; the token/version is the concurrency fence. Existing authority, source, absence, published-cover and workload checks remain decisive even after Keep mine.

The operational commit is one atomic document replacement. Logical cell changes are surgical; Drive bytes are not a partial document write. Full live cloud load and peak-morning network latency remain unmeasured. Running allocation display and cooperative cancellation are implemented/reviewed separately from this conflict contract; closing or aborting a browser request alone must never be described as cancellation of a server commit.
