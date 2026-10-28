# GSiS Suite v0.9.5

This full-suite maintenance release restores administrator booking in LORD, clarifies OVERLORD controls, uses explicit periods when managing absences, and makes the live physical room register authoritative for venue metadata.

## LORD and OVERLORD

1. Refresh verified administrator permissions when opening booking so a temporary lookup failure does not remain a cached non-admin session. Keep recipient and acting administrator separate in the booking and audit.
2. Remove the LORD home-page WhatsApp notifications link while retaining operational delivery.
3. Give background-task details their own layout space and keep the incident summary compact.
4. Align System settings and remove obsolete individual WhatsApp consent controls under the existing school-managed notification policy.

## Roster

Manage my absences and Manage school-wide absences use explicit periods with their timings. Existing coverage is preserved when a record opens; edits remain subject to permissions and conflict checks.

## Venues and shared room metadata

The canonical `Venues` tab supplies physical metadata instead of stale room arrays inside an immutable Deploy publication. Publication identity and effective dates still come from Deploy; timetable occupancy still comes from Roster. The source revision participates in cache keys so corrected room data cannot be masked by the old publication-only cache.

Facilities administrators can edit room metadata in the viewport and select multiple room owners with checkboxes. Layout, Deploy and LORD consume the canonical room revision. Existing unit identities, bookings and access grants are preserved; routine metadata editing is not a unit-renaming or booking-transfer tool.

Safe source error codes survive backend response handling so setup, authentication, stale-source and pending-source failures can be identified. Raw service exceptions and secrets remain private.

## Deployment

Use the complete matched package and the [v0.9.5 runbook](v095/DEPLOYMENT.md). Keep existing service URLs, IDs, secrets and fences. The separate Venues manual hotfix is superseded. Do not repeat D1 migration on an already active installation.

## Validation

See [the validation record](v095/VALIDATION.md) for checks actually run. Local tests do not establish live school data quality, Cloudflare bindings, provider delivery or a completed production rollout.
