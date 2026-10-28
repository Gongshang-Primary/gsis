# GSiS v0.9.8b

Google remains the authoritative Roster store. The existing Worker gateway, receipt transport, scheduler and notification outbox remain in use.

* Preserve safe backend failure codes, stages, versions and diagnostic references through scheduled jobs and the user interface.
* Restore a read-only recovery System Health view using existing job metadata and fresh school access checks. Processing success is distinct from message delivery.
* Show Automatic, SMC and Peer approved source indicators in Assign Relief; retain separate proposal-processing and pending-approval states. Publication status is independent of assignment source.
* Check relevant dated revisions before refreshing records. Do not reload local SMC drafts automatically; provide explicit review when online data changes. Include cross-date balance and accounting inputs, while ignoring unrelated delivery bookkeeping and future-date minute changes. Reject delayed version replies after a newer refresh.
* Cache compact Google revision projections for at most 30 seconds. Invalidate after attempted operational commits, including uncertain responses. Fresh authority and external references remain checked. Cache loss falls back to authoritative reads; caches never validate writes.
* Retain 098a selective received-report withdrawal and the 098 critical Roster recovery paths.

No new Cloudflare resources, operational migration, provider send or production deployment is performed by this patch. Yee Wah P0 was an SMC manual choice, not an allocator defect; allocation eligibility rules are unchanged.
