# Validation for GSiS v0.9.8e

19 focused test programs pass on the final source. These exercise real browser and DOM workflows, original receipt retry, frozen bulk selection, changed eligibility, malformed/lost responses, review/apply, shorter-choice identity, permissions, history fingerprint renewal, exact allocation completion, manual assignment preservation, expiry and mixed-date receipt handling.

The independent whole-change reviewer found no Critical issues. Three Important findings were reproduced and fixed with failing-then-passing tests: stale batch selection objects; incomplete retry confirmations; expired parts of mixed-date reports. Existing allocator lifecycle tests also check public status returns the manual request ID.

The wider suite was started but is not a completion claim. Its included partial snapshot contains 250 completed programs. One old receipt test expected the previous UI restriction; it now explicitly checks SMC access on Report Absence and rejects ordinary-teacher access, and passes. The missing historical v0.8.3 object still prevents release084-absence-browser from running. Revision D previously documented seven inherited suite limitations; this release does not claim a full green suite. The 19 focused checks were rerun after the final fixes and generated-source synchronization.

Build synchronization parses 198 Apps Script files as ES2020. The component package verifies bundled Pages Worker execution, source parity, configuration, assets, authentication and hashes. Complete Git source recovery is supplied separately and verified before delivery.

Minor findings retained: close an open dialog before using the inline pending recovery notice; a redundant dismissal selector remains in say(), with no behavior effect because its HTML is replaced before binding.

History deletion is account/browser presentation state, limited to 250 entries for up to 90 days. Audit and saved attendance remain. Review/apply retries current validation and can return to review; it does not force conflicting reports into the register. No live school records, production bindings, actual allocation or provider delivery were verified. No messages were sent.

Focused programs:
* roster098e-management.cjs
* roster098e-allocation-browser.cjs
* roster098e-pipeline.cjs
* roster098a-intake-flush.cjs
* roster098a-intake-flush-browser.cjs
* roster098d-choice-browser.cjs
* roster098d-coverage-choice.cjs
* roster093b-absence-intake.cjs
* roster093b-absence-pipeline.cjs
* roster093b-intake-gateway.mjs
* roster098d-pipeline.cjs
* roster098d-resubmissions.cjs
* roster-draft-auto-retry-browser.cjs
* roster0812-allocation-monitor-browser.cjs
* roster0812-allocation-run.cjs
* roster093-allocation-reference.cjs
* roster607-diagnostics.cjs
* roster608-diagnostic-detail.cjs
* paid097-receipts.cjs
