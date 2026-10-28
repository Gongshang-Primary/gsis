# GSiS v0.4.10 — 29 September 2026

Release authorized by “commit next ver” at 05:54 Singapore. Built from v0.4.09 c173132 and the reviewed pending refactor. This is a source/package release; no live software or production data publication is performed.

| Queue | Release disposition |
| --- | --- |
| Q79 Contacts save resilience | Immutable request ID and serialized payload survive unknown outcomes. Conflicting edits, reload and sign-out stay blocked until resolved. Up to three receipt checks within 15 seconds, with no automatic write replay. Confirmed saves unlock the editor. A failed display reload remains clearly confirmed. Gateway writes allow 60 seconds; browser writes allow 75 seconds, including identity/response overhead. Safe timeout/HTTP/invalid-response diagnostics. One-time backup preparation moves outside normal save latency. |
| Q80 Audit scrolling | Audit table and expanded details grow naturally. The document owns vertical scrolling. Contacts Sys Admin retains its bounded scrollbar. |
| Q81 Concurrent-user reliability | Fresh role checks no longer wait for unrelated Contacts data recovery. Normal Contacts writes no longer create the full-sheet backup while holding the writer lock. Existing field merges, conflict rules, lock bounds, journals and receipts remain. Live capacity, lock profiling and reference 8c201d4b remain open. |
| Q82 First load | Short shared data caches, bounded chunk fallback and mutation invalidation. Every request still checks current roles. Initial Deploy sign-in reuses eligible staff data; explicit Refresh remains fresh. Published Contacts teaching data uses two backend executions instead of three. |
| Q83 Audit speed/reliability | Indexed summaries remain 40 events per page. Index reads reduce from three to two on the normal path. Fix loading stalls when switching versions; isolate cached data by authenticated session; reuse event details across rerenders; keep rows visible during Refresh. Add safe phase diagnostics and strengthen pending-write read fencing. |
| Q84 Sys Admin SMC wording | Display SMC in badges, role checkbox, help and empty state. Stored KP tokens, kp API, memberships, current grants and permissions are unchanged. |

Deploy write protocol is **410**; its acknowledgement handler retains the direct field-delta update path. Outdated Offload help now points to the established Workload targets and bands. Install the matching suite and backends. Layout geometry, workload rules, teaching assignments and live membership data are unchanged by this release.

## Required upgrade step

After replacing Contacts source, run `prepareContactsPerformance410()` once in the Contacts Apps Script editor before reopening editing. It reuses the existing value-migration backup, or creates it once. It does not change contact values. A missing backup blocks a new existing-row edit before contact data is written. An already journaled original retry can still recover; pure additions keep their existing append-only path. Never delete existing backups or clear pending markers.

## Open live verification

- Q74: complete a genuinely new, authorized contact save through the installed app; the earlier manually inserted contact must not be re-added.
- Q79/Q83: measure first-save, first-load and Audit latency after installation; local fixture success is not a production timing measurement.
- Q81: use two real identities to verify separate edits, conflicting edits and recovery. Correlate 8c201d4b with its full error/gateway log. No concurrent-user capacity guarantee is claimed.
- Full-version startup still reads the complete version document before omitting paged Audit in the response. A future scoped snapshot projection requires preserving conflict notices and other derived fields.
