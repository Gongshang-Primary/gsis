# 098d validation

## Results

- Main runner: `npm test` completed its 775-program main suite with **760 passing and 15 failing** in the initial run. LORD does not run through that command when the main runner exits nonzero, so it was run separately.
- Follow-up checks resolved **8** initial failures: three browser-runtime setup failures, three checks run before the deployment archive existed, and two diagnostic checks that caught an inconsistent build label in the combined backend. The build label was corrected in source and both checks passed.
- Consolidated main results: **768/775 passed; 7 inherited limitations remain**. This is a consolidated suite plus focused reruns, not a claim that a single all-green `npm test` run occurred.
- Final affected-path run: **16/16 programs passed**, including all six new 098d regression programs, real intake/journal/pipeline adapters, browser coverage-choice retry, Worker intake/gating, delivery review, instruction concurrency and backend diagnostics.
- LORD suite: **35/35 programs passed**, including the new scheduled-lock contention test. Release-label expectations and the first-time setup backend template were synchronized with the new LORD backend.
- Build: combined Apps Script syntax gate passes; dashboard Worker text/module match. Component archive checks cover source parity, self-contained Worker imports, authentication/recovery gates, packaged assets and hashes. Final archive verification is performed again after the release commit.
- Independent review identified seven important merge/concurrency issues. Each was addressed with regression coverage. No unresolved critical/important finding or deferred minor was reported. Additional tests cover a delayed report after an explicit deletion and preserving published relief assignment identity without duplicate instruction notifications.

## Seven remaining main-suite failures

| Program | Limitation |
| --- | --- |
| `release084-absence-browser.cjs` | Historical `v0.8.3` Git object unavailable in recovered source. |
| `roster717-inbox-performance.cjs` | Historical `v0.7.16` Git object unavailable. |
| `roster718-absence-performance-browser.cjs` | Historical `v0.7.17` Git object unavailable. |
| `stapler718a-relief-import.cjs` | Historical `32d2c2d17621319ba1d57aea34046229544f5513` source path unavailable. |
| `roster-draft-cell-save-speed.cjs` | Existing response is 3,073 bytes against the test's 3,000-byte threshold. |
| `roster080-batch-backend.cjs` | Imports and fails the same response-size benchmark. |
| `roster719-performance.cjs` | Imports and fails the same response-size benchmark. |

All three benchmark failures were also reproduced on the unchanged reconstructed 098c baseline. Their measured counts remained one primary read, one write and one lock, with no quota/history/reconciliation work in that fast path. Thresholds were not weakened. Missing old Git versions were not replaced with invented baselines.

## Scope of evidence

Tests use synthetic data, simulated Google/Cloudflare boundaries and real Chromium for UI flows. No production deployment, migration, absence changes, booking changes or messages were performed. Production permissions, elapsed save latency, actual contents of the two blocked receipts and WhatsApp/provider delivery remain unverified.

The observed health state supports an attendance gate blocking allocation while no eligible intake work was claimed. It does not establish why each receipt is retained. 098d retries recognized old overlap-only failures once, broadens compatible merging and improves bounded draining; it deliberately retains review for shorter coverage and genuine conflicts. Inspect the two receipts after deployment if the gate remains.

Stapler physical storage still uses its existing operations document; true per-plan writes and the Worker relief ledger are deferred under the no-migration instruction.
