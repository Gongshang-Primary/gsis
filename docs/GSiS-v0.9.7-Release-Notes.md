# GSiS v0.9.7

This full release builds on the corrected v0.9.6 package and retains the v0.9.5a STAPLER changes. It prepares GSiS for Workers Paid while keeping idle work small. Installation and live acceptance are separate from local verification.

## Operational backend

Roster and Deploy keep their existing staff URLs. Their authenticated operational requests use a private GSiS operations Worker through service bindings. Server-signed envelopes preserve verified identity, origin and the original request identity; each domain still checks its current access authority. Active D1 ownership and the existing legacy-writer fence remain mandatory. Failed or uncertain saves do not fall back to a writable Google copy.

The private Worker is an additional deployment. Contacts, Calendar, LORD, Venues transactions, physical venue metadata and Google email adapters retain their established ownership. Deploy/Roster Google adapters remain installed for those integration boundaries and migration. This is not a replacement of every Apps Script service.

## Timetables and storage

Private compressed timetable parts are reused by source revision and permission scope. Durable changes request background preparation. The minute scheduler checks compact due-work markers instead of loading the complete timetable store on idle beats. An on-demand reader can repair a missing or corrupt derived part with one bounded rebuild; source changes during repair still prevent stale promotion.

Venues receives permitted occupancy, including the occupying staff member's name. It does not receive SMC drafts, medical/absence evidence, private staff contact details or unrestricted timetable payloads.

Daily R2 cleanup keeps the existing conservative limits: only generated timetable parts, at least 30 days old plus a 24-hour quarantine, at most 50 listed and 10 deleted per run. Current scoped manifests, source timetable objects, saved plans, media and audit objects are protected. Recovery pauses cleanup. Old derived parts can be rebuilt from retained source data after a D1 restore.

## Background work and health

Notifications, timetable preparation and audit exports use bounded Queue wake-ups backed by durable D1 job state. A Queue message is a prompt to check that state, not another copy of a timetable or an instruction to repeat a save. Leases, generation checks and bounded retries protect against duplicate or stale delivery. Exhausted work is parked for administrator review; uncertain provider sends retain their existing reconciliation rules.

An administrator-only System Health page shows safe job outcomes, last successful runs, pending work and cache/cleanup state. Diagnostic records use fixed categories and references, not private payloads or raw exception messages. Failure history is bounded to 200 entries and seven days. Repeated unchanged idle summaries are written at most once every five minutes. Real CPU and billed usage remain in Cloudflare Metrics.

## Recovery and receipt management

Native D1 Time Travel supplies database recovery. Where configured, System Health records an actual native bookmark before an upgrade or migration. Recovery is an operator procedure: pause all writers, incoming processing, consumers and cleanup, preserve external delivery evidence, restore, rebuild derived caches and reconcile notifications before reopening work. No automatic restore or browser restore action is added.

Completed status receipts can be dismissed or cleared from the current user's view and reopened through History. Unresolved work remains visible under Needs attention. Dismissal does not withdraw an absence or remove the durable audit trail; a changed receipt or newly pending/review state becomes visible again.

## Maintenance corrections

A partial physical-room registry row now retains the saved room type when that field is absent, so its authoritative short label remains visible. The component-package verifier runs Roster/Deploy-specific checks only for packages containing those frontends; isolated packaging fixtures execute the actual bundler and delivered-Worker checks.

## Installation and verification

Follow [the v0.9.7 deployment guide](v097/DEPLOYMENT.md), [recovery procedure](v097/RECOVERY.md) and [validation record](v097/VALIDATION.md). The suite includes nine frontend ZIPs, six complete Google adapter/backends and two self-contained Worker files. The packaged Roster and Deploy Workers are bundled with their dependencies, retaining the corrected v0.9.6 deployment packaging.

No production deployment, migration, restore, message dispatch or destructive cleanup was performed while preparing this package. Local checks cannot establish live credentials, D1 ownership, third-party provider delivery or production CPU usage.
