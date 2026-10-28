# GSiS v0.9.4 verification

Verified locally on 25 October 2026. No production deployment, production data migration, real notification send or paid-plan change was performed.

| Gate | Result |
| --- | --- |
| Root regression programs | 718 passed; zero remaining failures, blocked dependencies or timeouts |
| LORD checks | 33 programs passed, including real Chromium booking/reference/return flows |
| Complete installation archive | 30 declared files passed inventory, source parity, hashes, complete runtime assets and offline document checks |
| Apps Script syntax | 176 `.gs` files parsed; the deliberate unsupported-syntax regression was rejected |
| D1 storage and adapters | Real SQLite transaction, conflict, rollback, migration and receipt regressions passed |
| Worker deployment bundles | Self-contained ESM built from canonical modules; dashboard text/module bytes match |
| Operator UI and manual | Desktop and mobile browser checks passed, including no page overflow, keyboard controls, access denial and private export behavior |
| Archify/Draw.io | Archify showcase render, browser and visual checks passed in design mode; 24 committed source ranges independently verified; Draw.io structural checks passed |

## Executed verification

The broad root run used `python3 scripts/verify-release.py --skip-package`, with the known Chromium executable and a 90-second bound per program. After adapter and generated-file updates, affected/new scripts were rerun. The final merged result is 718/718; the first integrated pass's failures are not reported as passes. Evidence is retained in `verification/94-node-results.json`, `94-node-summary.json` and `94-final-reruns.json` in the source package. The separate archive gate is `python3 scripts/verify-full-package.py`.

`python3 lord-suite/tests/run_all_checks.py` passed all 33 programs with the configured Chromium executable. Its result and source hashes are retained in `lord-suite/tests/all_checks_results.json`. Browser fixtures use synthetic data. Real SQLite tests exercise transaction behavior rather than assuming a mocked batch is atomic.

Important exercised boundaries include:

- Concurrent durable absence capture invalidates a planner's prepared commit. Duplicate capture does not manufacture another revision. Full-day capture reads no archived timetable object.
- Relief-required changes preserve the absence ID; stale absence tokens reject the edit. Old successful receipts replay after migration.
- Attendance survives invalid or stale optional peer/instruction evidence. Processing, review, colleague-awaiting and approved states remain distinct.
- Peer approval with missing or expired Deploy quota cannot change state, audit, assignments or receipts. The original request succeeds once after current quota is restored.
- Atomic D1 writes preserve excluded inbox records and reject unseen concurrent changes. Interrupted multi-chunk writes roll back together.
- Migration import can resume; stale source digests cannot fence/activate. Only pre-active imported scopes can restart after verified private archive evidence.
- Immutable timetable content is written before manifest publication. Stale writers cannot replace newer references; confirmed projections exclude drafts. Warm reads avoid Apps Script and unchanged R2 payload reads.
- Revocable Venues guards reject a late writer after recovery. Unverified occupancy stays unavailable for booking; explicit Refresh performs source recovery.
- Current human decisions survive automatic allocation. Public links retain recipient, purpose, expiry and acknowledgement scope.
- Sender reservations and cooldown are shared, ambiguous prepared sends are not automatically repeated, and reordered callbacks retain authoritative delivery progress.
- Deploy retains publication isolation, canonical calculations, exact retry receipts, field conflicts and ordered catalogue/Layout handoffs.

## Limits of this evidence

These results do not establish live peak-hour throughput, Worker CPU usage, account-wide free-tier headroom, production credentials, provider delivery or a completed school cutover. Measure those in the controlled installation acceptance sequence. The original Venues screenshot's exact upstream cause is not established; the repaired refresh/diagnostic path makes it observable without treating unknown occupancy as free.

Operational writes are entity diffs. Ordinary Roster reads still load operational collections, excluding inbox content; they are not all date-indexed single-record reads. Timetable hydration is scoped to relevant dates and immutable objects are cached. Deploy permissions have a strict 60-second cache age; Roster uses bounded trusted reference age. Expired authority fails closed.

The WhatsApp peer button template was rechecked during release preparation and remains PENDING. The runtime selects it only after exact live approval and otherwise retains approved v1. No delivery claim is inferred from a local template test.

The final architecture references implementation commit `13ea5104fa2da338aa0757033aab1b8825256d4f`. [Local source evidence](../architecture/v094-source-evidence.json) records exact committed file/line ranges, Git blob identities and SHA-256 hashes. Archify 3.1.0 requires a hosted repository address for its native source-evidence mode; this repository origin is a local recovery bundle. The artifact therefore uses the valid design-mode renderer with independent local Git evidence, without an invented remote or forge links. [Documentation verification](documentation-verification.json) records the final renderer hash, gates and screenshot inspection. These checks do not establish live production configuration.
