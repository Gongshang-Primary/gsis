# GSiS v0.4.12 — 29 September 2026

Authorized by “commit” at 10:38 Singapore. Baseline: v0.4.11, 0260d77. This is a source/package release, not a live installation.

- **Q86 — Table columns and Excel.** Tables across the suite receive Columns and Export to Excel controls, with existing Contacts contact-list controls retained. Export follows displayed column and filtered/sorted row order, includes off-screen rows, reads current editable values and selected labels, and excludes action controls. Grouped headings flatten into descriptive headers; merged venue values stay aligned. Numeric values remain numeric and phone/identifier text retains leading zeroes. Each table has its own labelled controls; Compact remains at the far right of page actions. Audit exports only loaded rows and labels that scope.
- **Q88 — One-line Workload overview.** School FTT, teaching, non-teaching (including PD and Duty), and total periods appear beside PE, Art, Music and TL references for a teacher with 0% offload. The strip scrolls horizontally on narrow screens. All values use the current version/draft and existing validity checks.
- **Q89 — Rendered Workload mathematics.** Overview, calculation guide, worked examples and specialist demand rows use locally bundled KaTeX with accessible MathML and readable fallback text. Fractions, summations, subscripts, percentages, inequalities and rounding notation are rendered. The workload engine and established offload/cap/pool rules are unchanged.
- Suite version and matching Deploy write protocol advance to v0.4.12 / 412. The existing recovery and targeted-save contracts remain unchanged. `prepareContactsPerformance412()` is a compatibility wrapper for the existing preparation routine.

**Still open: Q87, graphical 2D layout Excel export.** The choice of editable cells, embedded image, or both has not been confirmed. Existing PDF export remains available. No model geometry changes are included.

Exports are downloads of the displayed data; editing a workbook does not update GSiS. No production data was changed. Live latency/concurrency and outstanding incident attribution remain follow-up work as recorded in the queued changelog.
