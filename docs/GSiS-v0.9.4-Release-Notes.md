# GSiS Suite v0.9.4

This release coordinates Roster and Deploy operational ownership in Cloudflare Workers and D1, with private R2 for immutable timetable content and background transport for notices. Contacts, Calendar, LORD and Venues retain their Google-owned records and signed integration boundaries.

Install the matched suite and follow the [ownership cutover runbook](v094/DEPLOYMENT.md). Uploading frontend ZIPs and gCodes alone does not migrate the live operational store. The [README](../README.md) is the single starting point for deployers, developers, maintainers and assisting LLMs.

## Data capture, concurrency and caching

The shared D1 store introduces an explicit import/activate/pause lifecycle, revision-guarded changes, immutable request identity and result receipts. Changed entity rows and the command receipt commit together. Domain audit and outbox entries included in the command share that atomic boundary. Conflicts require reconciliation; stale content is not silently replayed.

Timetable caching separates immutable baseline content from dated suspended plans and publication state. Private R2 objects do not authorise access. Revision and source checks still govern the data returned to each user. Cache publication is separate from the urgent absence receipt.

A database transaction cannot include a Google API call or Meta delivery. Integration work remains durable, retryable and visible. An uncertain send requires reconciliation before another attempt.

## Venues source recovery

Refresh now performs a bounded source check and retains source-specific failure codes and reasons. The reproduced frontend problem was repeated bootstrap without a source refresh and discarded diagnostic detail. The original production screenshot alone did not establish whether the upstream cause was missing timetable coverage, Calendar, published Deploy or room mapping.

After Roster cutover, Venues must use the signed Worker source URL because the legacy Roster source is fenced. A failed source check preserves the last view for reference and keeps booking disabled where coverage is unverified.

## Preserved school rules

- Emergency absence notices cover new absences after the first publication and before 14:00 Singapore time, with all current SMC on duty as the intended recipients.
- Human allocations and accepted peer arrangements remain protected from automatic allocation. SMC overrides require an attributed audit choice.
- Saved drafts, confirmed STAPLER plans and published daily relief remain different states.
- Published Deploy identity remains distinct from future unpublished planning versions.
- Venues requires verified timetable and Calendar coverage before accepting a booking.
- Provider acceptance, message delivery and explicit teacher acknowledgement remain distinct results.

## WhatsApp peer-request button template

`gsis_relief_request_v2` was submitted with four body values and a **Review request** URL button. The last provider status checked for this release is **PENDING**. The approved v1 template remains the live-compatible fallback. Do not activate v2 solely because its definition is included in the package. See the WhatsApp parameter ledger for the exact parameter mapping and activation conditions.

## Documentation and verification

The package includes a standalone staff/capability manual, an Archify tech-stack map, an editable Draw.io companion and a deployment runbook with ownership and rollback guidance. The capability/competency write-up describes practical school and maintainer skills; it does not claim professional certification.

Use the package's validation record for exact executed tests. Automated tests and local browser checks do not confirm production settings, real provider delivery, peak-hour performance or the successful migration of an existing school installation. Record those separately during deployment acceptance.
