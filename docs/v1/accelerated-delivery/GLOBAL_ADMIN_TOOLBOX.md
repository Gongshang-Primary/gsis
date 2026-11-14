# Global Admin Toolbox

Owner request, 14 November 2026: a tenth homepage icon for Global Admin and a home for misplaced maintenance controls. This small navigation PR depends on PR145 f1efe8a687cb640dae8731fe674acb72b33e7f9b and does not change domain permissions, storage or provider configuration.

## Navigation and authority

The nine application tiles retain their order. A tenth equal tile opens the existing `/admin/` page, now titled Global Admin Toolbox, only when the current session has `core.admin` and is not impersonating. The former separate home Admin link is removed. Server Core authorization, not the tile, controls every operation. Domain Admin access alone is insufficient.

Toolbox sections: Accounts and access; System Health and backups; Scheduled service access; Decision evidence. Each has a stable hash and appears in the compact breadcrumb; reload restores the selected section. Existing private backup downloads and uncertain-operation recovery retain their operation identities.

## Supplemental-control inventory and disposition

| Controls introduced by v1 | Destination | Reason |
| --- | --- | --- |
| Global accounts, grants, suspension, preview | Toolbox / Accounts | Core-owned global administration |
| Owner health, pins, pending operations, backup/download, Drive freshness | Toolbox / System Health | Cross-application maintenance; no stale-data deletion implied |
| Roster scheduled service grants | Toolbox / Scheduled service access | Explicit Core authority; granting is not sender/scheduler cutover |
| Historical decision evidence recovery | Toolbox / Decision evidence | Core administrative recovery; F5 status remains separate |
| Contacts accepted authority/readiness, staff classifications and catalogues | Contacts / Sys Admin or Edit Info, per existing native placement | Contacts Power Users require their existing business controls; moving them to Global Admin would narrow approved authority |
| Roster layers, duties ledger, continuity/offline return | Roster / System Config and existing user ledger access | Operational configuration; not global-only maintenance |
| Deploy import/export and publication receipts | Deploy / Versions | Version-owned workflow, with existing leases and permissions |
| Layout-owned data editor | Layout native data/configuration view | Layout owns the edited fields |
| LORD classes/devices/settings and signage grants | OVERLORD / System Settings | LORD administrator workflow; no STARLORD display clutter |
| Calendar URL/connection setup, uncertain saves and maintenance | Calendar native settings sections | Calendar-owned recovery and explicit operation controls |

PR145's native-panel mounting removes detached top-bar shortcuts and appended bottom panels; this PR preserves that behaviour and the permission-hidden parking area. Controls are not globally reclassified merely because their labels look technical. No operational control is duplicated in Toolbox.

Storage inventory/pruning and protected provider setup are separately claimed functional additions. This PR does not render misleading working prune buttons. Automatic retention deletion remains unauthorised (D2 open); Drive folder sharing is owner-managed (D1 closed). F5 OPEN. Official T1B-01/T1B-02 and runtime UAT **Not tested**.

## Validation and rollback

Browser tests cover the tenth tile versus nine for ordinary/domain Admin sessions, actual Core API denial, Toolbox deep links/breadcrumbs/reload and preservation of native settings. Existing account-create/recovery and web tests remain applicable. Exact commands/results/head are recorded in the task and PR.

Reverting this navigation PR restores the old Admin label/link; no schema or data rollback is needed. Claude reviews the exact head. No merge or deployment authorised.
