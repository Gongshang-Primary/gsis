# GSiS v0.4.18 performance and resilience

## Contacts first usable directory

Config and session checks start together. The bootstrap does not wait for teaching information. A cold signed bootstrap reads admin_users, roles and contacts in one bounded multi-range Sheets API call; a warm bootstrap reads only current admin_users. Local advanced-API instrumentation reproduced one batch and zero flushes in both paths, compared with three batches/three flushes on the previous cold path and one batch/one flush on its warm path. Read-only flush omission occurs after recovery; journalled writes retain their required flushes. Fresh revocation, cache epochs and pending-save fences were verified. The 30-second TTL is unchanged, including compatibility with direct Sheet edits.

Contacts emits directory-ready frontend timing, cache hit/miss and backend phases. Teaching assignments and workloads are indexed once by Staff ID. Personal mobile/name updates need no deployment fan-out: confirmed DIY results update the local directory and invalidate/refresh the signature display.

## Deploy reads

Transactional view projections exclude ordinary Audit payloads and private persistence roots before I/O. Current conflict notices fetch only their event ranges; acknowledgements remain per-user. Frozen active projections avoid layout/history reads for published teaching export. Full Audit remains available through its paginated routes. Reuse of the recovery workbook removes one redundant open per dispatch.

A local in-memory fixture kept deployment content constant and supplied 0, 100 and 500 synthetic Audit events (each with a 3,000-character before-value). Every projected snapshot read 4,779 projection rows / 309,020 UTF-8 JSON bytes and made zero canonical history reads. These are serialized range-value counts, not network transfer or elapsed live timings. The previous source study grew from 4,791 rows / 309,768 bytes to 9,291 rows / 2,126,947 bytes for 500 events. A separate conflict event was returned using one bounded event-range read. Layout/classes, publication isolation, interrupted preparation recovery and revision fences passed.

Existing field stores require editor maintenance `preparePerformance418()` to get the new cold-read path immediately. New saves/publications maintain projections automatically. Older/legacy stores remain compatible through full reads. No workbook is migrated or cleared automatically.

Read retries retain two attempts for transient failures, but use an overall budget: Contacts reads 32 seconds, config/session 12 seconds; Deploy full-load reads 52 seconds inside a 56-second outer deadline. Per-attempt limits remain bounded. Saves are not automatically replayed. These budgets limit waits; they do not prove faster successful production requests.

## Viewer and signature

The 3D viewer restores the original Lambert/white-light/no-shadow appearance and 1.5 pixel-ratio cap; Lighter remains available. Showcase retains the mouse deadzone, deliberate takeover, idle rendering and portrait framing. Local software-WebGL checks cover 13 camera poses, manual orbit/wheel/touch and the restored material/light settings. No physical GPU benchmark is claimed.

The signature template's native pixels, supplied Outfit fonts and final dimensions remain unchanged. Both instruction sections start collapsed, and 18 retained/new screenshots use lazy loading and reserved proportions. Browser checks at 1366, 768 and 390px verify image proportions, keyboard expansion, full-size links, matching 18px headings and no guide overflow.

Live Apps Script startup, school-device network latency, quotas, real Outlook/Gmail installation and physical Intel/mobile/Apple performance remain operational checks after installation. The release makes no promised live seconds figure.
