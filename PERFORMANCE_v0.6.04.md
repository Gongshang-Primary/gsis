# GSiS v0.6.04 performance

PAL additions use the existing FT save and field transaction; there is no extra Deploy write or follow-up request. Existing PAL rows are preserved. Unrelated saves no longer scan and reconcile all FT/PAL rows.

The current YH capability is returned in the existing Contacts bridge call. PAL allocation saves for non-Admin SMC additionally consult confirmed Contacts staff identity and appointment. Other authority-only requests keep their existing access-only path. Full snapshots reuse the request's Contacts read.

Relief table filters cache displayed cell text once and toggle existing row visibility. Filtering makes no backend calls and preserves input focus. The existing shared viewport, table export and KaTeX code are reused without dependencies.

No production latency claim is made. See VALIDATION.md for exercised paths and limits.
