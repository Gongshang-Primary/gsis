# PR #125 review (Claude): v1-contacts-t1b bounded Contacts read library

- Head reviewed: b4cbec95b3 (codex/v1-contacts-t1b). Reviewer: Claude (independent exact-head review named in the task; ChatGPT coordinates v1).
- Verdict: **approve**.

## Evidence
- CI at the head: full-suite success; regression shards 1-4 success.
- Local, TZ=Asia/Singapore, T1B_BASE_SHA=620010fb85c4d90b498d15724250af1d86a469c5: all 7 `tests/v1-contacts-*.mjs` pass; all 5 unchanged `tests/v1-core-*.mjs` pass.
- Diff: exactly the 14 allowlisted paths. No production code, Core code, generated output, CI or dependency change. Merge-tree against main: clean.

## Findings (none blocking)
1. Fail-closed throughout: exact-key schemas, bounded walk (depth, nodes, bytes), timeout via race with cleared timer, every unexpected error maps to `UNAVAILABLE`/`PROVIDER_INVALID`. The Core adapter requires exactly one accepted record per authority role and never infers authority from names or catalogue labels.
2. Watch for T1C (integration): the reader keeps per-instance rejection maps capped at 128 staff/profile streams and 8192 identities, and fails explicitly when full (documented, no silent eviction). A school of about 150 staff with 3 profiles exceeds 128 streams. The integrating code must create a reader per evaluation or request, not one per Worker isolate, or authority reads will start failing closed for everyone. Record this in T1C's design.
3. `recoverSnapshot` correctly does not move current watermarks or invent an `asOf`.

## For the owner
Safe to merge: isolated library, no live effect. "merge 125" when ready.
