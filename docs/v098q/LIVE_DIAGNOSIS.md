# Calendar sync diagnosis — 28 October 2026

This note summarizes read-only evidence. It omits school event details and does not record a live change.

## Supplied session at 13:49 Singapore time

| Item | Observed value | Meaning |
| --- | ---: | --- |
| Initial pending | 81 | Starting workload for this saved run |
| Processed | 50 | Includes both successes and failed attempts |
| Successful creates | 20 | Provider writes recorded by this run |
| Retained errors | 30 | Earlier attempts reported the RC19 upgrade requirement |
| Remaining | 31 | 30 actionable items and one blocked source save |
| Last batch | 12:55:58–12:56:47 | About 49 seconds for five write attempts |
| Pause | BATCH_YIELD | One-second continuation delay; not a quota error |
| Active claim / pending settlement | Neither present | The recorded last batch had settled |

The frontend's 45-second timeout explains why this 49-second batch could finish on the backend after the browser stopped its continuation loop. This is evidence for that request boundary, not proof that every previous failure had the same cause.

Fresh workbook metadata and bounded header reads confirmed Events contains LastMutationID and VenueID and MutationLog has its expected columns. The 30 error strings are retained within the run. Repeating the schema upgrade does not erase them or retry their event IDs.

The current run excludes its failed IDs, so it should finish its 30 actionable items first. A later explicit Sync can retry the older errors using preserved provider identities. The one blocked item must retain its unresolved source-save receipt until its outcome is checked; neither age nor a successful unrelated batch makes it safe to discard.

## Historical throughput

The saved SyncLog records a run with 885 staff creates and zero errors on 27 August, taking approximately 25 minutes 15 seconds. The deployed source version for that run has not been established. Retained source comparisons show increasing Sheet calls and flushes around fresh permission checks and concurrency protection; Q reduces avoidable calls while keeping those protections.

## Q verification boundaries

The added tests reproduce request timing using controlled clocks and compare native read/flush counts against P using 1,295 source rows. Their service-latency model is synthetic. Only a live post-installation run can confirm the school's actual throughput. The optional background jobs Worker is unchanged.
