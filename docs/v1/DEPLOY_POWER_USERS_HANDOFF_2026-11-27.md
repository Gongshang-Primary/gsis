# HR Settings — additional Deploy Power Users

On 27 November 2026 the owner requested an HR Settings panel for assigning Deploy Power Users beyond SMC membership. The v0.9 implementation gives an Admin a staff picker and grant/removal controls. The selected active staff member receives Deploy editor access. SMC classification, administrator access and permissions in other applications have independent sources.

## v1 implementation handoff

Core evaluates school-scoped account grants in `v1/services/core/service.mjs` and derives Deploy permissions from accepted Contacts facts. Retain the existing SMC/EO/School Leader rules. Add an explicit Deploy editor grant as a second path to read and edit. Keep publication subject to its own capability. Contacts owns the permanent Staff ID and active identity linkage. Core owns the additional grant, revision and revocation. Use the existing HR Settings navigation in `v1/web/shared/deploy-ui.js` and expose the panel only to administrators backed by the grant-management API.

Verify an active non-SMC colleague can edit after a grant, loses access after revocation or deactivation, and cannot delegate access, publish on the strength of this grant alone, or manage Contacts or Roster. Reject a mismatched school, stale revision or ambiguous identity. Exercise ordinary writes, cached reads, previews and impersonation. Existing SMC users must retain their original permissions after an explicit grant is removed.

This document records the owner request and the v0.9 implementation decision for the v1 coordinator. v1 runtime implementation and verification are pending.
