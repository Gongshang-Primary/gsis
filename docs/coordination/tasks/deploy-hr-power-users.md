# Deploy HR Settings — additional Power Users

Claimed by Codex on 27 Nov 2026 SGT. Branch `codex/deploy-hr-power-users` starts at `07b4ead55668459a49815794ae527255662134d5`. Owner requested a v0.9 hotfix and a v1 information handoff.

Add an Admin-managed panel under Deploy HR Settings. Additional named active staff receive existing Deploy editor access. Keep SMC membership, Contacts access, administrator powers and other applications independent. Verify grant, revoke, stale changes, inactive or ambiguous identities, and the server-side management boundary. Cover Google and D1 access routes.

## Implementation and delivery

The panel uses a signed Contacts adapter shared by the Google and D1 Deploy paths. The Contacts backend creates the `deploy_power_users` sheet on the first grant and writes the staff ID, enabled state, revision, actor and timestamp. A revoke retains the row. Concurrent changes are revision-checked. The additional editor role is projected only for Deploy after a unique, active staff/account match. An Admin grants or removes access. Existing SMC and Admin access continues through its existing source.

Install the Contacts Apps Script backend first, then the Deploy Apps Script backend, then the operations Worker if it serves Deploy, then the Deploy Pages frontend. Retain the existing endpoints, script properties, Worker bindings and flags. The new backend advertises the panel to administrators. Verify one owner-selected staff member can edit after a grant and loses that access after removal. Rolling back to the previous frontend and backends leaves the grant register intact. No live grant or deployment was made by the builder.

v1 handoff: `docs/v1/DEPLOY_POWER_USERS_HANDOFF_2026-11-27.md`. Its build omits the v0.9 workbook panel until v1 has its own Core grant API.
