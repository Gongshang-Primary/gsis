# Deploy Duty UAT ledger, 23 November 2026

Model: Codex. Times are Asia/Singapore. The owner supplied the two hosted screenshots. The time below is when the finding was logged.

## DEP-23-001 — Recess columns repeat for each weekday

**Open.** Logged on 23 November 2026 at 10:49 SGT for the Deploy **Duty** tab in v1.10.

| Screen | What the screenshot shows |
| --- | --- |
| v0.9.9y | One set of six Recess columns, P1–P6, shared across weekday rows. The header runs from `pd 3` to `pd 8`. |
| v1.10 | P1–P6 repeat in weekday-specific groups. Grey cells fill the other days in each group, and the header period numbers continue across the extra columns. The grid stretches horizontally. |

Both screenshots show **1 of 64 duty slots unfilled**. The comparison establishes a layout and header discrepancy. The source of the hosted duty definitions still needs tracing.

### Renderer evidence

The v0.9.9y source and built v1.10 asset contain the same `dutyPrintHTML` function. It creates one physical column per Recess record and derives each displayed period from the column index plus three. It fills cells only on the days listed in the record. The entry screen replaces its grid with this print table and connects each editable cell to its duty ID and weekday. PDF uses the same function. [v0.9.9y renderer](https://github.com/Gongshang-Primary/gsis/blob/d9d180ced16d32c836a94d67d9cff8d3030eb21d/public/app.js#L1676) · [v1.10 renderer source](https://github.com/Gongshang-Primary/gsis/blob/d726896ce933b139721e3c0acc990b1f8f837f3e/public/app.js#L1667)

A local Node VM probe executed the extracted renderer from each version with the same synthetic occurrences. With six recurring records and one weekday exception, each renderer returned six columns and 29 editable occurrences. Representing the same occurrences as 29 single-day records returned 29 columns and the same 29 editable occurrences. This reproduces the repeated-column pattern without inspecting the hosted records. The v1 `setDuties` path accepts a duty list and retains the separate rows in it. A specific import or conversion has yet to be identified. [v1 duty save](https://github.com/Gongshang-Primary/gsis/blob/d726896ce933b139721e3c0acc990b1f8f837f3e/v1/services/deploy/model.mjs#L1399)

### Acceptance for a repair

- Align equivalent P1–P6 duties under one set of columns across weekdays, with the v0.9 period headers for the six-slot fixture. Leave a grey cell where a slot genuinely has no duty that day.
- Preserve each underlying duty ID, weekday, time and assignment. Retain separate duties when the same label represents multiple assignments on one day, and show weekday timing exceptions.
- Verify an edit affects the intended duty and day after save and reload. Check the PDF and confirm that slot counts, Duty Cards and workload totals match the original occurrences. Treat grouping as a display change.

Evidence is the supplied screenshots and the synthetic renderer probe. Built-browser interaction, PDF output and hosted save behavior were outside this log entry.
