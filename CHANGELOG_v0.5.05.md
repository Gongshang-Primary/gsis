# GSiS v0.5.05

Baseline: v0.5.04, commit b7eee7868c94d15063a88017fdf02015a468274d. This release implements the authorised TG and relief work and selected safe corrections from the external performance review. Write protocol remains 500. No live deployment or production data mutation is part of the release build.

## Q150 Teaching group class selection

Add and Edit TG share one checkbox selector for one or several existing classes at the TG's primary level. Whole level is exclusive. Changing level clears previous class selections; CCE EL keeps its dedicated whole-level rule. The former separate Source classes text box is removed.

Associations use stable class references and retain readable source labels after class renaming. Legacy references that cannot be resolved remain visible and require explicit replacement. Each TG keeps its identity, teacher assignments and single teaching load. Venue is a separate selection; selecting classes does not move classes, multiply allocations or silently inherit a venue for a new TG.

## Q151 Safe performance and reliability corrections

Contacts and Deploy exchange catalogues conditionally by content hash while checking current authority on every request. Matching catalogues can be omitted from browser snapshots; full payloads remain compatible with clients that send no hash. Pending or degraded directory views cannot validate a cached authoritative catalogue.

Layout uses a short shared cache for its existing public publication schema, keeps years and caller cursors separate, and polls visible tabs at 60 to 75 second intervals. It does not cache authenticated Contacts profiles or turn the private active-deployment feed into a public endpoint.

Receipt confirmation failures preserve the original unresolved request and restore Retry controls. Shared reads do not automatically repeat an upstream timeout; eligible fast service failures use a bounded jittered retry. Browser attempts, gateway and backend phases share trace references, including inner Contacts bridge timing and separate lock-wait/lock-hold phases. Unchanged draft projections are reused while new edits, sessions, versions and catalogues invalidate them. Index reads reuse an already checked request value where safe. Contacts marker comparisons use fresh property snapshots at both consistency boundaries. New index writes are size-checked before journal or field mutation.

The global writer lock, Script Properties leases, static-asset permission checks and embedded layout seed remain. These require measurements or a carefully validated redesign before changing their guarantees. A numeric performance gate guards the scoped settings paths introduced in v0.5.04. Production speed is not declared resolved.

## Q152 Relief planning and integration API

Deploy → Relief Settings provides a version-owned Actual/Expected teaching basis and configurable daily timetable, days per week, lunch and SIUE factors. Actual is the initial mode. Both modes use actual assigned FTT, PD and duties. The final multiplier reuses combined retained capacity from existing offload rules. Blocks deduct once after calculating relief, with a zero minimum.

Calculated quota, Block deduction and remaining quota are shown separately. Fractional results retain their precision; the UI displays up to two decimals. Missing inputs, ineligible teachers and ambiguous multiple specialist targets in Expected mode show unavailable results.

An authenticated, read-only `GET /api/relief` endpoint and signed Apps Script `relief` action expose version metadata and teacher-level `R`, `blockPeriods` and `remainingR`. These are weekly planning quotas, not period-specific availability or assigned relief lessons. Future timetable, relief-assignment and notification viewports remain outside this release.

See API_CONTRACTS_v0.5.05.md, WORKLOAD_REVIEW.md, PERFORMANCE_v0.5.05.md, VALIDATION.md and DEPLOYMENT.md for the exact contracts and remaining acceptance work.
