# GSiS v0.6.02 performance notes

Q196 reduces repeated local work along the existing workload and Layout filter paths. It adds no dependency, server cache or persistent memoization.

Workload uses Maps for group, class and PLT lookup and Sets for known and assigned teacher IDs. Specialist demand and membership checks reuse data already calculated for that call. The lookups end with the call, so later edits cannot reuse stale results.

Layout builds normalized search fields when a snapshot or zero-count display changes. Typing toggles existing row visibility and updates counts. Rows, column choices, dropdowns and source details retain their identity. Filtered export still follows visible rows and columns.

## Local measurements

Compared with the working draft immediately before Q196, using the same fixtures and exact output checks:

| Path | Before median | After median |
| --- | ---: | ---: |
| Workload, 159 teachers, 42 classes, 90 TGs, 150 assignments | 6.483 ms | 2.287 ms |
| Workload, same fixture with 1,500 assignments | 25.441 ms | 7.026 ms |
| Layout teacher filter, 59 TGs | 14.841 ms | 3.364 ms |
| Table row replacements across 24 filter events | 24 | 0 |

Full workload and relief results matched before and after for sparse and full fixtures, duplicates, orphan records, missing loads, PD aliases and subsequent edits to the same object. Layout visible matches and filtered exports matched.

These are local Node CPU and JSDOM event measurements. They do not measure Apps Script, network latency, browser painting or the school screen's scaling. Q192's production loading failure is separate and remains unverified.

## Reproduction

Extract the verification ZIP into the source's `verification/` directory, install the locked development dependencies, then run:

```sh
GSIS_WORKLOAD_BASELINE=verification/602-workload-before.js node scripts/measure-workload.cjs
GSIS_LAYOUT_BASELINE=verification/602-layout-before.js node scripts/measure-layout-filter.cjs
```

The verification archive contains those before-source snapshots, `602-workload-comparison.json`, `602-layout-comparison.json`, and test logs. Times will vary by host. Output equality is the check; the recorded timings are observations, not a release threshold.

Existing surgical writes, journals, receipts, relief caching and the 45 second complete public Layout cache remain. Its cache namespace now invalidates pre-release entries that lacked the new TG fields. The read-only `diagnoseLayout601` remains an explicit editor action and is not called during routine loading.
