# PR #134 review (v1 Packages B–D designs and results index, docs only), Claude

Model: Claude. Reviewed 13 Nov 2026 (Asia/Singapore).

| Item | Value |
|---|---|
| Head reviewed | `b0abd003fceb59b4a8dd21904049f177b53c935a` |
| Base | `a03a3323570922fa642df84f2b04d28e0de39eb4` (claim) |
| Verdict | **Approve as design documentation** (advisory). Two findings to settle before any B or C implementation scope. |

## Evidence I produced

1. Five files, all under `docs/`. No code, tests, CI or config.
2. `git diff --check`: clean. All relative links resolve. Merge-tree against origin/main and against PR #133: clean.
3. Read all three designs in full. Each stays design-only, claims no durability, chooses no database, and keeps F5 open.

## What is right

1. B: one Contacts-owned transaction for fact, revisions, approval fence, audit and operation result; no self-acceptance by permanent Staff ID; non-subject Admin approval bound to the exact proposal; MKE+SMC rejected at commit, not warned after.
2. C: inactive staff do not block; unknown status does; reactivation invalidates; one reader per staff request (resolves my #125 L1).
3. D: honest about what audit cannot recover today, with six concrete counterexamples. Keying evidence on the existing eventId avoids widening the audit projector.

## Findings

### C1 (medium, simplify before C is scoped): the readiness scan is built for a scale the school does not have

Package C specifies a manifest, root digests, owner-authenticated page cursors, page digests, ordinals, a 2048-entry cap and a 120-second budget, to read a directory of roughly 150 people across service boundaries. Contacts owns the data. A readiness check run inside Contacts' own store, as one consistent read, returns every active staff member and their three records together. That removes the cursor, page and manifest machinery and most of its failure modes. Keep what matters: explicit active status, unknown status blocks, one common evaluation time, and the population/authority epoch recheck at cutover.

Recommendation: the coordinator rescopes C as an owner-side query plus epoch recheck, and keeps the paginated protocol only if a measured directory exceeds one bounded read. This follows the repository's own Ponytail rule: remove machinery the current requirement does not need.

### B1 (low-medium, owner choice): a Power User can remove SMC alone

The B matrix lets a Contacts Power User accept SMC=false or School Leader=false without Admin approval. One Power User can therefore strip every planner's SMC and stop Deploy editing school-wide. It is audited and reversible, so it is not a security breach, but it is an availability risk. Options: require Admin approval for SMC and School Leader changes in both directions, or keep it and alert Admins on every removal. I recommend Admin approval both ways; the volume is small.

### L1 (low): owner decisions the designs depend on

Retention periods for acceptance audit, operation deduplication and decision evidence are owner choices, flagged in B and D. Nothing to do until a writer is scoped.

### L2 (low, advisory): documentation volume

These three designs total about 280 lines for work not yet scheduled. The quality-gate policy asks the owner to review gate usefulness after two v1 tasks; that point has now passed (T1A, T1B, Package A). Worth doing before the next scope.

## Next action

Owner decides B1 and whether to rescope C per C1. ChatGPT scopes the next isolated task after those answers. No implementation is approved by this review.
