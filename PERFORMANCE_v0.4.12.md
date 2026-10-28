# GSiS v0.4.12 performance and resilience

- Column changes and Excel exports add no backend calls. A workbook contains the current displayed result, not an unbounded full-sheet fetch.
- Table enhancement is scheduled once per animation frame and reuses controls for connected tables. Column preferences contain presentation choices, not staff values. Existing Contacts contact-list export is reused.
- Workload mathematics and examples render locally from the existing version/draft ledger. KaTeX, CSS and fonts are bundled; the release makes no external math-service request.
- Normal contact saves, original-request recovery, fresh permission checks, writer locks, caches, indexed Audit and receipt behavior are unchanged from v0.4.11.

Validation uses local fixtures and a real browser. It is not a production latency benchmark or a guarantee of concurrent-user throughput. Q74 live new-contact verification, production first-save/load/Audit timing, two-real-user conflict/recovery checks and incident attribution remain open.
