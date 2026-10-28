# GSiS 0.9.9 validation

Local release validation is complete. No 0.9.9 deployment, live provider send, school-record mutation or production-authority cutover was performed during this release preparation. Live acceptance remains an operator task.

## Baseline and method

The source baseline is Q commit `50c977d79c9756dfdbee91f2922f0cd89ab6e903`, following the P full suite. Tests run with `TZ=Asia/Singapore`, Node 24 and the installed locked dependencies. Browser tests use the locally available Chromium executable. A fresh internet dependency installation is not claimed.

## Recorded results

| Check | Result | Evidence and scope |
| --- | --- | --- |
| Fresh extracted source: `npm run build`, canonical archive parity, then `npm test` | Passed; 861/861 Node programs and 38/38 LORD programs | `Validation/broad-recovery/` in the release. Non-Git extraction; immutable source captured before the final two-file Calendar UI correction described below. LORD browser checks passed. |
| Final Calendar correction: fresh extracted source build, canonical parity and five affected UI/browser programs | 7/7 commands passed | `Validation/final-ui-recovery/`. Tests cover the mixed data/job hint race, idle push behavior, table stability and queued editing. |
| Initial workspace current Node runner | 860/861; corrected routing test then passed | `Validation/root/`. The sole failure was an outdated handbook-routing assertion; its 0.9.9 branch and documentation were corrected before the clean recovered run. |
| Workspace LORD suite | 38/38 passed | `Validation/root/full-lord.log`. |
| Generated production components and Apps Script syntax | 18 components built; 250 Apps Script files parsed | Build evidence and package verification. |
| Release archive behavioral checks | 14/14 passed | Covers tampering, duplicate/unsafe archive paths, symlinks, component parity, required source, setup/schema/config contents, provenance and relocated offline links. |
| Calendar venue diagnostics | 14 groups passed | Fixed safe codes, admin-only health detail, private error redaction, 33-character secret compatibility and no added mutation. |
| Separate timetable preparation archive | Five exact-archive recovery commands passed | `Validation/preparation/final-archive-recovery.json`; source/bundle parity, source Worker, archived Worker, exporter and canonical verifier. |

The full recovered run preceded one final correction in `calendar-update/public/app.js`: when a delayed data response is deferred because editing or a newer local save intervened, the pending job-refresh flag must also be retained. Its regression cases were added in `tests/calendar099-change-ui.cjs`. Those are the only two code/test files changed after the broad snapshot. Their before/after hashes and patch are retained with the evidence. The final source then passed a fresh full build, archive parity and all five affected programs:

- `node tests/calendar099-change-ui.cjs`
- `node tests/calendar099-change-browser.cjs`
- `node tests/calendar-stable-view-browser.cjs`
- `node tests/calendar-jobs/ui.cjs`
- `node tests/calendar-jobs/browser.cjs`

This is a clean broad run plus final targeted verification, not a claim that the 861-program run was repeated on the last two-file correction. Later changes are release documentation and finalization metadata.

## Coverage and limits

New Calendar checks exercise default-off configuration, journal deduplication and replay, cursor/pruning gaps, authorization and session expiry, private actor-scoped job hints, disconnected-client isolation, bounded reconciliation, source-delta permissions, and preservation of drafts, viewport and focus. Browser checks include an idle push-enabled interval and focus without fixed data/status polling. These are local simulated services and Chromium checks, not live Cloudflare hibernation, live Google throughput or a full-year provider sync.

Preparation checks cover the compatible native protocol, compressed content/hash handling, compare-and-swap, source and bundle behavior, export, cache and package recovery. The preparation ZIP SHA-256 is `9f4d39bda7cdb20e87968239cbe6a2f328ca73ab12412d31031777d2fb1e9e2c`. No production timetable reader or ledger authority is changed. Its live Calendar parity, Contacts identities, two-tab stale-write trial and OAuth origin review remain open.

Seven canonical production Roster/operations/allocation files remain byte-identical to Q; the boundary check is retained in `Validation/source-boundaries.json`. Other production Roster changes harmonise labels, not operational authority.

Six optional comparisons against old Git snapshots were explicitly not run. Current behavior assertions in those programs remained active; unavailable historical input is not counted as comparison coverage. See `docs/v099/INHERITED_TEST_CONTRACTS.md` and the recovered run's recorded notices.

Recovery reused installed locked dependencies, with `ROSTER_TEST_CHROMIUM=/tmp/chromium` and `LORD_TEST_CHROMIUM=/tmp/chromium`. It proves reconstruction from the pruned current source without a Git checkout; it does not prove a fresh network dependency installation. A recovered archive verifies supplied provenance and byte inventories; only the trusted checkout can independently check the Git tag and Q-to-release parent patch. Final packaging verifies both archives against that checkout. Artifact manifests supply the final archive contents and hashes.

The original Q run was not fully green. Its retained evidence is described in `docs/v098q/FULL_SUITE_FAILURE_CLASSIFICATION.md`. Current 0.9.9 test modernization keeps meaningful current behavior checks and identifies optional historical comparisons explicitly; it does not rewrite Q's recorded result.

Operator-provided P verification, local 0.9.9 tests and future live acceptance are separate evidence. See `docs/v099/HANDOVER.md` for outstanding operator checks, and `docs/v099/ROSTER_WORKER_ROADMAP.md` for the gates before any future Roster authority change.
