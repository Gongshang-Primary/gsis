# Remaining decision after v0.7.10

When an Admin changes No Relief Required subject rules, should the change also update already saved but unpublished absences?

Current v0.7.10 behavior is conservative and explicit: new absences capture the current policy; existing absences retain their captured rules, including when edited. Legacy absences use the legacy exact exclusions. The local instruction preview uses the same captured/effective policy as the backend, and stale revisions still require review. No published snapshot is rewritten.

A later change to retroactive behavior requires a defined review and reconciliation rule. This is a product decision, not a hidden implementation failure.

Live follow-up: install the package, apply the chosen WhatsApp and scheduled flags, verify actual signed callback account identity, wait for the four Pending templates to become Approved, and run the school's authorised test. The build alone cannot verify live delivery or production latency.
