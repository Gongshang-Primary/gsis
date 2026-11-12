# PR #133 review (v1 Package A: AUTHORITY_EVIDENCE_MISSING), Claude

Model: Claude. Reviewed 13 Nov 2026 (Asia/Singapore).

| Item | Value |
|---|---|
| Head reviewed | `0213160a7d45810849d5ed859818d09c55bdb4e2` |
| Base | `f7014a14b0bdcd84b6e35c4665a49d241e0981c7` (claim) |
| Verdict | **Approve** (advisory; owner merges). |

## Evidence I produced

Separate worktree at the exact head, `npm ci`, `TZ=Asia/Singapore`:

1. `tests/v1-authority-evidence-missing.mjs`: 10/10.
2. Package A isolation with `AUTHORITY_MISSING_BASE_SHA=e996dfd…`: pass (eight-path scope; Core authority/audit and old tests unchanged).
3. Unchanged regressions: seven Contacts programs 30 cases, five Core programs 26 cases, all pass.
4. `npm run build`: success, no drift. Merge-tree against origin/main: clean.
5. My PR #125 M1 probe, rerun through the real Core authority at this head:

| Contacts evidence (read) | Before (#125) | Now |
|---|---|---|
| SMC yes, EO blank, SL no | unavailable PROVIDER_INVALID retryable | deny AUTHORITY_EVIDENCE_MISSING, not retryable |
| All three blank | unavailable PROVIDER_INVALID retryable | deny AUTHORITY_EVIDENCE_MISSING, not retryable |
| EO pending only | (not probed) | deny AUTHORITY_EVIDENCE_MISSING, not retryable |
| All explicit no | deny CAPABILITY_DENIED | unchanged |
| Global Admin, all blank, publish | (not probed) | allow (Admin path independent of Contacts) |

CI: Codex reports run 43313064264 green at this head; not verified by me.

## Code notes

1. Only the adapter's own error object (`e === missing`) escapes as the new code; a provider throwing a look-alike stays `PROVIDER_INVALID`. Good defence.
2. All three fields are validated and counted before absence is reported, so a blank SMC cannot hide an ambiguous EO schedule.
3. Core change is one map entry; the failure mapper and audit projector accept it with no other edit.

## Findings

None blocking. Accepted by the merged EO plan, noted for the owner: an SMC with a blank EO record is denied even for read, which needs only SMC. That is deliberate: all three records stay required, and the go-live readiness gate makes it rare. PR #125 finding M1 is resolved.
