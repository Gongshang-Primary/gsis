# roster-allocation-rules-rework: owner rewrites relief allocation rules in natural language with Codex

- Status: authorised (owner 6 Nov: "i need to rework the logic for assigning relief and i wish to do so in natural language in codex. can you let codex handle that for me?"); Codex, lane R; owner talks to Codex directly; Claude reviews every PR at its exact head; owner merges.
- Reviewer/model: Claude

## Working mode
1. **Rules book first, code second.** Codex writes `docs/roster/ALLOCATION_RULES.md`: today's allocator rules in plain English, numbered (R1, R2 …), each with its current setting and the code location it comes from (shared/roster-allocation.js and related). This is the owner's starting draft, not a design.
2. The owner edits the rules in conversation with Codex. Codex restates each changed rule back in one plain sentence plus one worked example from a real school day (names may be shown to the owner; never committed), and records the owner's wording verbatim in the rules book with the date. Codex asks only when a rule is ambiguous or two rules conflict; it proposes an order of precedence and asks the owner to choose.
3. Each agreed rule gets a test named after it (e.g. `R7 daily SRE before annual R%`). The rules book is the single source of truth: code, settings labels and the "Learn about Auto Allocation" page must match it.
4. **Safety for a live system** (D1 since 6 Nov):
   - Build behind a System Config switch "Allocation rules version" (current / new); default current.
   - Shadow mode first: for each school day, run the new rules alongside the current ones on a copy, record both plans and the differences (coverage, who changed, rule that caused it) in System Health; no effect on saved relief.
   - Switch to "new" only on the owner's word after at least 3 school days of shadow results; switching back is one setting.
   - Never move manual, peer, protected, Stapler-imported, published or started relief; latest confirmed Stapler version is the timetable (tasks/roster-stapler-always-effective.md).
5. Small PRs: rules book (no code) → shadow harness → rule changes in groups. Each PR lists which rules changed. Canonical build, full CI green, exact head SHA; Claude reviews; owner merges; Claude builds the release.

## Must build on (do not redo)
- #84 ad hoc / daily SRE priority 1 and reoptimise ordering (approved; merge pending).
- #80 clock/dependency scope, #78 Stapler delink and lesson-level reconcile with mass-cancel guard.
- Open specs: roster-stapler-always-effective, roster-reoptimise-priority-adhoc, consecutive-after-gap (#74), daily relief cap (#73, Off), SRE daily priority (#14), peer R override (#64).
- Settings today (D1 6 Nov): max daily periods 8; max consecutive 5 (exclusions BLK*); daily relief cap 3 but Off; preference order annual R% → alternatives → weekly R remaining → rotation → subject match → level match (all on); SRE/FAJT restricted P0, P13-P16.
