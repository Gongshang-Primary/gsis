# Validation for v0.9.3a

- Final complete current regression gate: **694/694 programs passed**, using real Chromium where browser tests require it. The package verifier is checked separately, giving 695 current program checks including packaging.
- LORD suite: **33/33 check programs passed**; LORD remains v0.9.3.
- Apps Script syntax: **163 .gs files parsed as ES2020**. Generated-source and frontend archive parity checked.
- Independent review found and verified fixes for retained date scopes, accepted receipts after refresh failure, empty peer selections, explicit instruction review after source changes, and cleared review state in the full-day shortcut.
- Browser checks cover held timetable/report reads, immediate full-day submission, cached tomorrow projection, latest-date/account fences, unchanged-source DOM and focus retention, deferred peer requests, current availability checks, atomic rejection/commit, exact receipt retry and pending peer indicators.
- Desktop and 390px mobile screenshots inspected using synthetic staff. The form and chooser have accessible labels/focus, usable touch controls and bounded timetable scrolling.
- Current source and archive checksums are verified by the component patch builder. The committed package also carries its exact source commit and incremental Git bundle against v0.9.3.

The first full pass exposed outdated autosave/bootstrap fixtures, a diagnostic build mismatch and a date-change busy-state gap. These were corrected and the whole gate rerun. One initial browser timeout did not recur with the final gate's 90-second per-program ceiling. The existing seven historical test exclusions are unchanged. Raw gate results are under verification/93a-node-results.json and verification/93a-node-summary.json.

Tests use synthetic records and mocked external boundaries; no live school data was changed and no WhatsApp/email was sent. The observed production 26-second delay was not reproduced. The evidence proves local cached rendering before held network responses, not a production latency guarantee.
