# Validation for GSiS 0.9.8f

24 focused test programs pass after final canonical source edits and generated-source synchronization. Programs cover candidate visibility, disabled actual conflicts, ordinary workload enforcement, suspended manual/automatic solver behavior, source cache and model parity, published/private timetable consistency, history/receipt recovery and diagnostics.

Eight new publication cases include an invalid replacement over previously published shared cover, teacher-facing report/general views, restoration of a retained choice, legacy correction adoption and idempotent cancellation snapshots. The independent final reviewer found two Important issues; both were reproduced as failing tests, fixed and verified. No Critical or deferred minor findings remain from that review.

Existing policy tests cap708, release086-ut-cap, roster093-allocation-reference and roster713-manual-ranking were updated for the requested policy. They still verify ordinary-day contractual caps, privacy and available-candidate ordering.

A full npm test run was launched. This package does not claim full-suite completion or a green full suite. The included partial snapshot contains 271 completed programs and observed failures: cap708.cjs, package.cjs, release084-absence-browser.cjs. cap708 reflected the former suspended-cap rejection and now passes the requested policy. package failed because the source changed during its wider run; final archive checks are rerun after packaging. release084-absence-browser requires an unavailable historical v0.8.3 Git object. Previous baseline limitations remain documented in earlier releases; this patch does not invent old Git history or weaken performance thresholds.

The release sync parses 199 Apps Script source files as ES2020. Deployment packaging verifies source parity, self-contained Worker imports/configuration, assets, authentication and hashes. Complete Git source recovery is checked with bundle verification and a fresh clone matching the release commit before delivery.

No production record or provider delivery is tested here. No live records changed, no messages sent and no production deployment performed. The workload exemption applies to authoritative confirmed suspended dates. Duty/history values remain recorded. Normal dates retain existing policy. Unavailable teachers remain visible but cannot be assigned through disabled controls.

Focused programs:
* roster098f-workload.cjs
* roster098f-selection.cjs
* roster098f-publication.cjs
* release086-ut-cap.cjs
* roster713-manual-ranking.cjs
* roster702-operations-ui.cjs
* roster701-r20.cjs
* roster084-recipient-policy.cjs
* roster084-manual-dispatch.cjs
* roster080-timetable-day.cjs
* roster098e-management.cjs
* roster098e-allocation-browser.cjs
* roster098e-pipeline.cjs
* roster098d-resubmissions.cjs
* roster093-allocation-reference.cjs
* roster0812-allocation-run.cjs
* roster0812-allocation-monitor-browser.cjs
* roster-draft-auto-retry-browser.cjs
* roster607-diagnostics.cjs
* roster608-diagnostic-detail.cjs
* roster712-shared-subject.cjs
* roster093-targeted-publication.cjs
* roster080-timetable-privacy.cjs
* cap708.cjs
