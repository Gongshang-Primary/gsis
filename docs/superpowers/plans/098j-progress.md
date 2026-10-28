# Revision J progress — plan: docs/superpowers/plans/2026-10-28-098j.md

I recovered from the exact verified complete release; bundle clone/fsck/tag identify f512ac6. Isolated branch patch/v0.9.8j. User commit authorisation covers queued post-I changes plus latest Roster publication/toolbar/export requests. No live changes.

Tasks 1–4 investigated; concrete failure evidence: generic publication preparation/projected response is heavy despite cover-check bypass; five Calendar events produce 44 Values.batchGet reads in one sync batch. Exact historical pre-API source is not identified, so no guessed rollback version will be claimed.

Ruling: combined publication and notify-all use two durable stages with exact identities — visibility success survives a notification failure; retry resumes only unresolved stage.
Ruling: Calendar command queue is isolated and opt-in; Google remains record destination. Preserve direct mode until configured; no use of Roster rehearsal resources.
Ruling: use canonical GSIS_SECRET with purpose separation, not a new Calendar cross-API secret — matches user's shared-key requirement.
Ruling: venue catalogue only, no bookings/private staff projection; stable VenueID prepares future awareness without activating bookings.

Implementation and tests pending. Seven inherited I failures remain a known baseline limit, not a new J result. Raw complete J results required before release claims.

Task 1 author complete: 11 publication cases, compact receipt/replay/token/Venues/provider preservation; independent Roster backend review no open findings. Task 5 author complete:10 category/rules cases; review P1 optimiser cancellation and P2 audit eligibility fixed and independently verified. Task2 UI author complete; reviewed XLSX wrap and Singapore caption findings fixed, independent re-review pending. Tasks3/4 Calendar authors implemented; source quota/queue owner/uncertain-acceptance/inline-draft review corrections in progress. Release author metadata/docs/package wiring complete, controller final evidence pending.

Restored I baseline: five focused programs passed; all same seven inherited programs reproduced failure (three response-size 3073vs3000, four unavailable historical references). Evidence: ../j-baseline-evidence.json. Chromium153 locally installed from official npm package and smoke-proven at /tmp/chromium; original Playwright browser download unavailable.

Controller added canonical Calendar factory/module and optional service build wiring. No runtime generation yet; final core parity remains red until generation. Whole-source gates and commit/tag pending.

Task1+5 independent backend review clean after optimiser preservation/evidence corrections. Task2 independent frontend review clean after final XLSX wrap/style serialization and visibleSGT corrections. Task3 independent Calendar backend review clean after source-deferral authority and native metadata/provider-stage pause corrections. Task4 queue/frontend independent review ongoing; acceptance uncertainty, first-seen completion, ownerepoch and inline-parent draft races under correction. Release verification duplicate ZIP P2 fix under author regression; optional sync continuation documentation updated, re-review pending.

RealChromium desktop/mobile tested by authors/reviewers, actualOOXMLfinalstylesverified; controller LibreOffice read-only PDF render QA underway. Source version harmonisation/generation intentionally waits for activeauthor freezes. No finalJgate orJcommitclaimed.

All implementation/review tasks complete. Runtime J labels and canonical factory/module/Worker generation verified. Selected Node inventory completed across 791+38 attempts; 12 scoped fixture/package corrections passed, aggregate822/829 with seven reproduced I limits. All11J programs pass, LORD38/38, Calendar38/38+Sheets63/63. Runtime458files unchanged across runs. Five independent reviews closed. Source docs/metadata now measured; commit/tag, committed packaging and external fresh recovery follow. No live changes.
