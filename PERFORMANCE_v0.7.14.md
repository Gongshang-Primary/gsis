# v0.7.14 performance and verification limits

The release adds a full teacher workbook, richer offline import and ordered allocation scoring. No production timing measurements were taken for these changes. Do not treat historical local timings as measurements of v0.7.14.

The automatic allocator uses a bounded search. Maximum coverage and minimum preference deviation have separate proof flags. A preference search that reaches its bound may retain the best rule match found at proved maximum coverage. Scheduled allocation retains the last valid draft if maximum coverage cannot be proved. This bounds search work; it does not promise a fixed response time on Apps Script.

Name Bridge filters baseline names locally. Full teacher export requests the selected day's teacher summary when that export is selected. Offline import parses the supplied file locally before the normal draft save workflow. These describe execution paths, not measured speed improvements.

Actual local results belong in VALIDATION.md, RELEASE_SUMMARY.json and the packaged verification evidence. Fixture and browser checks do not measure Contacts, Calendar, Drive or provider service latency. Installed morning-rush traces are required to establish production response times and capacity.

A local synthetic comparison with 150 teachers and 60 demands measured v0.7.13 at 1.318 seconds and 10 flow nodes, stopping at maximum coverage. v0.7.14 measured 5.626 to 5.771 seconds and 51 nodes, proving both maximum coverage and the minimum ordered preference score. The test budget is 8 seconds to reflect that additional work. The search limit remains 256 nodes. These are Node fixture timings, not an Apps Script service guarantee.
