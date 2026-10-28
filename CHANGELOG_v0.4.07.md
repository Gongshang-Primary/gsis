# GSiS v0.4.07 — 28 September 2026

Prepared release for Contacts, Deploy and Layout. Not installed live.

- **Q62 Workload:** new Info page and version-scoped settings, a per-teacher subject ledger, FTT/teaching/non-teaching/total summaries, and P1–P6 subject totals. Distinct teacher/target/subject assignments count once; FT expands once into Assembly, FTGP and FTT. Staffed extra TGs add actual commitments; unstaffed TGs do not. Missing rates and unclassified assignments remain visibly incomplete.
- **Summary:** school-wide workload pills use inclusive ±10% bands for teachers without offload. Blue = below, green = standard, amber = above. Actual caps use FTT + teaching. Offload never discounts actual assignments. Individual offloaded targets remain pending.
- **Subject specific load:** default PE/Art/Music pools use all active matching subject modifiers; TL uses distinct active teachers assigned TL. Demand uses form-class counts for PE/Art/Music and defined TL groups for TL. Formula is T / retained capacity + FTT. Settings expose eligible subjects, pool and demand definitions. Named pool members and their retained factors make results traceable. Art + Music conflicts and shared specialist capacity are flagged rather than presented as ordinary references.
- **Q60 TG pencil popup:** rename, delete, remap, or apply to the whole level. Remapping explicitly asks to keep or clear that TG’s assignments. Whole-level conversion clears the class anchor and venue, retains teachers, and creates an isolated row even at a shared venue. Teacher records and unrelated assignments are preserved. Stale structural edits are rejected.
- **Q63 Contacts + row:** Admin-only new contact drafts. Normal save validates required fields and uniqueness, derives name/membership fields, reserves a stable ID, and supports exact receipt retries after interrupted saves. Opening a row does not create a backend record.
- **Q61 2D layout:** class/venue allocation labels share a fixed font size; crowded cells expand vertically through coordinated horizontal bands. Each class/TG is separately listed. Original architectural text retains its natural size and moves with the bands, avoiding distorted map labels. The shared renderer serves Deploy and public Layout.
- The prepared **v0.4.06 3D model is preserved**, including the Hall/Block B stair grilles. Changes to the model file are release labels only.

## Explicit follow-ups

PD allocation through PLT, duty weighting/fortnight frequency, individual offloaded-teacher targets, and mixed specialist capacity allocation still need decisions. TTT starts unclassified and can be classified in Workload settings. Different FTT rates across levels produce “Unavailable” instead of an invented average. No automatic reverse level-wide-to-form-class transition was requested.

All current production records and the published deployment snapshot remain unchanged by preparing this release.
