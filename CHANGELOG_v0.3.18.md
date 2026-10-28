# GSiS v0.3.18

Committed from the queued requests in this chat, using v0.3.17 as the baseline.

- Contacts Edit Info: immediate read-only directory preview; elapsed fetch status and retry count; indeterminate fetch progress followed by actual row-render progress; progressive full-grid display; validation and edit permissions applied before unlocking. Refresh/recalculate/save cannot overlap loading. Contact and role tables are reused within the backend request to avoid repeated spreadsheet reads.
- Edit Info and Deploy Summary: one native scroll container, sticky header and first column. The duplicate bottom scrollbar is suppressed for these views.
- Summary: Total periods directly before Teaching periods, included in sorting and export. Provisional Teaching + FT duties; additional Duties remains undefined. Teaching caps unchanged.
- Playground stair: translated north 27 plan units, matching the B L2 corridor width. L3 raised playground stays fixed. L2 is a railed stair landing without a corridor connection. Separate roof, northwest sky opening, retained floors at removed wall locations, and an open metal gate onto L3.
- L2 B–K link: existing L-shaped alignment retained, alternating painted solid parapets and metal rails, closed northern end beside the separate stair. Crossed-out internal walls/rails removed with underlying slabs retained. A flush threshold at the eastern B opening connects the retained slab to the east–west path.
- K foyer lift: width reduced from 37 to 18.5 plan units, east edge fixed; door shifted east. Bypass floors at L1–L3; L3 route south, west, north into the playground apron.
- K hall-side stair: solid infill beside both sides of the stair; north entrance and lift approach retained.
- K L3–L6 rooms: no separate classroom corridor, end doors, widely open internal partitions represented by folded stacks. Individual IDs, allocation and selection preserved. L1/L2 classroom arrangements retained.

## Boundaries

No additional Duties calculation has been invented. The model remains a photo-based visualisation, not a surveyed construction model. Loading uses cached directory preview plus batched rendering after the existing response arrives; the backend does not stream rows. This package has not been uploaded to live sites or Apps Script deployments.
