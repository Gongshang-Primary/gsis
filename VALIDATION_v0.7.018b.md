# v0.7.018b focused validation

Scope: two deployment items only, the Roster frontend and its shared Deploy backend. Local checks use synthetic identities or the supplied Offline JSON privately; the school file is not copied into Git or the package. No live deployment, production save or staff message was made.

## Findings

The previous Worker forwarded a backend 401 to the browser. The browser treated this as an expired session, cleared the editor, and discarded the pending imported plan. The regression check reproduces this boundary with the actual Worker, browser shell and Stapler UI. The patch returns a retryable service error while preserving genuine session expiry behavior.

WebCrypto and an independent HMAC agree for the original Unicode request in the local runtime. Production charset behavior and deployed secret/version alignment remain unverified. ASCII escaping is therefore scoped to full Stapler Save/receipt transport, and UTF-8 is explicit in the backend verifier. Signature enforcement has not been weakened.

## Checks

| Check | Result |
| --- | --- |
| `tests/roster718b-signature.mjs` | Worker signing agrees with the actual backend helper using a native HMAC service adapter; Unicode, emoji, literal escapes, Unicode keys and legacy payloads roundtrip; tampered and wrong-key messages fail; service 401 becomes 503; browser 401 and permission 403 remain distinct. |
| `tests/stapler718b-envelope.cjs` | Actual signed `doPost` accepts a bounded Unicode plan despite wire escaping, retains logical and outer size limits, rejects tampering before authority/storage, and accepts a matching receipt check. |
| `tests/stapler718b-save-recovery-browser.cjs` | Real Chromium shell/UI with actual Worker rejection and fresh disk-backed backend runtimes: imported draft retained, exact retry, lost acknowledgement, no duplicate write, Confirm, reopen, Unicode edit, Save/reconfirm/reopen, and genuine sign-out. Passed synthetic and supplied-file runs. |
| `tests/stapler718a-relief-import.cjs` with supplied JSON | All 722 final cells, 17 absent periods and 6 coverage placements match the independent export oracle; online-only teachers retain baseline; Save/reload/Confirm do not replay attendance or notifications. |
| `tests/stapler715-persistence.cjs` | School-sized compressed plan persists across fresh runtimes; failed writes, lost acknowledgements, receipt replay and corrupt-read failures are handled. |
| `tests/stapler716-canonical.cjs` | Canonical validation and editing remain bound to content, date, baseline and revisions; stale/forged markers rejected. |
| `tests/stapler718-lifecycle-persistence.cjs` | Rename/move/delete/restore and dated lease fencing retain durable replay behavior. |
| `tests/roster718-concurrency.cjs` and `tests/roster718-bootstrap-cache.cjs` | Deterministic concurrent users, current authority, stale edits, immutable cache and receipt behavior pass. |
| `tests/roster717-failure-diagnostics.mjs`, `tests/roster607-diagnostics.cjs`, `tests/roster608-diagnostic-detail.cjs` | Safe failure stage/version/reference, preverification Save diagnostics, no staff/secret logging, read-only diagnostics and old-deployment detection. |
| Existing gateway checks: v605, v701, v716 Inbox activation and v718 | Other routing, trusted inputs, request bounds and Inbox activation behavior preserved. |
| Existing Deploy checks: storage, first load, v411 recovery, v500 saves, v504 storage, v505 catalogue, v601 diagnostics and v702 backend | Explicit charset API supported by test adapters; existing Deploy behavior passes. |
| `tests/hotfix718b-package.py` | Checks two-item package, exact committed source/tag, matching generated backend, preserved other components/assets, Git patch, incremental history and checksums. Run after commit/package creation. |

The browser date-list check performs zero plan decompressions, zero quota reads and zero baseline-model reads. This confirms existing behavior; it does not measure or promise live latency. No broad performance refactor is included.

## Reproduce

Run commands from the repository root with its existing npm dependencies. Browser checks use Playwright and Chromium; set `ROSTER_TEST_CHROMIUM` when necessary. Pass the local school JSON path as the optional argument to the import and browser tests. Packaging uses `python3 scripts/build-718b.py`, after committing and tagging `v0.7.018b`; run `python3 tests/hotfix718b-package.py` afterward.

Ponytail/Pstack review kept the transport fix at its shared boundary and narrowed ASCII escaping after review identified possible size inflation for unrelated operations. Independent review supplemented these workflows. Thermonuclear was unavailable and was not run.
