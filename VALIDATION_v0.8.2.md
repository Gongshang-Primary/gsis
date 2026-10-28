# v0.8.2 validation

Baseline: v0.8.1d, commit `c4a2a85896c4404410a6f13c8e8ef4ded2feae81`. This full-suite release includes items 061–082 and the earlier v0.8.1b–d patches. Local Git commit/tag and the repository bundle record the release; production deployment was not performed.

## Final gates

All **489 current scripts passed** in the full `scripts/verify-release.py --skip-package` invocation, including items 079–082. A final independent review then closed legacy absence-source gaps; all 23 affected notification and generated-backend suites passed again after the final source synchronisation. Their separate results are `verification/082-post-review-results.json`. The archive/package gate is run separately on the completed release and rerun after adding the committed repository bundle. It checks exact archive membership, SHA-256 checksums, frontend/backend/source parity, all 62 retained assets and the matching manual's 36 embedded figures. Results: `verification/82-node-results.json`, `82-node-summary.json` and `082-package-final.log`.

The command used `ROSTER_TEST_CHROMIUM=/tmp/chromium GSIS_BROWSER_EXECUTABLE=/tmp/chromium GSIS_TEST_TIMEOUT=90`. These are host verification settings, not production configuration. Apps Script ES2020 parsing passed for 72 `.gs` files; JavaScript syntax, generated-module synchronisation and `git diff --check` passed. This record reports the complete parallel current-script gate, not an unexecuted `npm test` command.

The retained second integration was 468/481 with 13 failures; its original result remains in the evidence. After fixes, all 482 scripts passed before item 079; all 483 scripts passed with that addition, before the final feedback items 080–082. Those results are retained as `082-before-feedback-results.json`. Obsolete autosave/lease/audit-approval fixture expectations were updated without dropping current tests. `082-release-checks.md` records the sequence and concrete integration fixes.

## Behaviour verified

- Independent SMC cells and Stapler fields merge; real same-cell/field conflicts retain original, local and online values. Double booking and invalid sources remain rejected. Exact uncertain requests survive lost responses, reauthentication and reload. Same-user tabs retain independent recoverable drafts, including incompatible old baselines.
- Manual assignments, same-teacher adoption, No Relief and explicit empty cells survive automatic reconciliation. Published replacement ancestry prevents two effective teachers. Invalid/orphaned choices stay visible for explicit clear/release and do not count as valid cover. Past/started changes preserve separate actual-duty accounting.
- All three Assign Relief XLSX outputs are generated from a frozen local projection with unsaved changes and no export-time network calls. Navigation, refresh, publication and export do not implicitly save. One Save confirms at most 100 queued commands; remaining commands stay visibly local.
- Private capabilities are reusable for 168 hours from issuance, including after opening/acknowledgement. Current publication is rendered without planner locks or live model rebuilds. Stale acknowledgements, legacy/rotated-key checks, button action focus and single-job dispatch uncertainty are covered. A synthetic version of the reported suspended/relief overlay preserves both kinds of lesson.
- Audit evidence commits with accepted choices. Export retries, archive merging, concurrent corrections, separate exporter/writer locks and watermark-safe past compaction are covered. A verified active school day gets a no-activity record through enabled scheduled automation when needed.
- Ordinary teachers receive only published Daily Update groups and frozen confirmed upcoming previews. Relief Load, quota, private absence reasons and working drafts are excluded. The Timetable page keeps the published suspended day above the baseline, with shared selection/fields and separate exports. Browser tests cover mobile, keyboard, stale dates and failed refreshes.
- Google Contacts tests cover consent/account identity, exact duplicates, cross-tab serialization, uncertain creation and accessible controls. Inbox tests cover conditional refresh, private JPEG/PNG metadata/bytes, content limits, fresh provider URLs, authorization, captions and retry behaviour. Provider calls are simulated.

- Email recipient settings use an independent settings token and exact-request recovery. Controlled backend/gateway/browser cases cover unrelated online changes, concurrent settings conflicts, lost responses, reload, account changes and no implicit sending. The live screenshot cause remains unproven; see `082-email-settings-investigation.md`.
- Daily Notify acknowledgement totals use unique eligible teachers and current notice status, independently of search/grouping and WhatsApp delivery. Full absences and absent-only partial changes are excluded from sending and counts; queued sends recheck attendance.

## Five-skill review

Ponytail, Pstack, Thermonuclear, Vercel and Superpowers were applied. Separate correctness and UI-reliability reviews reproduced six material findings and independently verified their fixes: published replacement ancestry, false historical-evidence warnings, unreclaimable archived audit facts, uncertain confirmation retry loss, cross-tab draft deletion and incompatible-baseline recovery deletion. No material finding remains open in that inspected scope. A subsequent independent review found no actionable issue in item 079. The final feedback review fixed three further findings: malformed email-settings confirmation discarding recovery, acknowledgement rounding to 100% while one teacher remained pending, and legacy attendance sources missed by queued timetable/reminder preflight. All were independently reverified; no reviewed blocker remains. Reports and reproductions are packaged in the verification archive.

## Installation limits

Local fixtures do not establish production Google latency, morning throughput, actual teacher delivery, Google Contacts creation or live image/audio playback. Existing source-specific forensic findings remain in the wider changelog; the missing Contacts numbers must be supplied from verified school information, and the installed save/readback paths require checking after deployment. No live timetable correction or publication was performed.

The operations store is still one durable document with a short commit lock. Small manual-decision/link indexes remain retained; audit bulk facts are archived and compacted only after durable watermarks. Browser recovery depends on available device storage. Archived evidence must remain accessible for later corrections.

The only external write in this release work was the expressly authorised WhatsApp template submission. `gsis_timetable_updated_button_v2` remains PENDING at readback; the existing approved template remains default. The approved body still says “for today”, even when a future actual date is inserted. Google Contacts requires People API/OAuth setup and each user's consent. Preserve existing URLs, secrets, data, storage bindings and intended live flags when installing.
