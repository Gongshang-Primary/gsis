# GSiS v0.6.02

Prepared on 12 October 2026 from v0.6.01, commit `2328711d346525a6668a5cc01a3171113b987ad1`, following the user's commit instruction.

## Q194: Compact Layout TG allocation

The TG table has a compact heading and controls, partial text searches in all eight columns, and normal document scrolling. Map panels are hidden while the table is open and retain their state. Rows use tighter spacing with inline class counts; zero counts are optional. Column choices, source details and filtered Excel export remain available. The table is in the main document; the 3D model keeps its own iframe.

## Q195: TGs spanning primary levels

The IP Deploy TG popup grows to 960px within the screen. Checkbox descriptions share their row, and class choices use the full form width.

Add and Edit accept several primary levels. Such a TG requires its actual weekly periods, entered once and counted once for each assigned teacher. Single-level TGs retain their Subject Load default unless an override is entered. Values accept 0–100 in half-period increments. Save/reload, copies, conflicts, workload, relief inputs, specialist indicators, filters, exclusions and exports share this rule. Multi-level summaries avoid duplicate counting. CCE EL retains its whole-level scope rule.

Deploy publication and the Layout gateway preserve the selected levels and actual periods. Layout searches and exports all levels and keeps authoritative MTL pupil/teacher evidence and stable TG identity. Existing records are not rewritten on read.

## Q196: Workload and search optimisation

Workload calculations reuse local group/class/PLT and assignment lookups for one calculation. Layout filtering hides or shows existing rows instead of rebuilding the table. No dependency or persistent calculation cache was added. Local output parity and timings are recorded in PERFORMANCE_v0.6.02.md.

## Retained behavior and limits

The PDF relief model, Admin grants, acting appointment membership, authorisation and write safeguards remain. Write protocol is 500, relief schema is 3, and calculationVersion is `whole-week-v2`.

Q192's live campus loading incident remains open. This commit does not install the applications or change current data. Real browser acceptance on the school-issued screen remains to be done after installation. See VALIDATION.md and DEPLOYMENT.md.
