# GSiS v0.4.15 performance and resilience

The previous storage layer already selected changed cells. The retained v0.4.14 adapter reduces separate value-write calls by putting disjoint ranges into bounded Sheets API batches. It does not replace every SpreadsheetApp operation.

- At most 100 write ranges and roughly 1 MB estimated value payload per batch; row blocks are divided at 500 rows or the payload bound. These are conservative application limits, not Google's advertised maximums.
- Up to 100 read ranges per batchGet. Contacts preserves formatted text; JSON storage avoids presentation formatting. Empty trailing values are padded to the requested dimensions.
- Prior structural/reservation writes are flushed before crossing into the Sheets API. Journals and pending markers are durable before data writes. Commit markers advance only after all required data batches succeed.
- An API failure is not reissued through SpreadsheetApp. A timeout can be ambiguous; recovery replays stable ranges from the original journal. No new blind append retries or long sleeps are introduced.
- Table Compact fitting occurs when a table becomes visible, after fonts are ready, and when edited controls require measurement. Ordinary scroll/menu refreshes do not repeatedly clear manual widths. Workload filtering uses local displayed rows, without backend requests or recalculation against a reduced population.

Local synthetic call-count/recovery tests and browser checks are provided. Production speed, quota behavior, first-save success, two-real-user concurrency and the older incident IDs still require live observation after installation. No production latency reduction is claimed.

## v0.4.15 paths

Specialist calculations are pure local derivations from the current version. No backend read is added when rendering or filtering Workload. The signature reuses directory and published deployment already loaded by Contacts; template and Outfit fonts are static same-origin assets, cached within the page. Rendering is completed before PNG download is enabled. Admin signature settings uses one guarded property write. Notice acknowledgement validates the requested historical audit events and writes only private acknowledgement properties; normal snapshots filter acknowledged events and include an acknowledgement epoch in their cache token.

No production speed or first-save result is inferred from these local checks. Existing live performance and recovery follow-ups remain open.
