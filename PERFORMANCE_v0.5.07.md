# GSiS v0.5.07 performance boundaries

The Deploy MCL label correction is a two-entry local fallback resolved against physical geometry. It uses the already loaded version and introduces no metadata request or broader registry read. Explicit room names retain precedence.

Relief calculations move from the browser to the existing backend snapshot and API reads. This adds CPU calculation and result serialization, including additional detail for Admin. It does not add a separate workbook read to an existing full snapshot. The relief API now checks the index after reading/calculating and returns 503 on concurrent change. This adds one index read to protect consistency.

To keep R correct without disclosing private rules, workload-affecting deltas request a fresh snapshot. A save still uses the existing scoped durable write; its displayed R then requires the snapshot reload. This can cost more than the previous browser recalculation. Pending R is unavailable until confirmed data returns. Teacher notes, reporting changes and other unrelated narrow edits retain normal deltas and preserve calculated rows.

The existing v0.5.06 scoped-save and audit performance regression remains a release gate. It enforces one Sheets API batch read and write for its measured narrow save operations, bounded cells, simple-edit independence from unrelated IP assignments, and four-column audit summaries. The new security regression explicitly exercises a narrow note acknowledgement while preserving calculated R.

Reproduce synthetic scoped counts with `GSIS_MEASURE_OUTPUT=verification/507-deploy-current.json node scripts/measure506.cjs`. This measurement stops at each save response and excludes the subsequent v0.5.07 result refresh; it is not an end-to-end frontend latency measurement. Historical v0.5.06 comparisons remain historical evidence. Current release counts and the full regression result are included in the verification archive.

No production latency improvement is claimed. Synthetic fixtures exclude Apps Script cold start, school-network latency, live Contacts authority calls, simultaneous users and installed browser behavior. Existing live timing instrumentation and installation checks remain necessary. No permission or recovery checks have been removed to improve speed.
