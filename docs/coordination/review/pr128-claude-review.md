# PR #128 review (v1 EO authority readiness plan, docs only), Claude

Model: Claude. Reviewed 13 Nov 2026 (Asia/Singapore).

| Item | Value |
|---|---|
| Head reviewed | `74df90ae8c7bbb03234b4f2db8f7886dbb6d2ecd` |
| Base | `61c628f13ff9edbacabd9a7f2044bb25b7594915` (claim; equals current origin/main) |
| Verdict | **Changes requested** (one medium addition, M1). Otherwise sound. |

## Evidence I produced

1. Reran the task record's documentation check at the head: exact two-file scope and relative links pass.
2. `git diff --check`: clean. `git merge-tree` against origin/main: clean.
3. Verified the plan's key legacy claim in `shared/teaching-rules.js` `resolve`: when a Role catalogue is loaded, `EO Appt Level` is overwritten from the Role rule, and set to blank when no rule matches. Confirmed.

Not run: build or test suites (no build input changed). CI: not verified by me.

## What the plan gets right

1. **It corrects my earlier recommendation.** I proposed storing EO through the EO Appt Level column. That column is derived from Role and recalculated, so a per-person EO choice there would be wiped. The plan keeps the canonical Contacts `eo` field as the single truth and treats EO Appt Level as presentation. Correct.
2. MKE handled precisely: EO by employment, MK section, no primary-school EO tag, accepted SMC=false required, MKE+SMC flagged as an inconsistent record rather than a new rule.
3. The new denial `AUTHORITY_EVIDENCE_MISSING` (403, non-retryable) is narrow: timeouts stay 503, stale stays 409, malformed stays a provider error. No blanket remap.
4. The readiness scan must fail as "incomplete" on any truncated or stale page, never as an empty success list.
5. Owner classifications are recorded as categories only; individual records still need acceptance.

## Findings

### M1 (medium, add before implementation scope): self-acceptance of authority records

Contacts Power Users confirm and accept each staff member's SMC, EO and School Leader records. These three records grant Deploy edit and publish rights. The plan does not stop a Power User from accepting their own records, or from accepting SMC=true for anyone without a second person.

Failure case: a Power User sets and accepts SMC=true and EO=true on their own record, then edits and publishes Deploy plans.

Required addition to the plan:
1. A user may not accept authority records (SMC, EO, School Leader) for their own Staff ID.
2. Accepting SMC=true or School Leader=true needs Admin approval, matching the existing rule "Changes to Contacts require Admin approval". EO may stay with Power Users.
3. Each acceptance records proposer, accepter, time and operation ID in the security audit.
4. Tests: self-acceptance denied; SMC=true accepted without Admin denied; audit fields present.

### L1 (low, owner decision worth taking now): inactive staff in the go-live gate

The readiness gate covers every staff record, including inactive and historical ones. If Contacts holds many former staff with blank fields, go-live waits on clearing people who will never log in. The plan already says a different population rule needs an owner decision. Recommend the owner decide now: either include all (safest, more work) or let a Power User bulk-accept "no authority" for inactive staff as an explicit, audited act (never a silent default).

### L2 (low): plan date

The plan and task record are dated 13 Nov; one evidence row cites main at `b85304c`. Fine as provenance; just confirm the final base in the PR body.

## Next action

Codex adds M1 to the plan (Contacts acceptance rules and tests) and posts the new head. Owner answers the plan's two open questions and, if willing, L1. Implementation stays blocked until the coordinator scopes it.

## Re-review at `ba7f6d746955949922343f521635ca8315379277` (13 Nov 2026)

**Verdict: approve** (advisory; plan only, implementation stays blocked until the owner answers and the coordinator scopes it).

Changes since 74df90a: one commit, the same two files, 18 added lines, nothing removed.

1. M1 resolved. No self-acceptance for any of the three fields, including Admins and aliases of the same Staff ID; ambiguous linkage blocks. SMC=true and School Leader=true need non-subject Admin approval bound to the exact proposal; a changed proposal voids it. Audit of proposer, accepter, time, operation ID and approver, committed with the acceptance; audit failure fails the acceptance. Matching future tests added, asserting persisted fields.
2. Rerun at the head: two-file scope and links pass; `git diff --check` clean; merge-tree against origin/main `61c628f` clean.

Note (low, no change needed): "no bootstrap bypass" means an Admin can never approve their own SMC or School Leader record. That is fine because Admin access does not depend on Contacts. Keep at least two Admins so one is always available to approve the other's subject records and to cover absence.

L1 (inactive staff in the go-live gate) still awaits the owner's choice.
