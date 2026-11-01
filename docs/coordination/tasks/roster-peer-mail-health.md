# Peer-mail job health (row P)

Model: Codex. Owner approved 31 October and assigned takeover 1 November 2026.

Product merge is held until Monday 2 November 2026 08:00 SGT. Main 84a71b5 remains the Sunday 19:00 cutover source. Claude reviews the exact final head; owner merges. No deployment, provider submission or live record/settings change is part of this task.

## Scope and plan

Reproduce reviewed uncertainty being classified as failure and repeated failures for unchanged unreviewed evidence. Preserve exact uncertainty/provider evidence and never resend uncertain mail. Record a new health observation once per evidence fingerprint under the existing transport/D1 lock, retain uncertainty and review counts, and keep one persistent SMC alert. Worker health uses the new observation count when available without reinterpreting legacy disjoint counts.

Investigate full Google operations reads on idle drains. A bounded, operations-version/dirty-fenced idle hint may avoid repeated full reads only after a confirmed no-pending-proposal scan; any changed version, missing hint, changed mail evidence or due work uses the existing full/current claim and final-send checks. D1 keeps its primary idle probe and guarded claims.

Verification: failing behavioral regressions first, rebuild all 18 components, affected notification/review/idle/recovery checks, full exact-head Node/LORD CI before PR, then Claude review. Review metadata is independent from outcome evidence. No schema activation, authority change or automatic retry of uncertain submission.

## Implementation and evidence

Prepared on exact main 84a71b5, then rebased onto held weekly-R head (local4a9ae52, remote05e187d; depends on inactive PR38 then weekly-R). Generated Worker outputs were rebuilt from canonical sources after conflict resolution, retaining F and quota health controls. Node build precedes test after each switch/rebase.

Google returns disjoint uncertain/reviewed counts as before, plus newUncertain for new evidence. Its provider-fingerprint health receipt and bounded no-pending-proposal hint are retained under UserLock. The D1 model honors the same imported review proof, stores the same health observation, and its primary SQL probe compares the exact observed evidence before bypassing claims. A reviewed open alert still enters maintenance once to resolve; changed evidence reopens its single alert. Job summaries contain counts only.

TIMEOUT investigation: idle Google dispatch previously unconditionally read/validated the entire operations document before checking whether peer work exists. The new version/dirty-fenced hint avoids that read for five minutes after a verified empty proposal scan; missing, changed, dirty, future-dated or expired hints fall through. Full claim/current Contacts/final provider fences remain unchanged for real work. Live timeout rates cannot be measured without deployment; this task performs none.

Existing idle fixtures now seed explicit health observations for previously handled uncertain rows, retaining every no-hydration/index/unchanged-head assertion. The new real SQLite scenario separately proves unobserved legacy uncertainty enters once, records its observation, and then stays idle. The legacy Google delivery fixture supplies its existing production SHA-256 digest helper, while retaining all send/claim/uncertainty assertions.
