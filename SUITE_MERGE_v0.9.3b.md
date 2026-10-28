# Merge v0.9.3b into the next full suite

Baseline: v0.9.3 commit `74dee29244ace62385c083173f62f0c34252f656`. This patch includes v0.9.3a and the subsequent shortcut-removal request.

Include the canonical absence transport, intake, processing and peer-mail modules; semantic source-proof correction; peer reservation/allocation rules; frontend receipt/review state; notification Worker drains and holds; regression tests; and current setup documentation. Generate the combined Apps Script backend and both Worker entry points from canonical source. Separate `.gs` modules are maintenance boundaries, not additional deployment projects.

Only Roster frontend, Roster backend and the notification Worker advance to 0.9.3b. Other installed components remain v0.9.3. Keep the existing write protocol and persisted receipt identities; a later full-suite release can harmonize component labels.

Carry the settings distinction forward: optional existing `GSIS_JOBS` on both Workers must identify the same database and Roster URL/origin; without D1 use the Apps Script UserLock journal. D1 forwarding additionally requires the existing Roster `BRIDGE_SECRET` on the notification Worker. Both modes require scheduled service and Calendar access independently of the allocator flag. Production must keep WHATSAPP_DIAGNOSTICS_ENABLED false or unset; diagnostic-only cron remains read-only and does not drain reports. `ROSTER_ABSENCE_INTAKE_FILE` is automatically managed. No new secret or WhatsApp template is introduced. Preserve unresolved receipts, uncertain provider outcomes and audit rather than clearing them during a version bump.
