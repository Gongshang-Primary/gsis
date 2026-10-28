# Reviewing and continuing GSiS 0.9.9

Start with `HANDOVER.md`, `REQUIREMENTS_STATUS.md` and `ROSTER_WORKER_ROADMAP.md` in this directory. The release is based on Calendar Q commit `50c977d79c9756dfdbee91f2922f0cd89ab6e903`, which follows the P full suite. All current production component labels are harmonised to 0.9.9; the preparation package is separate and keeps its compatible wire protocol.

The review archive retains current source, meaningful tests and required comparison fixtures, build/verification tools, current operating instructions, the Q-to-0.9.9 patch, and selected verification evidence. Its inclusion/omission index identifies pruned historical delivery material by path, size, hash and reason. No production record, Google history, D1/R2 object or Git history is pruned by packaging.

## Review priorities

1. Confirm production Roster still uses the Google recovery profile. A Worker route or durable accepted receipt must not be mistaken for D1 operational authority or an applied absence.
2. Check Calendar source commit, queue receipt, change invalidation and provider sync as separate states. Optional push is explicitly enabled only after its setup; `CALENDAR_SYNC_CONTINUE=false` is retained.
3. Exercise table stability with delayed responses, an open draft, a newer local save, a role change and a row growing above the viewport. Preserve meaningful current contract tests rather than restoring obsolete policy expectations.
4. Inspect the optional change journal's crash/replay, authorization, pruning and disconnected-client boundaries. A generic invalidation is not proof that an uncertain Google write committed.
5. Confirm venue diagnostics expose only fixed safe codes/messages. Catalogue lookup is not availability or a reservation.
6. Verify native preparation remains administrator-only and shadow-only. Its source freshness, Calendar parity, staff identity and production-consumption gates remain explicit.

## Verification and recovery

Use the release's `VALIDATION_v0.9.9.md` for exact completed commands and limitations. Run with `TZ=Asia/Singapore`; Chromium fixtures use `ROSTER_TEST_CHROMIUM` when a browser executable is supplied. Locked dependency reuse and a new network dependency installation are different claims.

The full-suite verifier checks packaged bytes against canonical component outputs and manifests. In a trusted checkout it also checks Git provenance and the parent patch. A source archive extracted without Git can verify its supplied inventory and rebuild component contents, but cannot independently prove the history it was given. The recovery script records that limit.

The attached P rollout report is operator-provided live evidence. Local tests of 0.9.9 do not prove deployment, live Google throughput, notification delivery or production cutover. Follow the handover's remaining operator checks without replaying real messages or deleting unresolved receipts merely to obtain a clean counter.
