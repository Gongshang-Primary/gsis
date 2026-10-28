# GSiS v0.4.05 incident and performance notes

## Live read-only evidence

Working revision 39 committed seven teacher-field edits at 2026-09-27 16:44:45 UTC. Checked 15,290 canonical field entries and 11,362 compact projection entries: **zero mismatches**. Every write in the latest transaction matches the stored cells. No pending commit or Contacts save-journal record remains. Counts: 156 teachers, 41 classes, 149 TGs, 475 assignments, 89 audit events, 10 teacher drafts. Published revision 16 is unchanged.

The stored document passes normalization and teacher-view construction locally. The published document builds 143 public campus venues. Raw staff records were not copied into this release; `verification/incident405-integrity.json` contains only counts and field/action metadata.

The last journal records 39 targeted spreadsheet write ranges: 18 canonical, 18 projection, one edit index, one receipt and one audit block, plus journal/index writes and four durability flush barriers. Several-field modifier saves are not a single backend-cell call. v0.4.04's bounded read projections and targeted writes remain; v0.4.05 does not trade away durability or claim one-cell-only writes.

## Confirmed defect and fixes

Layout's outer 30-second abort could cut the second read attempt to roughly two seconds after the first 28-second timeout. The outer abort is removed; each bounded attempt gets its budget. Fake-clock testing succeeds when the first attempt times out and the second takes 10 seconds (38.4 seconds overall).

Deploy's 25-second mutation gateway / 28-second transport / 30-second outer budgets could lose acknowledgement of a slower durable save. They are now 60/65/70 seconds. A fake-clock 40-second acknowledgement succeeds with exactly one write attempt. Uncertain saves still use exact receipt recovery; never automatic mutation replay.

Gateway failures now distinguish read refresh from uncertain save recovery and include a correlation ID and error category. Existing phase timing remains available for production diagnosis. No staff payload is added to gateway logs.

## Limits

The incident's exact production latency source was not established. Direct gateway probes returned HTTP 403 with Cloudflare code 1010 before an application result; live Apps Script/Cloudflare execution logs were unavailable. Local operation counts, fake-clock checks and integrity evidence do not establish production wall-clock performance or prove the live service is repaired. No live data or software was changed during this investigation.

The earlier comprehensive write-path inventory and synthetic 1,001-save benchmark remain in `PERFORMANCE_v0.4.04.md` in the source archive. Those are historical v0.4.04 results, not newly measured v0.4.05 service latency.
