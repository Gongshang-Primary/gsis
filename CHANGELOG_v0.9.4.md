# GSiS Suite v0.9.4

25 October 2026. All nine viewports, six Apps Script packages and the scheduled Roster Worker use 0.9.4. This is a coordinated suite release; source and runtime documentation are packaged together.

## Changes

- Roster and Deploy can become the sole Worker/D1 operational authorities after verified import and a durable legacy writer fence. Record changes, revision checks, retry receipts, audit and notification intent share guarded database transactions. Legacy copies cannot silently resume accepting changes.
- Absence capture remains independent of allocation and delivery. The transport preserves the expected absence token; changing relief requirements updates the original absence. New durable captures invalidate in-flight planner commits. An uncertain response retains the same request identity for recovery.
- Peer proposals, replies and indicators use Worker operations. Processing, waiting for a colleague and approved cover remain distinct. Accepted human arrangements are protected from automatic allocation; SMC overrides retain attribution.
- Baseline and suspended timetable parts use private, content-addressed compressed R2 objects and D1 manifests. Warm reads compare trusted source versions and reuse unchanged parts; new immutable content is written before publishing its reference. Browser IndexedDB remains a local projection. Drafts, confirmations and daily publication retain separate access rules.
- Deploy preserves the existing field rules, in-force publication identity, deltas, leases and conflict audit. Fresh Contacts approval remains required for publication. Catalogue and Layout delivery use durable ordered handoffs; a slow external service does not undo the committed publication.
- WhatsApp claim/result, pacing, cooldown, callback and inbox state use D1. Prepared sends with uncertain outcomes are not automatically repeated. Email uses a signed Google send-only adapter. Delivery reports are privately archived in R2 and downloaded through an authorised route.
- Peer request template gsis_relief_request_v2 uses four body values and a Review request button. Meta still reports PENDING. Exact live approval is required before automatic selection; approved v1 remains the fallback.
- Venues Refresh now requests verified source recovery. Source codes and date-specific coverage reasons reach the frontend. Unknown occupancy remains unavailable for booking. Roster and Deploy publication use durable, revocable Venues coordination fences.
- The GSiS Roster title is an accessible Home button using the existing navigation and unsaved-edit guards.
- The package includes the Archify technology map, editable Draw.io source, responsive capability/user manual, competency matrix, setting ledger, cutover/rollback runbook and authenticated operator setup pages. Secrets remain in provider settings.

## Deployment and evidence

Start with [README](README.md). The [cutover runbook](docs/v094/DEPLOYMENT.md) is required: uploading ZIPs and Apps Script code alone does not migrate ownership. See [validation](docs/v094/VALIDATION.md) for executed checks and their limits. No production deployment, provider send, paid-plan change or live-data migration is performed by preparing this release.
