# GSiS v0.5.01

Authorized by the user's explicit “commit to v0.5.01” on 5 October 2026. Baseline: v0.5.0. Write protocol remains 500.

- Q134: Contacts uses staff rank by default. Selecting any column makes it the primary ascending/descending sort, including across inactive rows. Excel follows the displayed order.
- Q135: Levels, Subjects, Dept, Committees, CCAs, PLT and Events are independent columns with separate dropdown filters. Existing same-assignment Level/Subject matching remains.
- Q136: Desktop defaults to TTb Name, GSPS Email, CES Email, Mobile and FT.
- Q137: Contacts refits compact widths after every result render, including delayed teaching data, filtering, sorting and column changes. Header filter focus and selection are retained.
- Q138: Mobile defaults to TTb Name, Mobile and FT. Mobile text is one CSS pixel smaller. Existing panels, links, breakpoints and scrolling remain.
- Q139: Layout reads immutable, verified snapshots in its own Google Workspace workbook. Draft saves do not refresh it. Explicit Deploy publication records a durable handoff and copies the matching year. Failed transfers retain the previous head and can be retried. Removed records remain as Active N with stable IDs and retained snapshot history. Layout's former automatic unit rename route is retired; venues are edited in Deploy and explicitly republished.
- Q140: TG allocation is the third Layout page. The 2026 MTL seed preserves 59 groups, teacher labels, programme notes, pupil counts, source rows and form-class breakdowns. Source discrepancies remain visible. Initial 3CL6 uses C4-17; 5ML2 uses E3-12 with the source 5T mismatch flagged. Other TGs are copied from a matching published Deploy year.
- Q141: The previously created 2026 repository is integrated through a guarded preparation function. Its initial source import displays without a fabricated Deploy publication ID. The 3D bridge now accepts a distinct Layout revision while retaining the real nullable Deploy publication identity.

The prepared release requires installation. No live Apps Script web-app or Cloudflare deployment is changed by this commit.
