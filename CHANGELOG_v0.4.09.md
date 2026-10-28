# GSiS v0.4.09

28 September 2026. Implements the approved revision and the two refinements received during implementation. Contacts, Deploy and Layout carry v0.4.09. This package is not a live installation.

- **Fortnight Split:** teaching subjects only. PD/TTT, Duty/Duties, Assembly, FTGP, FTT, aggregate FT and any non-teaching/FTT/unclassified category are excluded. Not-offered n/a stays hidden; offered zero stays visible. Existing split data is retained.
- **Span of Control:** HR Settings gains a full version-owned active staff list, Admin/KP RO assignment, SL-root trees, +/− branch controls and an unassigned list. Officers exclude OSOs and SLs; RO choices include SLs. Self-links, cycles and stale edits are rejected. Older versions explicitly initialize their staff snapshot; later Contacts changes do not replace it.
- **CCE EL / whole-level TGs:** one independent CCE EL TG per applicable level. New versions use that scope. Older versions can consolidate existing CCE EL assignments through a reviewed version edit; each distinct teacher is retained once. Whole-level TG controls stay on their own row. Existing unrelated assignments and regular Art class controls are retained.
- **IP Deploy:** venue-bound + TG moves to the bottom-right of the merged venue cell, including Compact mode. No venue-bound button appears on a whole-level standalone row.
- **Subject Load:** TTT is displayed as PD, with one column and legacy-key compatibility. Conflicting stored PD/TTT rates are flagged without overwriting either value. PD remains non-teaching and is counted from PLT membership.
- **Contacts:** Sys Admin has one bounded vertical scroll area covering all rows and its final note. Append-only contact saves no longer perform a whole-sheet backup or rename legacy headers. They reuse genuinely empty template rows, retain stable identities and save receipts, and preserve all existing records. Safe error references identify backend version, request and failed stage; drafts are retained.
- **2D layout/PDF:** Block K HDCP toilet labels and Blocks G/H Boys’/Girls’ toilet labels fit separate centered lines. Short toilet bands expand. Historical classroom glyphs are removed before current allocation labels are drawn, fixing the stray 6 beside B3-02B.
- **3D layout:** a rectangular through opening in the L2 floor between Hall and Block B, surrounded by a 1.05 m solid parapet. Both overlapping floor slabs and the underside canopy are cut. Nearby stairs, mid-floor and grilles remain intact. The footprint is approximate from the annotation, about 4.03 × 2.68 m.

## Remaining live verification

Q74 is not closed as a production incident. The hardened Contacts append path passes a synthetic 184-row, 18-column workbook fixture with legacy headers and retry checks. The exact cause of the earlier production exception and a successful save through the installed live application remain unverified. The already-inserted Jay record was not changed or inserted again.

Production software was not published. No new live staff, RO or deployment assignments were written during this release task.
