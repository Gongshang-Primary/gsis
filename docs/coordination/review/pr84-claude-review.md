# Claude review of PR #84 (ad hoc priority in reoptimise) at exact head 5333110 (6 Nov)

- Verdict: approve for merge (owner decides). CI full-suite green at 5333110 (run 42101003173, 1,017/1,017 Node, 40/40 LORD). Claude locally: 9 changed/new programs plus clock-minute, day-transactions and remove-why-save pass; canonical build clean; merges cleanly into main.
- Checked (shared/roster-allocation.js):
  - `priorityOne` = daily SRE or `adhocPriority` (explicitly activated teacher outside every linked baseline identity, any employment); used by ranking, capacity (period count, not weekly R), manual ranking and idle explanations ("Activated ad hoc relief; priority 1").
  - Reoptimise cost vector: coverage first, then priority-1 use, then fairness/preferences, then a change cost (keeping the previous assignee costs less) → existing drafts move to ad hoc teachers when that improves priority-1 use, and otherwise stay. Manual/peer/protected cells untouched (existing protections); caps, activation window and identity checks kept.
  - Stored R history/entitlements unchanged (priority does not rewrite annual R).
- Risk (not blocker): non-SRE staff activated as ad hoc outside the baseline also become priority 1 (owner intent "SRE and ad hocs for the day prioritised above all"); confirm this matches how the school uses ad hoc activation.
- Not in v0.9.9n; goes into the next release (o) with #83 after its review.
