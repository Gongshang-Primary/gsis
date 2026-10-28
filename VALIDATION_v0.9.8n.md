# GSiS 0.9.8n validation

Baseline M: c4978418fec42eb5563893e767cc9ed6ecd50688. Scope is absence intake recovery, bounded existing-document capacity and later same-actor shortening. Rehearsal work is paused. Package preparation does not deploy, modify live records, run allocation, publish or send notifications.

## Confirmed production diagnosis

The user ran a read-only editor probe at 28 October 2026, 09:16 Singapore time. The document at operations revision 722 contains 11,999,541 JavaScript characters, leaving 459 under the 12,000,000 guard. The 29 October retained report passed the rules probe and would retain 278 absences, but its projected commit is 12,000, 412 characters after the existing fallback, 412 above the guard. Its 91 attempts and PROCESSING_RETRY therefore describe a storage rejection, not an overlap rejection. The 30 October report is from the same reporter and latest editor, reduces a saved full day and currently stops at ABSENCE_SHORTER_CONFIRMATION. The probe made no writes or sends and lacked live Worker Calendar verification.

The old whole-state traversal expands to 48,305,038 characters. Its surgical non-plan copy is 14,673,910 characters while retaining 9 active and 9 archived plan rows outside the copy. This supports the targeted lazy-plan correction; it does not establish a corrupt production plan.

## Release verification

Final controller coverage: 96/96 targeted programs passed across retained attempts. The initial run passed 94; two package smoke programs ran before their required N ZIP existed and failed with ENOENT. After building that ZIP, both passed in a scoped rerun without a runtime change. Original and rerun evidence are retained separately. This is not a single green full-suite claim. New cases cover exact 12,000,412 and 16,000,000 character commits, refusal at 16,000,001, real-journal capacity settlement, same-actor later shortening, explicit choices, chronology, protected covers, one-time recovery and lazy-plan retention. Independent checks passed 32 combined N/D/adversarial entries, 16 M/scheduler entries and 14 generated parity checks; no material finding remains. All 233 Apps Script files parse as ES2020 and both Worker bundle parity checks pass. Working-package source/hash/archive and bundled Roster config/auth/assets smoke checks pass. Final committed-package and fresh full-history recovery verification are recorded in the external release receipt; no live validation is claimed.

## Inherited evidence and limits

No full-suite or live-production success claim is made. M's 78/78 and L's 105/105 targeted results belong to those releases. The earlier inherited limits remain: roster-draft-cell-save-speed.cjs, roster080-batch-backend.cjs and roster719-performance.cjs use a 3,073/3,000-byte benchmark; release084-absence-browser.cjs, roster717-inbox-performance.cjs, roster718-absence-performance-browser.cjs and stapler718a-relief-import.cjs require unavailable historical source. The suite-excluded roster701-operations-speed-browser.cjs has the established explicit-refresh timeout. Historical metadata tests must route the current N release to its complete N contract.

Local fixtures and simulated transports do not prove current school sign-in, live Google/Cloudflare behavior or message delivery. An applied receipt confirms saved intake only. Existing pending tasks may resume under ordinary production schedules after the operator deploys; preparation does not invoke them.
