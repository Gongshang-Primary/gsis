# GSiS v0.4.01

Approved from the complete post-v0.4 request queue on 26 September 2026. This package updates all three frontends and both backends; building it does not change the live installation.

## Navigation and compact editing

- Often: IP Deploy, Dept, Committees, CCAs, Duty.
- Information: Summary, Layout.
- Right-aligned Program Settings: Classes, Subject Load, Dept, Committee, CCA.
- Right-aligned HR Settings: Teachers, Exclusions, Membership, Offload, HR Terms.
- Audit remains at the far right after its own divider. Settings sub-pages replace the flat settings strip.
- Membership is the renamed former Role Truth Table and the single editable source of truth; the duplicate page is removed.
- Subject Load is the former Load Settings table. Type numbers or `n/a` in the same compact cell; zero remains distinct.
- Group settings use direct, borderless in-cell editing without overlapping neighbouring columns.
- Offload's last column is labelled Delete.
- Dark text is used in Dept, Committees, CCAs and Duty body cells.
- Contacts retains the vertical Default / All / Clear filters stack, together matching two filter rows.

## Duty

- Entry and PDF share their column definitions; Recess duties run horizontally in individual columns.
- Fixed orange category headers, duty definitions/timings and weekday assignments follow the output's arrangement. Entry may scroll horizontally.
- Recurring weekday checkboxes and day-only duties remain available; adding a day-only Recess duty creates a corresponding column.
- One common Recess description appears on screen and in the PDF. New Recess duties inherit it.
- Existing one-teacher, overlap-blocking, one-period counting and optional-blank publication rules remain enforced.

## HR choices, loading and background operations

- Remove Shared choices. Each version owns its HR choice lists and Membership mappings.
- Publishing makes that version's choices definitive in Contacts. Saving drafts does not change Contacts; other versions keep independent choices.
- Retain and visibly flag staff terms removed from the choice list, without blocking publication.
- Birth-day and birth-month lists are fixed and shown without editing controls. Individual staff birth details retain their existing editing rules.
- Improve first-load reliability through concurrent configuration/session reads, one initial sync, aligned bounded read timeouts and a short common-payload cache.
- Check current access on every request; write validation stays live, and mutations invalidate the read cache.
- Requested Deploy/Contacts loads and saves continue while the tab is hidden; returning to a tab does not replay saves. Browser suspension, tab closure and device sleep remain outside that guarantee.

## 3D and Layout

- Block B L2: remove red-crossed guards, add cyan metal railing and green alternating parapet/rails, retain the rain cover.
- Playground stair: add marked upper-corner metal rails while preserving the L2 separation.
- Remove the extra playground cross rail and add the purple-marked solid upper corridor parapets.
- Square the exposed L2 L-shaped connector corner and align its guards with the perimeter.
- Fill the west Block K lift/stair seam through the whole vertical stack, keeping entrances clear.
- Remove the two marked Hall–Block B L2 rail bays; mirror the two-floor stair east–west and move its guarded side.
- Block J ISH washrooms: plain exterior façades and interior-facing toilet doors with matching hall-side access openings.
- Move the Layout notices beside search, remove the repeated frame heading, and use the remaining viewport height for the model. Full window and Pop out remain accessible.
- Synchronize visible system/model labels and release artifacts to v0.4.01.

Installation: follow DEPLOYMENT.md. Validation evidence and limits are recorded in VALIDATION.md inside the Source ZIP.
